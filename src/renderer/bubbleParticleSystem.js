import * as THREE from 'three';

/**
 * SparkRainSystem - Falling sparks that bounce off motion
 *
 * Sparkler-like sparks rain down from the top of the screen and bounce off
 * areas where webcam motion is detected, creating an interactive effect.
 */

// Vertex shader for spark points
const sparkVertexShader = `
attribute float size;
attribute float alpha;
varying float vAlpha;

void main() {
  vAlpha = alpha;
  // Position is already in clip space (-1 to 1)
  gl_Position = vec4(position.xy, 0.0, 1.0);
  gl_PointSize = size;
}
`;

// Fragment shader for sparkler sparks - intense bright core with orange glow
const sparkFragmentShader = `
varying float vAlpha;

void main() {
  vec2 center = gl_PointCoord - 0.5;
  float dist = length(center);

  // Sharp bright core - more intense
  float core = 1.0 - smoothstep(0.0, 0.12, dist);
  core = core * core;  // Sharper falloff

  // Outer glow (softer, wider)
  float glow = 1.0 - smoothstep(0.0, 0.5, dist);
  glow = glow * glow * 0.6;

  // Sparkler colors: intense white core -> yellow -> orange glow
  vec3 coreColor = vec3(1.0, 1.0, 1.0);   // Pure bright white
  vec3 glowColor = vec3(1.0, 0.6, 0.15);  // Warm orange glow

  vec3 color = mix(glowColor, coreColor, core);

  // Boost overall brightness
  float intensity = (core * 2.0 + glow) * vAlpha;

  if (intensity < 0.01) discard;

  gl_FragColor = vec4(color * intensity * 1.5, intensity);
}
`;

export default class BubbleParticleSystem {
  constructor(maxParticles = 1500) {
    this.maxParticles = maxParticles;
    this.activeCount = 0;

    // Physics settings
    this.gravity = 4.0;           // Very heavy, streaming down fast
    this.bounceDamping = 0.3;     // Quick bounce, not floaty
    this.spawnRate = 80;          // Rain of sparks!
    this.motionThreshold = 35;    // Motion value threshold for collision (0-255)

    // Initialize particle pool
    this.particles = new Array(maxParticles);
    for (let i = 0; i < maxParticles; i++) {
      this.particles[i] = {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 1.0,
        alpha: 1.0,
        bounces: 0,
        active: false
      };
    }

    // BufferGeometry for point sprites
    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(maxParticles * 3);
    this.alphas = new Float32Array(maxParticles);
    this.sizes = new Float32Array(maxParticles);

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

    // Custom shader material with additive blending for glow effect
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
    this.points.frustumCulled = false;
    this.points.visible = true;

    // Track next free slot
    this.nextFreeSlot = 0;

    // Spawn accumulator for fractional spawning
    this.spawnAccumulator = 0;

    // Initialize buffers
    this.updateBuffers();
  }

  /**
   * Find an inactive particle slot
   */
  findInactiveParticle() {
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
   * Spawn a new bubble at the top of the screen
   */
  spawnBubble() {
    const particle = this.findInactiveParticle();
    if (!particle) return;

    // Random position along the top
    particle.x = Math.random();
    particle.y = 1.05;  // Just above visible area

    // Minimal horizontal drift - fall straight down
    particle.vx = (Math.random() - 0.5) * 0.02;
    particle.vy = -0.5 - Math.random() * 0.5;  // Start with downward velocity

    // Random size variation
    particle.size = 0.4 + Math.random() * 0.4;
    particle.alpha = 0.9 + Math.random() * 0.1;
    particle.bounces = 0;
    particle.active = true;
  }

  /**
   * Update all particles with physics and collision
   * @param {number} dt - Delta time in seconds
   * @param {Uint8ClampedArray} motionBuffer - Motion intensity buffer (160x120)
   * @param {number} motionWidth - Buffer width (160)
   * @param {number} motionHeight - Buffer height (120)
   */
  update(dt, motionBuffer, motionWidth, motionHeight) {
    // Spawn new bubbles
    this.spawnAccumulator += this.spawnRate * dt;
    while (this.spawnAccumulator >= 1) {
      this.spawnBubble();
      this.spawnAccumulator -= 1;
    }

    this.activeCount = 0;

    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      if (!p.active) continue;

      // Apply gravity (negative because Y increases upward in our space)
      p.vy -= this.gravity * dt;

      // Store previous position for collision response
      const prevY = p.y;

      // Move particle
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Check collision with motion buffer
      if (motionBuffer && motionWidth && motionHeight) {
        // Convert particle position to motion buffer coordinates
        // Particle space: Y=0 at bottom, Y=1 at top
        // Motion buffer: Y=0 at top, Y=119 at bottom
        const bufX = Math.floor(p.x * motionWidth);
        const bufY = Math.floor((1 - p.y) * motionHeight);

        // Bounds check
        if (bufX >= 0 && bufX < motionWidth && bufY >= 0 && bufY < motionHeight) {
          const motionValue = motionBuffer[bufY * motionWidth + bufX];

          if (motionValue > this.motionThreshold) {
            // Collision! Bounce the bubble

            // Reverse vertical velocity with damping
            p.vy = -p.vy * this.bounceDamping;

            // Minimal horizontal scatter - sparks mostly fall straight
            p.vx += (Math.random() - 0.5) * 0.1;

            // Push spark back above the collision point
            p.y = prevY + 0.01;

            // Fade with each bounce
            p.alpha *= 0.85;
            p.bounces++;

            // Kill horizontal velocity quickly
            p.vx *= 0.5;
          }
        }
      }

      // Strong damping on horizontal movement - sparks fall straight
      p.vx *= 0.9;

      // Deactivate conditions:
      // - Fallen below screen
      // - Drifted off sides
      // - Too many bounces (fewer for faster turnover)
      // - Faded out
      if (p.y < -0.1 || p.x < -0.1 || p.x > 1.1 || p.bounces > 3 || p.alpha < 0.1) {
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
        // Position (convert 0-1 to -1 to 1 for clip space)
        this.positions[idx * 3] = p.x * 2 - 1;
        this.positions[idx * 3 + 1] = p.y * 2 - 1;
        this.positions[idx * 3 + 2] = 0;

        // Alpha
        this.alphas[idx] = p.alpha;

        // Size in pixels
        this.sizes[idx] = p.size * 15;  // Smaller for sharper sparks

        idx++;
      }
    }

    // Set draw range
    this.geometry.setDrawRange(0, idx);

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.alpha.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
  }

  /**
   * Get the Points mesh for adding to scene
   */
  getMesh() {
    return this.points;
  }

  /**
   * Get active particle count
   */
  getActiveCount() {
    return this.activeCount;
  }

  /**
   * Set spawn rate
   * @param {number} rate - Bubbles per second
   */
  setSpawnRate(rate) {
    this.spawnRate = Math.max(1, Math.min(100, rate));
  }

  /**
   * Set gravity
   * @param {number} g - Gravity value
   */
  setGravity(g) {
    this.gravity = Math.max(0.1, Math.min(2.0, g));
  }

  /**
   * Set bounce damping
   * @param {number} d - Damping value (0-1)
   */
  setBounceDamping(d) {
    this.bounceDamping = Math.max(0.1, Math.min(0.95, d));
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
   * Dispose GPU resources
   */
  dispose() {
    if (this.geometry) this.geometry.dispose();
    if (this.material) this.material.dispose();
  }
}
