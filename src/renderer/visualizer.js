import * as THREE from 'three';
import shaders from './shaders/index.js';
import SparkParticleSystem from './sparkParticleSystem.js';
import BubbleParticleSystem from './bubbleParticleSystem.js';

/**
 * Visualizer - Main Three.js visualization engine for music visualizer
 * Manages WebGL rendering, shader scenes, and audio-reactive uniforms
 */
export default class Visualizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.container = canvas.parentElement || document.body;

    // Initialize Three.js renderer (antialiasing disabled for performance on 4K)
    this.renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: false,
      alpha: false
    });
    // Use device pixel ratio for sharp rendering on high-DPI displays (capped at 2 for performance)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Set initial size based on CSS display size, not canvas buffer size
    this.renderer.setSize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight, false);

    // Create scene
    this.scene = new THREE.Scene();

    // Create orthographic camera for fullscreen quad
    // Perfect for fragment shader effects (-1 to 1 in both axes)
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Track current scene
    this.currentSceneIndex = 0;
    this.shaders = shaders.shaders;

    // Initialize uniforms object
    // Note: uResolution will be set correctly by handleResize() after init
    const pixelRatio = this.renderer.getPixelRatio();
    this.uniforms = {
      uTime: { value: 0.0 },
      uResolution: { value: new THREE.Vector2(window.innerWidth * pixelRatio, window.innerHeight * pixelRatio) },
      uBass: { value: 0.0 },
      uMid: { value: 0.0 },
      uTreble: { value: 0.0 },
      uEnergy: { value: 0.0 },
      uBeat: { value: 0.0 },
      uSpectrum: { value: null },
      // Webcam motion uniforms
      uMotionIntensity: { value: 0.0 },
      uMotionCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uMotionVelocity: { value: new THREE.Vector2(0.0, 0.0) },
      uMotionMode: { value: 0 },
      uMotionTexture: { value: null },
      uWebcamTexture: { value: null },
      // Motion Paint uniforms
      uPrevFrame: { value: null },
      uDeltaTime: { value: 0.016 },
      uPaintSensitivity: { value: 0.15 },
      uPaintColorSpeed: { value: 0.05 },
      uPaintFadeDelay: { value: 10.0 },
    };

    // Beat decay value for smooth beat response
    this.beatDecay = 0.95;

    // Create spectrum texture (512x1 DataTexture)
    this.spectrumSize = 512;
    this.spectrumData = new Uint8Array(this.spectrumSize);
    this.spectrumTexture = new THREE.DataTexture(
      this.spectrumData,
      this.spectrumSize,
      1,
      THREE.RedFormat,
      THREE.UnsignedByteType
    );
    this.spectrumTexture.minFilter = THREE.LinearFilter;
    this.spectrumTexture.magFilter = THREE.LinearFilter;
    this.spectrumTexture.needsUpdate = true;
    this.uniforms.uSpectrum.value = this.spectrumTexture;

    // Create motion texture (160x120 DataTexture for webcam motion data)
    this.motionWidth = 160;
    this.motionHeight = 120;
    this.motionData = new Uint8Array(this.motionWidth * this.motionHeight);
    this.motionTexture = new THREE.DataTexture(
      this.motionData,
      this.motionWidth,
      this.motionHeight,
      THREE.RedFormat,
      THREE.UnsignedByteType
    );
    this.motionTexture.minFilter = THREE.LinearFilter;
    this.motionTexture.magFilter = THREE.LinearFilter;
    this.motionTexture.needsUpdate = true;
    this.uniforms.uMotionTexture.value = this.motionTexture;

    // Create webcam texture (160x120 RGBA DataTexture for webcam video display)
    this.webcamData = new Uint8Array(this.motionWidth * this.motionHeight * 4);
    this.webcamTexture = new THREE.DataTexture(
      this.webcamData,
      this.motionWidth,
      this.motionHeight,
      THREE.RGBAFormat,
      THREE.UnsignedByteType
    );
    this.webcamTexture.minFilter = THREE.LinearFilter;
    this.webcamTexture.magFilter = THREE.LinearFilter;
    this.webcamTexture.needsUpdate = true;
    this.uniforms.uWebcamTexture.value = this.webcamTexture;

    // Create high-res webcam texture (1280x720 RGBA DataTexture for HD display)
    this.webcamHDWidth = 1280;
    this.webcamHDHeight = 720;
    this.webcamHDData = new Uint8Array(this.webcamHDWidth * this.webcamHDHeight * 4);
    this.webcamHDTexture = new THREE.DataTexture(
      this.webcamHDData,
      this.webcamHDWidth,
      this.webcamHDHeight,
      THREE.RGBAFormat,
      THREE.UnsignedByteType
    );
    this.webcamHDTexture.minFilter = THREE.LinearFilter;
    this.webcamHDTexture.magFilter = THREE.LinearFilter;
    this.webcamHDTexture.needsUpdate = true;
    this.uniforms.uWebcamTextureHD = { value: this.webcamHDTexture };
    this.uniforms.uWebcamHDResolution = { value: new THREE.Vector2(this.webcamHDWidth, this.webcamHDHeight) };

    // Create iPhone camera texture (will be set from img element)
    this.iphoneTexture = null;
    this.uniforms.uIPhoneTexture = { value: null };
    this.uniforms.uIPhoneResolution = { value: new THREE.Vector2(1280, 720) };

    // Create high-res iPhone texture (1280x720 RGBA DataTexture for HD display)
    this.iphoneHDWidth = 1280;
    this.iphoneHDHeight = 720;
    this.iphoneHDData = new Uint8Array(this.iphoneHDWidth * this.iphoneHDHeight * 4);
    this.iphoneHDTexture = new THREE.DataTexture(
      this.iphoneHDData,
      this.iphoneHDWidth,
      this.iphoneHDHeight,
      THREE.RGBAFormat,
      THREE.UnsignedByteType
    );
    this.iphoneHDTexture.minFilter = THREE.LinearFilter;
    this.iphoneHDTexture.magFilter = THREE.LinearFilter;
    this.iphoneHDTexture.needsUpdate = true;
    this.uniforms.uIPhoneTextureHD = { value: this.iphoneHDTexture };
    this.uniforms.uIPhoneHDResolution = { value: new THREE.Vector2(this.iphoneHDWidth, this.iphoneHDHeight) };
    this.uniforms.uIPhoneCORSEnabled = { value: 0.0 };

    // Create spark particle system for Trails mode
    this.sparkSystem = new SparkParticleSystem(2000);

    // Add spark particles mesh to scene (rendered on top of visualization)
    this.scene.add(this.sparkSystem.getMesh());

    // Create bubble particle system for Bubble Rain mode
    this.bubbleSystem = new BubbleParticleSystem(1500);

    // Add bubble particles mesh to scene (rendered on top of visualization)
    this.scene.add(this.bubbleSystem.getMesh());

    // Current mesh (fullscreen quad)
    this.mesh = null;

    // Ping-pong render targets for Motion Paint visualization
    this.pingPongTargets = null;
    this.currentTargetIndex = 0;
    this.lastFrameTime = performance.now();

    // Bind resize handler (called from index.js)
    this.handleResize = this.handleResize.bind(this);
  }

  /**
   * Initialize the visualizer with the first shader
   */
  init() {
    // Ensure sizes are synced
    this.handleResize();

    if (this.shaders.length > 0) {
      this.loadShader(this.shaders[0]);
    }
  }

  /**
   * Load a shader definition and create material with fullscreen quad
   * @param {Object} shaderDef - Shader definition with name, vertex, and fragment shaders
   */
  loadShader(shaderDef) {
    // Remove existing mesh if present
    if (this.mesh) {
      this.scene.remove(this.mesh);
      if (this.mesh.geometry) this.mesh.geometry.dispose();
      if (this.mesh.material) this.mesh.material.dispose();
    }

    // Clear ping-pong targets when switching to Motion Paint (fresh start)
    if (shaderDef.name === 'Motion Paint' && this.pingPongTargets) {
      this.clearPingPongTargets();
    }


    // Create shader material
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: shaderDef.vertexShader,
      fragmentShader: shaderDef.fragmentShader,
      side: THREE.FrontSide
    });

    // Create fullscreen quad (2x2 plane with orthographic camera)
    // This fills the screen perfectly from -1 to 1 in both dimensions
    const geometry = new THREE.PlaneGeometry(2, 2);
    this.mesh = new THREE.Mesh(geometry, material);

    // Add to scene
    this.scene.add(this.mesh);
  }

  /**
   * Switch to next visualization scene
   */
  nextScene() {
    this.currentSceneIndex = (this.currentSceneIndex + 1) % this.shaders.length;
    this.loadShader(this.shaders[this.currentSceneIndex]);
  }

  /**
   * Switch to previous visualization scene
   */
  prevScene() {
    this.currentSceneIndex = (this.currentSceneIndex - 1 + this.shaders.length) % this.shaders.length;
    this.loadShader(this.shaders[this.currentSceneIndex]);
  }

  /**
   * Alias for prevScene
   */
  previousScene() {
    this.prevScene();
  }

  /**
   * Set specific scene by index
   * @param {number} index - Scene index
   */
  setScene(index) {
    if (index >= 0 && index < this.shaders.length) {
      this.currentSceneIndex = index;
      this.loadShader(this.shaders[this.currentSceneIndex]);
    }
  }

  /**
   * Get array of scene names
   * @returns {string[]} Array of shader scene names
   */
  getSceneNames() {
    return this.shaders.map(shader => shader.name);
  }

  /**
   * Get current scene index
   * @returns {number} Current scene index
   */
  getCurrentSceneIndex() {
    return this.currentSceneIndex;
  }

  /**
   * Get current scene name
   * @returns {string} Current scene name
   */
  getCurrentSceneName() {
    if (this.shaders[this.currentSceneIndex]) {
      return this.shaders[this.currentSceneIndex].name;
    }
    return 'Unknown';
  }

  /**
   * Update uniforms from audio and motion analyzer data
   * @param {Object} audioData - Audio analysis data
   * @param {number} audioData.bass - Bass frequency level (0-1)
   * @param {number} audioData.mid - Mid frequency level (0-1)
   * @param {number} audioData.treble - Treble frequency level (0-1)
   * @param {number} audioData.energy - Overall energy level (0-1)
   * @param {boolean} audioData.beat - Beat detected flag
   * @param {Uint8Array} audioData.spectrum - Frequency spectrum data (typically 0-255)
   * @param {Object} motionData - Motion analysis data (optional)
   */
  update(audioData, motionData = null) {
    // Update time uniform (increment each frame)
    this.uniforms.uTime.value += 0.016; // ~60fps

    // Update audio frequency band uniforms
    this.uniforms.uBass.value = audioData.bass || 0;
    this.uniforms.uMid.value = audioData.mid || 0;
    this.uniforms.uTreble.value = audioData.treble || 0;
    this.uniforms.uEnergy.value = audioData.energy || 0;

    // Handle beat detection with smooth decay
    if (audioData.beat) {
      this.uniforms.uBeat.value = 1.0;

    } else {
      // Decay beat value smoothly
      this.uniforms.uBeat.value *= this.beatDecay;
    }

    // Update spectrum texture with new frequency data
    if (audioData.spectrum && audioData.spectrum.length > 0) {
      // Copy spectrum data, resizing if necessary
      const sourceLength = Math.min(audioData.spectrum.length, this.spectrumSize);
      for (let i = 0; i < sourceLength; i++) {
        this.spectrumData[i] = audioData.spectrum[i];
      }
      // Fill remaining with zeros if spectrum is smaller
      for (let i = sourceLength; i < this.spectrumSize; i++) {
        this.spectrumData[i] = 0;
      }
      this.spectrumTexture.needsUpdate = true;
    }

    // Update motion uniforms from webcam data
    if (motionData && motionData.mode > 0) {
      this.uniforms.uMotionIntensity.value = motionData.intensity || 0;
      this.uniforms.uMotionCenter.value.set(
        motionData.centerX || 0.5,
        motionData.centerY || 0.5
      );
      this.uniforms.uMotionVelocity.value.set(
        motionData.velocityX || 0,
        motionData.velocityY || 0
      );
      this.uniforms.uMotionMode.value = motionData.mode;

      // Update motion texture
      if (motionData.buffer && motionData.buffer.length > 0) {
        const sourceLength = Math.min(motionData.buffer.length, this.motionData.length);
        for (let i = 0; i < sourceLength; i++) {
          this.motionData[i] = motionData.buffer[i];
        }
        this.motionTexture.needsUpdate = true;
      }

      // Update webcam texture (RGBA frame)
      if (motionData.frameBuffer && motionData.frameBuffer.length > 0) {
        const sourceLength = Math.min(motionData.frameBuffer.length, this.webcamData.length);
        for (let i = 0; i < sourceLength; i++) {
          this.webcamData[i] = motionData.frameBuffer[i];
        }
        this.webcamTexture.needsUpdate = true;
      }

      // Update high-res webcam texture (HD RGBA frame)
      if (motionData.displayFrameBuffer && motionData.displayFrameBuffer.length > 0) {
        const sourceLength = Math.min(motionData.displayFrameBuffer.length, this.webcamHDData.length);
        for (let i = 0; i < sourceLength; i++) {
          this.webcamHDData[i] = motionData.displayFrameBuffer[i];
        }
        this.webcamHDTexture.needsUpdate = true;
      }

      // Trails mode (mode 3) - update spark particle system
      if (motionData.mode === 3) {
        const dt = 0.016;  // ~60fps
        this.sparkSystem.spawnFromMotion(
          motionData.buffer,
          motionData.width,
          motionData.height,
          motionData.velocityX || 0,
          motionData.velocityY || 0,
          motionData.intensity || 0,
          dt,
          motionData.centerX || 0.5,
          motionData.centerY || 0.5
        );
        this.sparkSystem.update(dt);
        this.sparkSystem.getMesh().visible = true;
      } else {
        // Not in trails mode - hide spark mesh
        this.sparkSystem.getMesh().visible = false;
      }

      // Bubble Rain mode - update bubble particle system
      if (this.getCurrentSceneName() === 'Bubble Rain') {
        const dt = 0.016;  // ~60fps
        this.bubbleSystem.update(
          dt,
          motionData.buffer,
          motionData.width,
          motionData.height
        );
        this.bubbleSystem.getMesh().visible = true;
      } else {
        this.bubbleSystem.getMesh().visible = false;
      }
    } else {
      // Motion off - decay values smoothly
      this.uniforms.uMotionIntensity.value *= 0.9;
      this.uniforms.uMotionMode.value = 0;

      // Hide sparks and let them fade out
      if (this.sparkSystem.getActiveCount() > 0) {
        this.sparkSystem.update(0.016);
      } else {
        this.sparkSystem.getMesh().visible = false;
      }

      // Update bubbles even without motion (they still fall with gravity)
      if (this.getCurrentSceneName() === 'Bubble Rain') {
        this.bubbleSystem.update(0.016, null, 0, 0);
        this.bubbleSystem.getMesh().visible = true;
      } else {
        this.bubbleSystem.getMesh().visible = false;
      }
    }
  }

  /**
   * Initialize ping-pong render targets for Motion Paint
   */
  initPingPongTargets() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.pingPongTargets = [
      new THREE.WebGLRenderTarget(width, height, {
        format: THREE.RGBAFormat,
        type: THREE.FloatType,  // For age precision in alpha
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter
      }),
      new THREE.WebGLRenderTarget(width, height, {
        format: THREE.RGBAFormat,
        type: THREE.FloatType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter
      })
    ];
  }

  /**
   * Clear ping-pong targets to black (fresh start)
   */
  clearPingPongTargets() {
    if (this.pingPongTargets) {
      const prevClearColor = this.renderer.getClearColor(new THREE.Color());
      const prevClearAlpha = this.renderer.getClearAlpha();

      this.renderer.setClearColor(0x000000, 0);

      this.renderer.setRenderTarget(this.pingPongTargets[0]);
      this.renderer.clear();
      this.renderer.setRenderTarget(this.pingPongTargets[1]);
      this.renderer.clear();
      this.renderer.setRenderTarget(null);

      this.renderer.setClearColor(prevClearColor, prevClearAlpha);
    }
  }

  /**
   * Dispose ping-pong targets
   */
  disposePingPongTargets() {
    if (this.pingPongTargets) {
      this.pingPongTargets[0].dispose();
      this.pingPongTargets[1].dispose();
      this.pingPongTargets = null;
    }
  }

  /**
   * Update iPhone camera texture from image element
   * Uses canvas as intermediary for MJPEG streams
   * @param {HTMLImageElement} imgElement - Image element streaming MJPEG
   */
  updateIPhoneTexture(imgElement) {
    if (!imgElement || imgElement.naturalWidth === 0) {
      return;
    }

    const width = imgElement.naturalWidth;
    const height = imgElement.naturalHeight;

    // Create canvas and texture if not exists
    if (!this.iphoneCanvas) {
      this.iphoneCanvas = document.createElement('canvas');
      this.iphoneCtx = this.iphoneCanvas.getContext('2d');
    }

    // Resize canvas if needed
    if (this.iphoneCanvas.width !== width || this.iphoneCanvas.height !== height) {
      this.iphoneCanvas.width = width;
      this.iphoneCanvas.height = height;
    }

    // Draw image to canvas (this captures the current MJPEG frame)
    this.iphoneCtx.drawImage(imgElement, 0, 0);

    // Create texture from canvas if not exists
    if (!this.iphoneTexture) {
      this.iphoneTexture = new THREE.CanvasTexture(this.iphoneCanvas);
      this.iphoneTexture.minFilter = THREE.LinearFilter;
      this.iphoneTexture.magFilter = THREE.LinearFilter;
      this.uniforms.uIPhoneTexture.value = this.iphoneTexture;
    }

    // Update resolution uniform
    this.uniforms.uIPhoneResolution.value.set(width, height);

    // Mark texture for update
    this.iphoneTexture.needsUpdate = true;
  }

  /**
   * Update iPhone HD texture from image element (CORS mode)
   * @param {HTMLImageElement} imgElement - Image element streaming MJPEG
   */
  updateIPhoneHDTexture(imgElement) {
    if (!imgElement || imgElement.naturalWidth === 0) {
      return;
    }

    const width = imgElement.naturalWidth;
    const height = imgElement.naturalHeight;

    // Create canvas if not exists
    if (!this.iphoneHDCanvas) {
      this.iphoneHDCanvas = document.createElement('canvas');
      this.iphoneHDCtx = this.iphoneHDCanvas.getContext('2d', { willReadFrequently: true });
    }

    // Resize canvas if needed
    if (this.iphoneHDCanvas.width !== width || this.iphoneHDCanvas.height !== height) {
      this.iphoneHDCanvas.width = width;
      this.iphoneHDCanvas.height = height;

      // Resize HD texture data if needed
      if (width !== this.iphoneHDWidth || height !== this.iphoneHDHeight) {
        this.iphoneHDWidth = width;
        this.iphoneHDHeight = height;
        this.iphoneHDData = new Uint8Array(width * height * 4);
        this.iphoneHDTexture.dispose();
        this.iphoneHDTexture = new THREE.DataTexture(
          this.iphoneHDData,
          width,
          height,
          THREE.RGBAFormat,
          THREE.UnsignedByteType
        );
        this.iphoneHDTexture.minFilter = THREE.LinearFilter;
        this.iphoneHDTexture.magFilter = THREE.LinearFilter;
        this.uniforms.uIPhoneTextureHD.value = this.iphoneHDTexture;
      }
    }

    // Draw image to canvas
    this.iphoneHDCtx.drawImage(imgElement, 0, 0);

    // Get pixel data and update texture
    const imageData = this.iphoneHDCtx.getImageData(0, 0, width, height);
    this.iphoneHDData.set(imageData.data);
    this.iphoneHDTexture.needsUpdate = true;

    // Update resolution uniform
    this.uniforms.uIPhoneHDResolution.value.set(width, height);
  }

  /**
   * Update iPhone texture from IPhoneCameraSource motion data (CORS mode)
   * @param {Object} iphoneMotionData - Motion data from IPhoneCameraSource.getMotionData()
   */
  updateIPhoneTextureFromMotionData(iphoneMotionData) {
    if (!iphoneMotionData || !iphoneMotionData.displayFrameBuffer) {
      return;
    }

    // Enable CORS mode in shader
    this.uniforms.uIPhoneCORSEnabled.value = 1.0;

    // Update HD resolution
    this.uniforms.uIPhoneHDResolution.value.set(
      iphoneMotionData.displayWidth || 1280,
      iphoneMotionData.displayHeight || 720
    );

    // Update HD texture with frame buffer
    if (iphoneMotionData.displayFrameBuffer.length > 0) {
      const sourceLength = Math.min(iphoneMotionData.displayFrameBuffer.length, this.iphoneHDData.length);
      for (let i = 0; i < sourceLength; i++) {
        this.iphoneHDData[i] = iphoneMotionData.displayFrameBuffer[i];
      }
      this.iphoneHDTexture.needsUpdate = true;
    }
  }

  /**
   * Set iPhone CORS mode enabled state
   * @param {boolean} enabled - Whether CORS is enabled
   */
  setIPhoneCORSEnabled(enabled) {
    this.uniforms.uIPhoneCORSEnabled.value = enabled ? 1.0 : 0.0;
  }

  /**
   * Render the current scene
   */
  render() {
    const currentSceneName = this.shaders[this.currentSceneIndex].name;
    const isMotionPaint = currentSceneName === 'Motion Paint';

    // Update delta time
    const now = performance.now();
    this.uniforms.uDeltaTime.value = (now - this.lastFrameTime) / 1000;
    this.lastFrameTime = now;

    if (isMotionPaint) {
      // Initialize ping-pong targets if needed
      if (!this.pingPongTargets) {
        this.initPingPongTargets();
        this.clearPingPongTargets();
      }

      // Set previous frame uniform
      const prevTarget = this.pingPongTargets[this.currentTargetIndex];
      const nextTarget = this.pingPongTargets[1 - this.currentTargetIndex];
      this.uniforms.uPrevFrame.value = prevTarget.texture;

      // Render to next target (accumulate state)
      this.renderer.setRenderTarget(nextTarget);
      this.renderer.render(this.scene, this.camera);

      // Now render to screen using the accumulated result
      this.uniforms.uPrevFrame.value = nextTarget.texture;
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);

      // Swap targets for next frame
      this.currentTargetIndex = 1 - this.currentTargetIndex;
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /**
   * Handle window resize events
   */
  handleResize() {
    // Get the actual displayed size of the canvas (CSS pixels)
    const displayWidth = this.canvas.clientWidth;
    const displayHeight = this.canvas.clientHeight;

    // Account for pixel ratio when checking if resize is needed
    // canvas.width/height is the drawing buffer size (physical pixels)
    const pixelRatio = this.renderer.getPixelRatio();
    const bufferWidth = Math.floor(displayWidth * pixelRatio);
    const bufferHeight = Math.floor(displayHeight * pixelRatio);
    const needResize = this.canvas.width !== bufferWidth || this.canvas.height !== bufferHeight;

    if (needResize) {
      // Update renderer size (this also sets canvas.width and canvas.height)
      this.renderer.setSize(displayWidth, displayHeight, false);
    }

    // Update resolution uniform to match actual drawing buffer size (physical pixels)
    // gl_FragCoord in shaders uses physical pixels, so uResolution must match
    this.uniforms.uResolution.value.set(bufferWidth, bufferHeight);

    // Recreate ping-pong targets at new size if they exist
    if (needResize && this.pingPongTargets) {
      this.disposePingPongTargets();
      this.initPingPongTargets();
      this.clearPingPongTargets();
    }

  }

  /**
   * Adjust spark density (for Trails mode)
   * @param {number} delta - Amount to adjust density by
   * @returns {number} New density value
   */
  adjustSparkDensity(delta) {
    if (this.sparkSystem) {
      return this.sparkSystem.adjustDensity(delta);
    }
    return 1.0;
  }

  /**
   * Get current spark density
   * @returns {number} Current density value
   */
  getSparkDensity() {
    if (this.sparkSystem) {
      return this.sparkSystem.getDensity();
    }
    return 1.0;
  }

  /**
   * Cycle spark color mode (for Trails mode)
   * @returns {string} New color mode name
   */
  cycleSparkColorMode() {
    if (this.sparkSystem) {
      return this.sparkSystem.cycleColorMode();
    }
    return 'Fire';
  }

  /**
   * Get current spark color mode name
   * @returns {string} Color mode name
   */
  getSparkColorModeName() {
    if (this.sparkSystem) {
      return this.sparkSystem.getColorModeName();
    }
    return 'Fire';
  }

  /**
   * Clean up WebGL resources
   */
  destroy() {
    // Dispose mesh resources
    if (this.mesh) {
      if (this.mesh.geometry) this.mesh.geometry.dispose();
      if (this.mesh.material) this.mesh.material.dispose();
      this.scene.remove(this.mesh);
    }

    // Dispose spectrum texture
    if (this.spectrumTexture) {
      this.spectrumTexture.dispose();
    }

    // Dispose motion texture
    if (this.motionTexture) {
      this.motionTexture.dispose();
    }

    // Dispose webcam textures
    if (this.webcamTexture) {
      this.webcamTexture.dispose();
    }
    if (this.webcamHDTexture) {
      this.webcamHDTexture.dispose();
    }

    // Dispose iPhone texture and canvas
    if (this.iphoneTexture) {
      this.iphoneTexture.dispose();
      this.iphoneTexture = null;
    }
    if (this.iphoneHDTexture) {
      this.iphoneHDTexture.dispose();
    }
    this.iphoneCanvas = null;
    this.iphoneCtx = null;

    // Dispose spark system
    if (this.sparkSystem) {
      this.sparkSystem.dispose();
    }

    // Dispose bubble system
    if (this.bubbleSystem) {
      this.bubbleSystem.dispose();
    }

    // Dispose ping-pong targets
    this.disposePingPongTargets();

    // Dispose renderer
    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement && this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
    }
  }
}
