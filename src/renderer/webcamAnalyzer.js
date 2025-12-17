/**
 * WebcamAnalyzer - Motion detection via frame differencing
 *
 * Captures webcam frames, computes motion vectors and intensity,
 * outputs data for music visualizer shader uniforms.
 */
export default class WebcamAnalyzer {
  constructor() {
    // Video capture elements
    this.video = null;
    this.canvas = null;
    this.ctx = null;

    // Frame buffers for differencing
    this.previousFrame = null;
    this.currentFrame = null;
    this.motionBuffer = null;

    // Output metrics (all normalized 0-1 or -1 to 1)
    this.motionIntensity = 0;
    this.motionCenterX = 0.5;
    this.motionCenterY = 0.5;
    this.motionVelocityX = 0;
    this.motionVelocityY = 0;

    // Configuration - motion detection (low-res for performance)
    this.captureWidth = 160;
    this.captureHeight = 120;
    this.motionThreshold = 15;      // Lower = more sensitive
    this.smoothingFactor = 0.5;     // Lower = more responsive
    this.trailDecay = 0.92;         // Higher = longer trails

    // High-res display capture
    this.displayWidth = 1280;
    this.displayHeight = 720;
    this.displayCanvas = null;
    this.displayCtx = null;
    this.displayFrameBuffer = null;

    // State
    this.isInitialized = false;
    this.mode = 0;  // 0=off, 1=push, 2=predator, 3=trails
    this.modeNames = ['Off', 'Push/Displace', 'Predator', 'Trails'];
    this.stream = null;
  }

  /**
   * Initialize webcam capture and buffers
   * @returns {Promise<void>}
   */
  async init() {
    if (this.isInitialized) {
      console.warn('WebcamAnalyzer already initialized');
      return;
    }

    // Create hidden video element
    this.video = document.createElement('video');
    this.video.setAttribute('playsinline', '');
    this.video.setAttribute('autoplay', '');
    this.video.setAttribute('muted', '');
    this.video.style.display = 'none';
    document.body.appendChild(this.video);

    // Create offscreen canvas for motion detection (low-res)
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
    this.frameBuffer = new Uint8ClampedArray(pixelCount * 4);  // RGBA for low-res webcam

    // High-res display buffer
    const displayPixelCount = this.displayWidth * this.displayHeight;
    this.displayFrameBuffer = new Uint8ClampedArray(displayPixelCount * 4);

    // Request webcam access at high resolution
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: this.displayWidth },
        height: { ideal: this.displayHeight },
        facingMode: 'user'
      }
    });

    this.video.srcObject = this.stream;
    await this.video.play();

    this.isInitialized = true;
  }

  /**
   * Analyze current frame and compute motion data
   * Core frame differencing algorithm
   */
  analyzeFrame() {
    if (!this.isInitialized || this.mode === 0) {
      return;
    }

    // Draw mirrored video frame to low-res canvas for motion detection
    this.ctx.save();
    this.ctx.scale(-1, 1);
    this.ctx.drawImage(this.video, -this.captureWidth, 0, this.captureWidth, this.captureHeight);
    this.ctx.restore();

    // Draw mirrored video frame to high-res canvas for display
    this.displayCtx.save();
    this.displayCtx.scale(-1, 1);
    this.displayCtx.drawImage(this.video, -this.displayWidth, 0, this.displayWidth, this.displayHeight);
    this.displayCtx.restore();

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
  }

  /**
   * Get motion data for visualizer
   * @returns {Object} Motion data object
   */
  getMotionData() {
    this.analyzeFrame();

    return {
      intensity: this.motionIntensity,
      centerX: this.motionCenterX,
      centerY: 1.0 - this.motionCenterY,  // Flip Y for shader coordinates
      velocityX: Math.max(-1, Math.min(1, this.motionVelocityX)),
      velocityY: Math.max(-1, Math.min(1, -this.motionVelocityY)),  // Flip Y
      mode: this.mode,
      buffer: this.motionBuffer,
      frameBuffer: this.frameBuffer,  // Low-res RGBA webcam frame
      width: this.captureWidth,
      height: this.captureHeight,
      // High-res display data
      displayFrameBuffer: this.displayFrameBuffer,
      displayWidth: this.displayWidth,
      displayHeight: this.displayHeight
    };
  }

  /**
   * Cycle through webcam modes
   * @returns {string} New mode name
   */
  cycleMode() {
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
   * Get current mode name
   * @returns {string} Mode name
   */
  getModeName() {
    return this.modeNames[this.mode];
  }

  /**
   * Get current mode index
   * @returns {number} Mode index (0, 1, or 2)
   */
  getMode() {
    return this.mode;
  }

  /**
   * Check if webcam is active (mode > 0)
   * @returns {boolean}
   */
  isActive() {
    return this.mode > 0;
  }

  /**
   * Clean up resources
   */
  destroy() {
    // Stop video stream
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    // Remove video element
    if (this.video && this.video.parentNode) {
      this.video.parentNode.removeChild(this.video);
      this.video = null;
    }

    // Clear buffers
    this.previousFrame = null;
    this.currentFrame = null;
    this.motionBuffer = null;
    this.frameBuffer = null;
    this.canvas = null;
    this.ctx = null;

    // Clear high-res display buffers
    this.displayFrameBuffer = null;
    this.displayCanvas = null;
    this.displayCtx = null;

    this.isInitialized = false;
  }
}
