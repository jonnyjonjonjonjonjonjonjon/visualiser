/**
 * IPhoneCameraSource - MJPEG stream handler for iPhone camera
 *
 * Connects to an MJPEG stream from an iPhone app (ipCam, StreamIt, etc.)
 * Tries CORS mode first for full motion effects support, falls back to
 * display-only mode if CORS is blocked.
 */
export default class IPhoneCameraSource {
  constructor() {
    this.streamUrl = null;
    this.proxyUrl = null;
    this.imgElement = null;
    this.isConnected = false;
    this.connectionError = null;

    // CORS and motion detection support
    this.corsEnabled = false;
    this.canvas = null;
    this.ctx = null;
    this.previousFrame = null;
    this.currentFrame = null;
    this.motionBuffer = null;
    this.frameBuffer = null;

    // High-res display capture
    this.displayWidth = 1280;
    this.displayHeight = 720;
    this.displayCanvas = null;
    this.displayCtx = null;
    this.displayFrameBuffer = null;

    // Motion metrics (same as WebcamAnalyzer)
    this.motionIntensity = 0;
    this.motionCenterX = 0.5;
    this.motionCenterY = 0.5;
    this.motionVelocityX = 0;
    this.motionVelocityY = 0;

    // Settings (match WebcamAnalyzer)
    this.captureWidth = 160;
    this.captureHeight = 120;
    this.motionThreshold = 15;
    this.smoothingFactor = 0.5;
    this.trailDecay = 0.92;
    this.mode = 0;  // 0=off, 1=push, 2=predator, 3=trails
    this.modeNames = ['Off', 'Push/Displace', 'Predator', 'Trails'];
  }

