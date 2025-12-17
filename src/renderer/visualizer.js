import * as THREE from 'three';
import shaders from './shaders/index.js';
import SparkParticleSystem from './sparkParticleSystem.js';

/**
 * Visualizer - Main Three.js visualization engine for music visualizer
 * Manages WebGL rendering, shader scenes, and audio-reactive uniforms
 */
export default class Visualizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.container = canvas.parentElement || document.body;

    // Initialize Three.js renderer with antialiasing, using existing canvas
    this.renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: false
    });
    // Use pixel ratio of 1 for consistent behavior
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(canvas.width, canvas.height);

    // Create scene
    this.scene = new THREE.Scene();

    // Create orthographic camera for fullscreen quad
    // Perfect for fragment shader effects (-1 to 1 in both axes)
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Track current scene
    this.currentSceneIndex = 0;
    this.shaders = shaders.shaders;

    // Initialize uniforms object
    this.uniforms = {
      uTime: { value: 0.0 },
      uResolution: { value: new THREE.Vector2(this.container.clientWidth, this.container.clientHeight) },
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
      // Spark particle uniforms
      uSparkTexture: { value: null },
      uSparkVelocityTexture: { value: null },
      uSparkColorMode: { value: 0 },
      uSparkActiveCount: { value: 0.0 }
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

    // Create spark particle system for Trails mode
    this.sparkSystem = new SparkParticleSystem(2000);
    this.uniforms.uSparkTexture.value = this.sparkSystem.getTexture();
    this.uniforms.uSparkVelocityTexture.value = this.sparkSystem.getVelocityTexture();

    // Current mesh (fullscreen quad)
    this.mesh = null;

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

    // Create shader material
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: shaderDef.vertexShader,
      fragmentShader: shaderDef.fragmentShader,
      side: THREE.DoubleSide
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
          dt
        );
        this.sparkSystem.update(dt);

        // Update spark uniforms
        this.uniforms.uSparkTexture.value = this.sparkSystem.getTexture();
        this.uniforms.uSparkVelocityTexture.value = this.sparkSystem.getVelocityTexture();
        this.uniforms.uSparkColorMode.value = this.sparkSystem.getColorMode();
        this.uniforms.uSparkActiveCount.value = this.sparkSystem.getActiveCount();
      }
    } else {
      // Motion off - decay values smoothly
      this.uniforms.uMotionIntensity.value *= 0.9;
      this.uniforms.uMotionMode.value = 0;

      // Clear sparks when motion is off
      if (this.sparkSystem.getActiveCount() > 0) {
        this.sparkSystem.update(0.016);
        this.uniforms.uSparkActiveCount.value = this.sparkSystem.getActiveCount();
      }
    }
  }

  /**
   * Render the current scene
   */
  render() {
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Handle window resize events
   */
  handleResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Update canvas and renderer
    this.canvas.width = width;
    this.canvas.height = height;
    this.renderer.setSize(width, height, false);

    // Update resolution uniform to match
    this.uniforms.uResolution.value.set(width, height);
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

    // Dispose spark system
    if (this.sparkSystem) {
      this.sparkSystem.dispose();
    }

    // Dispose renderer
    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement && this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
    }
  }
}
