import * as THREE from 'three';

/**
 * SparkParticleSystem - CPU particle pool with GPU rendering via DataTexture
 *
 * Manages spark particles that emit from motion areas and fly in the opposite
 * direction of the detected motion (momentum transfer effect).
 */
export default class SparkParticleSystem {
  constructor(maxParticles = 2000) {
    this.maxParticles = maxParticles;
    this.activeCount = 0;

    // Settings
    this.density = 1.0;      // 0.25 to 2.0, controls spawn rate
    this.colorMode = 0;      // 0=fire, 1=rainbow, 2=visualization
    this.colorModeNames = ['Fire', 'Rainbow', 'Visualization'];

    // Initialize particle pool
    this.particles = new Array(maxParticles);
    for (let i = 0; i < maxParticles; i++) {
      this.particles[i] = {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        age: 1.0,        // 0-1, dies at 1
        lifetime: 1.0,   // seconds
        size: 1.0,
        colorIndex: 0,
        active: false
      };
    }

    // DataTexture for GPU: 64x64 = 4096 texels
    // We use 1 texel per particle: RGBA = [x, y, age, size]
    // Velocity is computed in shader from position delta or passed separately
    this.textureSize = 64;
    this.particleData = new Float32Array(this.textureSize * this.textureSize * 4);

    // Secondary texture for velocity data
    this.velocityData = new Float32Array(this.textureSize * this.textureSize * 4);

    // Position/age texture - use HalfFloatType for better compatibility
    this.particleTexture = new THREE.DataTexture(
      this.particleData,
      this.textureSize,
      this.textureSize,
      THREE.RGBAFormat,
      THREE.HalfFloatType
    );
    this.particleTexture.minFilter = THREE.NearestFilter;
    this.particleTexture.magFilter = THREE.NearestFilter;
    this.particleTexture.needsUpdate = true;

    // Velocity texture - use HalfFloatType for better compatibility
    this.velocityTexture = new THREE.DataTexture(
      this.velocityData,
      this.textureSize,
      this.textureSize,
      THREE.RGBAFormat,
      THREE.HalfFloatType
    );
    this.velocityTexture.minFilter = THREE.NearestFilter;
    this.velocityTexture.magFilter = THREE.NearestFilter;
    this.velocityTexture.needsUpdate = true;

    // Track next free slot for faster spawning
    this.nextFreeSlot = 0;

    // Initialize textures with proper default values
    this.packTextureData();
  }

  /**
   * Find an inactive particle slot
   * @returns {Object|null} Particle object or null if pool is full
   */
  findInactiveParticle() {
    // Start from last known free slot
    for (let i = 0; i < this.maxParticles; i++) {
      const idx = (this.nextFreeSlot + i) % this.maxParticles;
      if (!this.particles[idx].active) {
        this.nextFreeSlot = (idx + 1) % this.maxParticles;
        return this.particles[idx];
      }
    }
    return null;
  }

  /**
   * Spawn sparks from motion areas
   * @param {Uint8ClampedArray} motionBuffer - Motion intensity buffer (160x120)
   * @param {number} width - Buffer width
   * @param {number} height - Buffer height
   * @param {number} velX - Global motion velocity X (-1 to 1)
   * @param {number} velY - Global motion velocity Y (-1 to 1)
   * @param {number} intensity - Overall motion intensity (0-1)
   * @param {number} dt - Delta time in seconds
   */
  spawnFromMotion(motionBuffer, width, height, velX, velY, intensity, dt) {
    if (intensity < 0.05) return;

    // Calculate spawn count based on density and intensity
    const baseSpawnRate = 80;  // Base particles per second at density 1.0
    const spawnCount = Math.floor(baseSpawnRate * this.density * intensity * dt * 60);

    for (let s = 0; s < spawnCount; s++) {
      // Find a pixel with high motion (random sampling)
      let spawnX, spawnY;
      let foundHotspot = false;

      for (let attempt = 0; attempt < 15; attempt++) {
        const px = Math.floor(Math.random() * width);
        const py = Math.floor(Math.random() * height);
        const motionValue = motionBuffer[py * width + px];

        if (motionValue > 20) {
          // Found active motion pixel - convert to normalized coords
          spawnX = px / width;
          spawnY = 1.0 - (py / height);  // Flip Y for shader coords
          foundHotspot = true;
          break;
        }
      }

      if (!foundHotspot) continue;

      // Find inactive particle slot
      const particle = this.findInactiveParticle();
      if (!particle) continue;  // Pool is full

      // Calculate spark velocity (opposite to motion direction)
      const speed = 0.2 + Math.random() * 0.4;
      const spread = (Math.random() - 0.5) * 0.6;  // Random spread angle

      // Normalize motion velocity and reverse it
      const motionMag = Math.sqrt(velX * velX + velY * velY) + 0.001;
      const normVelX = velX / motionMag;
      const normVelY = velY / motionMag;

      // Spark flies opposite to motion with some spread
      particle.x = spawnX;
      particle.y = spawnY;
      particle.vx = -normVelX * speed + spread * normVelY;
      particle.vy = -normVelY * speed - spread * normVelX;

      // Randomize lifetime and size
      particle.age = 0;
      particle.lifetime = 0.4 + Math.random() * 0.8;
      particle.size = 0.4 + Math.random() * 0.8;
      particle.colorIndex = Math.random();
      particle.active = true;

      this.activeCount++;
    }
  }

