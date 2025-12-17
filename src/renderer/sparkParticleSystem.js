import * as THREE from 'three';

/**
 * SparkParticleSystem - CPU particle pool with GPU point sprite rendering
 *
 * Manages spark particles that emit from motion areas and fly in the opposite
 * direction of the detected motion (momentum transfer effect).
 *
 * Uses THREE.Points with custom shaders for efficient rendering.
 */

// Vertex shader for spark points
const sparkVertexShader = `
attribute float size;
attribute vec4 color;
varying vec4 vColor;

void main() {
  vColor = color;
  // Position is already in clip space (-1 to 1)
  gl_Position = vec4(position.xy, 0.0, 1.0);
  gl_PointSize = size;
}
`;

// Fragment shader for spark points
const sparkFragmentShader = `
varying vec4 vColor;

void main() {
  // Circular point with soft glowing edges
  vec2 center = gl_PointCoord - 0.5;
  float dist = length(center);

  // Soft glow falloff
  float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
  alpha = alpha * alpha;  // More intense center

  if (alpha < 0.01) discard;

  gl_FragColor = vec4(vColor.rgb * alpha, vColor.a * alpha);
}
`;

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

    // BufferGeometry for point sprites
    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(maxParticles * 3);  // x, y, z
    this.colors = new Float32Array(maxParticles * 4);     // r, g, b, a
    this.sizes = new Float32Array(maxParticles);

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 4));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

    // Custom shader material for sparks
    this.material = new THREE.ShaderMaterial({
      vertexShader: sparkVertexShader,
      fragmentShader: sparkFragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false
    });

    // Create Points mesh
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;  // Always render
    this.points.visible = false;  // Start hidden until mode 3 is active

    // Track next free slot for faster spawning
    this.nextFreeSlot = 0;

    // Initialize buffers
    this.updateBuffers();
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
   * Spawn sparks from motion center point
   * @param {Uint8ClampedArray} motionBuffer - Motion intensity buffer (unused, kept for API)
   * @param {number} width - Buffer width (unused)
   * @param {number} height - Buffer height (unused)
   * @param {number} velX - Global motion velocity X (-1 to 1)
   * @param {number} velY - Global motion velocity Y (-1 to 1)
   * @param {number} intensity - Overall motion intensity (0-1)
   * @param {number} dt - Delta time in seconds
   * @param {number} centerX - Motion center X (0-1)
   * @param {number} centerY - Motion center Y (0-1)
   */
  spawnFromMotion(motionBuffer, width, height, velX, velY, intensity, dt, centerX = 0.5, centerY = 0.5) {
    if (intensity < 0.05) return;

    // Need significant velocity to spawn directional sparks
    const velMag = Math.sqrt(velX * velX + velY * velY);
    if (velMag < 0.08) return;  // Skip if motion has no clear direction

    // Calculate spawn count based on density and intensity
    const baseSpawnRate = 120;  // Base particles per second at density 1.0
    const spawnCount = Math.floor(baseSpawnRate * this.density * intensity * velMag * dt * 60);

    // Normalize velocity direction
    const dirX = velX / velMag;
    const dirY = velY / velMag;

    for (let s = 0; s < spawnCount; s++) {
      // Find inactive particle slot
      const particle = this.findInactiveParticle();
      if (!particle) continue;  // Pool is full

      // Spark speed scales with motion velocity
      const speed = (0.2 + Math.random() * 0.3) * (1.0 + velMag * 2.0);

      // Spread angle for fan effect (±30 degrees)
      const spreadAngle = (Math.random() - 0.5) * 1.0;
      const cosSpread = Math.cos(spreadAngle);
      const sinSpread = Math.sin(spreadAngle);

      // Rotate the motion direction by spread angle
      const finalDirX = dirX * cosSpread - dirY * sinSpread;
      const finalDirY = dirX * sinSpread + dirY * cosSpread;

      // Spawn at motion center with tiny random offset
      const spawnOffset = 0.02;
      particle.x = centerX + (Math.random() - 0.5) * spawnOffset;
      particle.y = centerY + (Math.random() - 0.5) * spawnOffset;
      particle.vx = finalDirX * speed;
      particle.vy = finalDirY * speed;

      // Randomize lifetime and size
      particle.age = 0;
      particle.lifetime = 0.4 + Math.random() * 0.6;
      particle.size = 0.5 + Math.random() * 0.8;
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

    // Update GPU buffers
    this.updateBuffers();
  }

  /**
   * Update BufferGeometry attributes from particle data
   */
  updateBuffers() {
    let idx = 0;

    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];

      if (p.active) {
        // Position (convert 0-1 to -1 to 1 for clip space, z=0)
        this.positions[idx * 3] = p.x * 2 - 1;
        this.positions[idx * 3 + 1] = p.y * 2 - 1;
        this.positions[idx * 3 + 2] = 0;

        // Color based on mode and age
        const fade = 1.0 - p.age;
        const color = this.getSparkColor(p.age, p.colorIndex);
        this.colors[idx * 4] = color.r;
        this.colors[idx * 4 + 1] = color.g;
        this.colors[idx * 4 + 2] = color.b;
        this.colors[idx * 4 + 3] = fade * fade;  // Alpha with quadratic falloff

        // Size in pixels (larger when young, smaller when old)
        this.sizes[idx] = p.size * 12 * (0.5 + fade * 0.5);

        idx++;
      }
    }

    // Set draw range to only render active particles
    this.geometry.setDrawRange(0, idx);

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
  }

  /**
   * Get spark color based on current mode
   * @param {number} age - Particle age (0-1)
   * @param {number} colorIndex - Random color index (0-1)
   * @returns {{r: number, g: number, b: number}} RGB color (0-1 range)
   */
  getSparkColor(age, colorIndex) {
    if (this.colorMode === 0) {
      // Fire: white → yellow → orange → red
      return this.fireGradient(age);
    } else if (this.colorMode === 1) {
      // Rainbow based on colorIndex
      return this.hslToRgb(colorIndex, 1.0, 0.5);
    } else {
      // Visualization - time-based hue
      const hue = (Date.now() * 0.0001 + colorIndex * 0.5) % 1;
      return this.hslToRgb(hue, 1.0, 0.5);
    }
  }

  /**
   * Fire color gradient: white → yellow → orange → red → dark red
   * @param {number} t - Age (0-1, 0=young/hot, 1=old/cool)
   * @returns {{r: number, g: number, b: number}}
   */
  fireGradient(t) {
    t = Math.max(0, Math.min(1, t));

    if (t < 0.2) {
      // White to bright yellow
      const f = t / 0.2;
      return { r: 1.0, g: 1.0, b: 1.0 - f * 0.4 };
    } else if (t < 0.4) {
      // Bright yellow to orange
      const f = (t - 0.2) / 0.2;
      return { r: 1.0, g: 1.0 - f * 0.3, b: 0.6 - f * 0.4 };
    } else if (t < 0.7) {
      // Orange to red
      const f = (t - 0.4) / 0.3;
      return { r: 1.0, g: 0.7 - f * 0.4, b: 0.2 - f * 0.2 };
    } else {
      // Red to dark red
      const f = (t - 0.7) / 0.3;
      return { r: 1.0 - f * 0.7, g: 0.3 - f * 0.2, b: 0.0 };
    }
  }

  /**
   * Convert HSL to RGB
   * @param {number} h - Hue (0-1)
   * @param {number} s - Saturation (0-1)
   * @param {number} l - Lightness (0-1)
   * @returns {{r: number, g: number, b: number}}
   */
  hslToRgb(h, s, l) {
    let r, g, b;

    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }

    return { r, g, b };
  }

  /**
   * Get the Points mesh for adding to scene
   * @returns {THREE.Points}
   */
  getMesh() {
    return this.points;
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
    this.updateBuffers();
  }

  /**
   * Dispose of GPU resources
   */
  dispose() {
    if (this.geometry) {
      this.geometry.dispose();
    }
    if (this.material) {
      this.material.dispose();
    }
  }
}