  /**
   * Connect to an MJPEG stream URL
   * Uses Electron proxy to bypass CORS, enabling motion detection
   * @param {string} url - The MJPEG stream URL (e.g., http://192.168.1.100:8080/video)
   * @returns {Promise<void>}
   */
  async connect(url) {
    if (this.isConnected) {
      this.disconnect();
    }

    this.streamUrl = url;
    this.connectionError = null;
    this.proxyUrl = null;

    // Try to use Electron proxy for CORS bypass
    if (window.electronAPI && window.electronAPI.startMjpegProxy) {
      try {
        console.log('Starting MJPEG proxy for:', url);
        const result = await window.electronAPI.startMjpegProxy(url);

        if (result.success && result.proxyUrl) {
          this.proxyUrl = result.proxyUrl;
          console.log('Proxy started at:', this.proxyUrl);

          // Connect via proxy with CORS enabled
          const corsImg = new Image();
          corsImg.crossOrigin = 'anonymous';

          const proxyWorks = await new Promise((resolve) => {
            let resolved = false;

            corsImg.onload = () => {
              if (!resolved) {
                resolved = true;
                resolve(true);
              }
            };

            corsImg.onerror = () => {
              if (!resolved) {
                resolved = true;
                resolve(false);
              }
            };

            corsImg.src = this.proxyUrl;

            // Timeout after 5 seconds
            setTimeout(() => {
              if (!resolved) {
                resolved = true;
                resolve(false);
              }
            }, 5000);
          });

          if (proxyWorks) {
            this.corsEnabled = true;
            this.imgElement = corsImg;
            this.initMotionDetection();
            this.isConnected = true;
            console.log('iPhone camera connected via proxy - motion effects available');
            return;
          } else {
            console.warn('Proxy connection failed, falling back to direct');
            // Stop the proxy since it didn't work
            await window.electronAPI.stopMjpegProxy();
            this.proxyUrl = null;
          }
        }
      } catch (err) {
        console.warn('Proxy setup failed:', err);
        this.proxyUrl = null;
      }
    }

    // Fall back to direct connection (display only, no motion effects)
    console.log('Using direct connection (display only mode)');
    this.corsEnabled = false;
    this.imgElement = new Image();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.connectionError = 'Connection timeout - could not load stream';
        reject(new Error(this.connectionError));
      }, 10000);

      this.imgElement.onload = () => {
        clearTimeout(timeout);
        this.isConnected = true;
        resolve();
      };

      this.imgElement.onerror = () => {
        clearTimeout(timeout);
        this.connectionError = 'Failed to connect - check URL and network';
        reject(new Error(this.connectionError));
      };

      this.imgElement.src = url;
    });
  }

  /**
   * Initialize motion detection buffers (only called if CORS works)
   */
  initMotionDetection() {
    // Create low-res canvas for motion detection
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.captureWidth;
    this.canvas.height = this.captureHeight;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

    // Create high-res canvas for display
    this.displayCanvas = document.createElement('canvas');
    this.displayCanvas.width = this.displayWidth;
    this.displayCanvas.height = this.displayHeight;
    this.displayCtx = this.displayCanvas.getContext('2d', { willReadFrequently: true });

    // Initialize frame buffers
    const pixelCount = this.captureWidth * this.captureHeight;
    this.previousFrame = new Uint8ClampedArray(pixelCount);
    this.currentFrame = new Uint8ClampedArray(pixelCount);
    this.motionBuffer = new Uint8ClampedArray(pixelCount);
    this.frameBuffer = new Uint8ClampedArray(pixelCount * 4);

    // High-res display buffer
    const displayPixelCount = this.displayWidth * this.displayHeight;
    this.displayFrameBuffer = new Uint8ClampedArray(displayPixelCount * 4);
  }

  /**
   * Analyze current frame and compute motion data
   * Same algorithm as WebcamAnalyzer
   */
  analyzeFrame() {
    if (!this.corsEnabled || !this.imgElement || this.mode === 0) {
      return;
    }

    try {
      // Draw image to low-res canvas for motion detection (no mirroring for iPhone)
      this.ctx.drawImage(this.imgElement, 0, 0, this.captureWidth, this.captureHeight);

      // Draw to high-res canvas for display
      this.displayCtx.drawImage(this.imgElement, 0, 0, this.displayWidth, this.displayHeight);

      // Get pixel data for motion detection
      const imageData = this.ctx.getImageData(0, 0, this.captureWidth, this.captureHeight);
      const pixels = imageData.data;

      // Copy low-res RGBA frame data
      this.frameBuffer.set(pixels);

      // Capture high-res frame for display
      const displayImageData = this.displayCtx.getImageData(0, 0, this.displayWidth, this.displayHeight);
      this.displayFrameBuffer.set(displayImageData.data);

      // Swap frame buffers
      const temp = this.previousFrame;
      this.previousFrame = this.currentFrame;
      this.currentFrame = temp;

      // Motion analysis accumulators
      let totalMotion = 0;
      let weightedX = 0;
      let weightedY = 0;
      let motionPixelCount = 0;

      // Process each pixel
      for (let i = 0; i < pixels.length; i += 4) {
        const pixelIndex = i / 4;
        const x = pixelIndex % this.captureWidth;
        const y = Math.floor(pixelIndex / this.captureWidth);

        // Convert to grayscale (luminance formula)
        const gray = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
        this.currentFrame[pixelIndex] = gray;

        // Frame difference
        const diff = Math.abs(this.currentFrame[pixelIndex] - this.previousFrame[pixelIndex]);

        // Threshold and store motion
        if (diff > this.motionThreshold) {
          const motionValue = Math.min(255, diff * 3);
          this.motionBuffer[pixelIndex] = Math.max(this.motionBuffer[pixelIndex], motionValue);
          totalMotion += diff;
          weightedX += x * diff;
          weightedY += y * diff;
          motionPixelCount++;
        } else {
          // Decay existing motion (for trails mode persistence)
          this.motionBuffer[pixelIndex] = Math.floor(this.motionBuffer[pixelIndex] * this.trailDecay);
        }
      }

      // Compute motion metrics with temporal smoothing
      const maxPossibleMotion = this.captureWidth * this.captureHeight * 128;
      const rawIntensity = Math.min(1, totalMotion / maxPossibleMotion * 25);
      this.motionIntensity = this.motionIntensity * this.smoothingFactor +
                             rawIntensity * (1 - this.smoothingFactor);

      if (totalMotion > 0 && motionPixelCount > 10) {
        const rawCenterX = weightedX / totalMotion / this.captureWidth;
        const rawCenterY = weightedY / totalMotion / this.captureHeight;

        // Compute velocity as change in center position
        const newVelocityX = (rawCenterX - this.motionCenterX) * 15;
        const newVelocityY = (rawCenterY - this.motionCenterY) * 15;

        // Smooth center and velocity
        this.motionVelocityX = this.motionVelocityX * this.smoothingFactor +
                               newVelocityX * (1 - this.smoothingFactor);
        this.motionVelocityY = this.motionVelocityY * this.smoothingFactor +
                               newVelocityY * (1 - this.smoothingFactor);

        this.motionCenterX = this.motionCenterX * this.smoothingFactor +
                             rawCenterX * (1 - this.smoothingFactor);
        this.motionCenterY = this.motionCenterY * this.smoothingFactor +
                             rawCenterY * (1 - this.smoothingFactor);
      } else {
        // Decay velocity when no significant motion
        this.motionVelocityX *= 0.9;
        this.motionVelocityY *= 0.9;
      }
    } catch (e) {
      // CORS error can occur if server configuration changes
      console.warn('Motion analysis failed (CORS?):', e.message);
    }
  }

  /**
   * Get motion data for visualizer
   * @returns {Object|null} Motion data object or null if not available
   */
  getMotionData() {
    if (!this.corsEnabled || this.mode === 0) {
      return null;
    }

    this.analyzeFrame();

    return {
      intensity: this.motionIntensity,
      centerX: this.motionCenterX,
      centerY: 1.0 - this.motionCenterY,  // Flip Y for shader coordinates
      velocityX: Math.max(-1, Math.min(1, this.motionVelocityX)),
      velocityY: Math.max(-1, Math.min(1, -this.motionVelocityY)),  // Flip Y
      mode: this.mode,
      buffer: this.motionBuffer,
      frameBuffer: this.frameBuffer,
      width: this.captureWidth,
      height: this.captureHeight,
      // High-res display data
      displayFrameBuffer: this.displayFrameBuffer,
      displayWidth: this.displayWidth,
      displayHeight: this.displayHeight
    };
  }

  /**
   * Cycle through camera modes
   * @returns {string} New mode name or error message
   */
  cycleMode() {
    if (!this.corsEnabled) {
      return 'Effects unavailable (CORS)';
    }

    this.mode = (this.mode + 1) % 4;

    // Clear motion buffer when turning off
    if (this.mode === 0 && this.motionBuffer) {
      this.motionBuffer.fill(0);
      this.motionIntensity = 0;
      this.motionVelocityX = 0;
      this.motionVelocityY = 0;
    }

    return this.modeNames[this.mode];
  }

  /**
   * Check if CORS mode is available
   * @returns {boolean}
   */
  hasCORS() {
    return this.corsEnabled;
  }

  /**
   * Get current mode
   * @returns {number}
   */
  getMode() {
    return this.mode;
  }

  /**
   * Get current mode name
   * @returns {string}
   */
  getModeName() {
    return this.modeNames[this.mode];
  }

  /**
   * Check if motion effects are active (mode > 0 and CORS available)
   * @returns {boolean}
   */
  isActive() {
    return this.corsEnabled && this.mode > 0;
  }

  /**
   * Get the image element for direct use as texture source
   * @returns {HTMLImageElement|null}
   */
  getImageElement() {
    return this.imgElement;
  }

  /**
   * Get image dimensions
   * @returns {Object} Width and height
   */
  getDimensions() {
    if (!this.imgElement) {
      return { width: 1280, height: 720 };
    }
    return {
      width: this.imgElement.naturalWidth || 1280,
      height: this.imgElement.naturalHeight || 720
    };
  }

  /**
   * Check if connected and streaming
   * @returns {boolean}
   */
  isStreaming() {
    return this.isConnected && this.imgElement !== null;
  }

  /**
   * Get connection error message if any
   * @returns {string|null}
   */
  getError() {
    return this.connectionError;
  }

  /**
   * Get stream URL
   * @returns {string|null}
   */
  getUrl() {
    return this.streamUrl;
  }

  /**
   * Disconnect from stream
   */
  disconnect() {
    if (this.imgElement) {
      this.imgElement.src = '';
      this.imgElement = null;
    }

    // Stop proxy if running
    if (this.proxyUrl && window.electronAPI && window.electronAPI.stopMjpegProxy) {
      window.electronAPI.stopMjpegProxy().catch(err => {
        console.warn('Error stopping proxy:', err);
      });
    }
    this.proxyUrl = null;

    // Clear motion detection resources
    this.canvas = null;
    this.ctx = null;
    this.displayCanvas = null;
    this.displayCtx = null;
    this.previousFrame = null;
    this.currentFrame = null;
    this.motionBuffer = null;
    this.frameBuffer = null;
    this.displayFrameBuffer = null;

    // Reset state
    this.isConnected = false;
    this.corsEnabled = false;
    this.streamUrl = null;
    this.connectionError = null;
    this.mode = 0;
    this.motionIntensity = 0;
    this.motionCenterX = 0.5;
    this.motionCenterY = 0.5;
    this.motionVelocityX = 0;
    this.motionVelocityY = 0;
  }

  /**
   * Clean up all resources
   */
  destroy() {
    this.disconnect();
  }
}