  /**
   * Update all particles (physics and aging)
   * @param {number} dt - Delta time in seconds
   */
  update(dt) {
    this.activeCount = 0;

    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      if (!p.active) continue;

      // Pure momentum - no gravity, slight deceleration for visual appeal
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Slight velocity decay for more natural movement
      p.vx *= 0.995;
      p.vy *= 0.995;

      // Age particle
      p.age += dt / p.lifetime;

      // Deactivate if too old or off-screen
      if (p.age >= 1.0 || p.x < -0.2 || p.x > 1.2 || p.y < -0.2 || p.y > 1.2) {
        p.active = false;
        continue;
      }

      this.activeCount++;
    }

    // Pack data into textures
    this.packTextureData();
  }

  /**
   * Pack particle data into DataTextures for GPU
   */
  packTextureData() {
    let idx = 0;

    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      const baseIdx = idx * 4;

      if (p.active && idx < this.textureSize * this.textureSize) {
        // Position texture: x, y, age, size
        this.particleData[baseIdx + 0] = p.x;
        this.particleData[baseIdx + 1] = p.y;
        this.particleData[baseIdx + 2] = p.age;
        this.particleData[baseIdx + 3] = p.size;

        // Velocity texture: vx, vy, colorIndex, 1.0 (active flag)
        this.velocityData[baseIdx + 0] = p.vx;
        this.velocityData[baseIdx + 1] = p.vy;
        this.velocityData[baseIdx + 2] = p.colorIndex;
        this.velocityData[baseIdx + 3] = 1.0;

        idx++;
      }
    }

    // Fill remaining slots with inactive markers
    for (; idx < this.textureSize * this.textureSize; idx++) {
      const baseIdx = idx * 4;
      this.particleData[baseIdx + 0] = -1;
      this.particleData[baseIdx + 1] = -1;
      this.particleData[baseIdx + 2] = 1;
      this.particleData[baseIdx + 3] = 0;

      this.velocityData[baseIdx + 0] = 0;
      this.velocityData[baseIdx + 1] = 0;
      this.velocityData[baseIdx + 2] = 0;
      this.velocityData[baseIdx + 3] = 0;
    }

    this.particleTexture.needsUpdate = true;
    this.velocityTexture.needsUpdate = true;
  }

  /**
   * Set particle density
   * @param {number} value - Density value (will be clamped to 0.25-2.0)
   */
  setDensity(value) {
    this.density = Math.max(0.25, Math.min(2.0, value));
  }

  /**
   * Adjust density by delta
   * @param {number} delta - Amount to adjust
   * @returns {number} New density value
   */
  adjustDensity(delta) {
    this.setDensity(this.density + delta);
    return this.density;
  }

  /**
   * Set color mode
   * @param {number} mode - Color mode (0=fire, 1=rainbow, 2=visualization)
   */
  setColorMode(mode) {
    this.colorMode = ((mode % 3) + 3) % 3;  // Ensure positive modulo
  }

  /**
   * Cycle to next color mode
   * @returns {string} New color mode name
   */
  cycleColorMode() {
    this.colorMode = (this.colorMode + 1) % 3;
    return this.colorModeNames[this.colorMode];
  }

  /**
   * Get current color mode name
   * @returns {string} Color mode name
   */
  getColorModeName() {
    return this.colorModeNames[this.colorMode];
  }

  /**
   * Get position/age texture for GPU
   * @returns {THREE.DataTexture}
   */
  getTexture() {
    return this.particleTexture;
  }

  /**
   * Get velocity texture for GPU
   * @returns {THREE.DataTexture}
   */
  getVelocityTexture() {
    return this.velocityTexture;
  }

  /**
   * Get active particle count
   * @returns {number}
   */
  getActiveCount() {
    return this.activeCount;
  }

  /**
   * Get current color mode
   * @returns {number}
   */
  getColorMode() {
    return this.colorMode;
  }

  /**
   * Get current density
   * @returns {number}
   */
  getDensity() {
    return this.density;
  }

  /**
   * Clear all particles
   */
  clear() {
    for (let i = 0; i < this.maxParticles; i++) {
      this.particles[i].active = false;
    }
    this.activeCount = 0;
    this.packTextureData();
  }

  /**
   * Dispose of GPU resources
   */
  dispose() {
    if (this.particleTexture) {
      this.particleTexture.dispose();
    }
    if (this.velocityTexture) {
      this.velocityTexture.dispose();
    }
  }
}
