import * as THREE from 'three';

/**
 * SparkRainSystem - Realistic sparkler sparks that pour down and bounce off motion
 *
 * Features:
 * - High particle count (8000+) for dense "pouring" effect
 * - Velocity-based elongation (motion blur)
 * - Flickering/twinkling intensity
 * - Heat-based color variation (white-hot to orange to red)
 * - Trail particles for afterglow effect
 */

// Vertex shader with velocity for motion blur elongation
const sparkVertexShader = `
attribute float size;
attribute float alpha;
attribute vec2 velocity;
attribute float heat;
attribute float seed;

varying float vAlpha;
varying float vHeat;
varying float vSpeed;
varying float vSeed;

uniform float uTime;

void main() {
  vAlpha = alpha;
  vHeat = heat;
  vSeed = seed;

  float speed = length(velocity);
  vSpeed = speed;

  gl_Position = vec4(position.xy, 0.0, 1.0);

  // Size grows with speed for streak effect
  gl_PointSize = size * (1.0 + speed * 1.5);
}
`;

// Fragment shader - bright glowing sparks
const sparkFragmentShader = `
varying float vAlpha;
varying float vHeat;
varying float vSpeed;
varying float vSeed;

uniform float uTime;

void main() {
  vec2 center = gl_PointCoord - 0.5;
  float dist = length(center);

  // Discard pixels outside circle
  if (dist > 0.5) discard;

  // Bright core that fills most of the point
  float glow = 1.0 - smoothstep(0.0, 0.5, dist);
  glow = glow * glow;  // Sharper falloff

  // Subtle flicker
  float flicker = 0.9 + 0.1 * sin(uTime * 20.0 + vSeed * 50.0);

  // Hot spark colors: white core -> yellow -> orange
  vec3 coreColor = vec3(1.0, 1.0, 0.9);   // White-yellow
  vec3 edgeColor = vec3(1.0, 0.5, 0.1);   // Orange

  // Mix based on distance from center and heat
  vec3 color = mix(edgeColor, coreColor, glow * vHeat);

  // Output bright color - values well above 1.0 for HDR glow
  float brightness = glow * flicker * vAlpha * 8.0;

  gl_FragColor = vec4(color * brightness, 1.0);
}
`;

export default class BubbleParticleSystem {
  constructor(maxParticles = 8000) {
    this.maxParticles = maxParticles;
    this.activeCount = 0;

    // Physics settings - tuned for pouring spark effect
    this.gravity = 3.5;           // Strong gravity for fast falling
    this.bounceDamping = 0.4;     // Energy retained on bounce
    this.spawnRate = 250;         // Heavy rain of sparks!
    this.motionThreshold = 30;    // Motion value threshold for collision (0-255)
    this.burstProbability = 0.02; // Chance per frame of extra burst

    // Initialize particle pool with extended properties
    this.particles = new Array(maxParticles);
    for (let i = 0; i < maxParticles; i++) {
      this.particles[i] = {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 1.0,
        alpha: 1.0,
        heat: 0.5,      // Color temperature (0 = red, 1 = white)
        seed: Math.random() * Math.PI * 2,  // Unique per particle for flickering
        age: 0,
        maxAge: 2.0,
        bounces: 0,
        active: false
      };
    }

    // BufferGeometry for point sprites
    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(maxParticles * 3);
    this.alphas = new Float32Array(maxParticles);
    this.sizes = new Float32Array(maxParticles);
    this.velocities = new Float32Array(maxParticles * 2);
    this.heats = new Float32Array(maxParticles);
    this.seeds = new Float32Array(maxParticles);

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute('velocity', new THREE.BufferAttribute(this.velocities, 2));
    this.geometry.setAttribute('heat', new THREE.BufferAttribute(this.heats, 1));
    this.geometry.setAttribute('seed', new THREE.BufferAttribute(this.seeds, 1));

    // Custom shader material with additive blending for glow effect
    this.material = new THREE.ShaderMaterial({
      vertexShader: sparkVertexShader,
      fragmentShader: sparkFragmentShader,
      uniforms: {
        uTime: { value: 0.0 }
      },
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

    // Time tracking
    this.time = 0;

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
   * Spawn a new spark at the top of the screen
   * @param {number} x - Optional x position (0-1), random if not provided
   * @param {boolean} isTrail - If true, spawn as a trail particle (smaller, shorter lived)
   */
  spawnSpark(x = null, isTrail = false) {
    const particle = this.findInactiveParticle();
    if (!particle) return;

    // Position: either specified or random across top
    particle.x = x !== null ? x : Math.random();
    particle.y = 1.02 + Math.random() * 0.05;  // Slightly staggered above screen

    // Velocity: mostly straight down with slight variation
    particle.vx = (Math.random() - 0.5) * 0.15;
    particle.vy = -0.8 - Math.random() * 0.6;  // Fast downward

    // Size variation - some big bright ones, many smaller
    const sizeRand = Math.random();
    if (isTrail) {
      particle.size = 0.2 + Math.random() * 0.3;  // Trails are smaller
      particle.maxAge = 0.3 + Math.random() * 0.3;  // Shorter lived
    } else if (sizeRand > 0.95) {
      // 5% chance of big bright spark
      particle.size = 1.2 + Math.random() * 0.8;
      particle.maxAge = 2.5 + Math.random() * 1.0;
    } else if (sizeRand > 0.7) {
      // 25% medium sparks
      particle.size = 0.6 + Math.random() * 0.5;
      particle.maxAge = 1.5 + Math.random() * 1.0;
    } else {
      // 70% small sparks
      particle.size = 0.3 + Math.random() * 0.4;
      particle.maxAge = 1.0 + Math.random() * 0.8;
    }

    // Heat (color temperature) - bigger sparks tend to be hotter
    particle.heat = 0.3 + particle.size * 0.4 + Math.random() * 0.3;
    particle.heat = Math.min(1.0, particle.heat);

    particle.alpha = 0.8 + Math.random() * 0.2;
    particle.seed = Math.random() * Math.PI * 2;
    particle.age = 0;
    particle.bounces = 0;
    particle.active = true;
  }

  /**
   * Spawn a burst of sparks (for dramatic effect)
   * @param {number} count - Number of sparks to spawn
   * @param {number} x - X position for burst center
   */
  spawnBurst(count, x = null) {
    const centerX = x !== null ? x : Math.random();
    for (let i = 0; i < count; i++) {
      // Cluster around center with some spread
      const spreadX = centerX + (Math.random() - 0.5) * 0.1;
      this.spawnSpark(Math.max(0, Math.min(1, spreadX)));
    }
  }

  /**
   * Update all particles with physics and collision
   * @param {number} dt - Delta time in seconds
   * @param {Uint8ClampedArray} motionBuffer - Motion intensity buffer (160x120)
   * @param {number} motionWidth - Buffer width (160)
   * @param {number} motionHeight - Buffer height (120)
   */
  update(dt, motionBuffer, motionWidth, motionHeight) {
    this.time += dt;
    this.material.uniforms.uTime.value = this.time;

    // Spawn new sparks at steady rate
    this.spawnAccumulator += this.spawnRate * dt;
    while (this.spawnAccumulator >= 1) {
      this.spawnSpark();
      this.spawnAccumulator -= 1;
    }

    // Occasional bursts for visual interest
    if (Math.random() < this.burstProbability) {
      this.spawnBurst(15 + Math.floor(Math.random() * 20));
    }

    this.activeCount = 0;

    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      if (!p.active) continue;

      // Age particle
      p.age += dt;

      // Apply gravity
      p.vy -= this.gravity * dt;

      // Store previous position for collision response
      const prevY = p.y;

      // Move particle
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Air resistance (slight)
      p.vx *= 0.995;
      p.vy *= 0.998;

      // Check collision with motion buffer
      if (motionBuffer && motionWidth && motionHeight) {
        const bufX = Math.floor(p.x * motionWidth);
        const bufY = Math.floor((1 - p.y) * motionHeight);

        if (bufX >= 0 && bufX < motionWidth && bufY >= 0 && bufY < motionHeight) {
          const motionValue = motionBuffer[bufY * motionWidth + bufX];

          if (motionValue > this.motionThreshold) {
            // Collision! Bounce and scatter
            const motionStrength = motionValue / 255;

            // Reverse and scatter velocity
            p.vy = Math.abs(p.vy) * this.bounceDamping * (0.5 + motionStrength * 0.5);

            // Strong horizontal scatter on impact
            p.vx += (Math.random() - 0.5) * 0.8 * motionStrength;

            // Push back above collision
            p.y = prevY + 0.015;

            // Increase heat briefly on impact (sparks get brighter when hit)
            p.heat = Math.min(1.0, p.heat + 0.2);

            // Fade with each bounce
            p.alpha *= 0.75;
            p.bounces++;

            // Spawn trail sparks on impact for scatter effect
            if (p.bounces === 1 && Math.random() < 0.4) {
              for (let t = 0; t < 2; t++) {
                const trail = this.findInactiveParticle();
                if (trail) {
                  trail.x = p.x + (Math.random() - 0.5) * 0.02;
                  trail.y = p.y;
                  trail.vx = (Math.random() - 0.5) * 0.5;
                  trail.vy = Math.random() * 0.3;
                  trail.size = p.size * 0.4;
                  trail.alpha = p.alpha * 0.6;
                  trail.heat = p.heat * 0.7;
                  trail.seed = Math.random() * Math.PI * 2;
                  trail.age = 0;
                  trail.maxAge = 0.4;
                  trail.bounces = 3;  // Will die soon
                  trail.active = true;
                }
              }
            }
          }
        }
      }

      // Fade based on age
      const ageFactor = 1.0 - (p.age / p.maxAge);

      // Cool down over time (heat decreases)
      p.heat = Math.max(0.1, p.heat - dt * 0.1);

      // Deactivate conditions
      if (p.y < -0.15 ||
          p.x < -0.15 ||
          p.x > 1.15 ||
          p.bounces > 5 ||
          p.alpha < 0.05 ||
          p.age > p.maxAge) {
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

        // Alpha - minimal age fade, stays bright most of lifetime
        const ageRatio = p.age / p.maxAge;
        const ageFade = ageRatio < 0.7 ? 1.0 : 1.0 - Math.pow((ageRatio - 0.7) / 0.3, 2);
        this.alphas[idx] = Math.max(0.5, p.alpha * ageFade);

        // Size in pixels - small sharp sparks
        this.sizes[idx] = p.size * 4;

        // Velocity for motion blur
        this.velocities[idx * 2] = p.vx;
        this.velocities[idx * 2 + 1] = p.vy;

        // Heat for color
        this.heats[idx] = p.heat;

        // Seed for flickering
        this.seeds[idx] = p.seed;

        idx++;
      }
    }

    // Set draw range
    this.geometry.setDrawRange(0, idx);

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.alpha.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
    this.geometry.attributes.velocity.needsUpdate = true;
    this.geometry.attributes.heat.needsUpdate = true;
    this.geometry.attributes.seed.needsUpdate = true;
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
   * @param {number} rate - Sparks per second
   */
  setSpawnRate(rate) {
    this.spawnRate = Math.max(10, Math.min(500, rate));
  }

  /**
   * Set gravity
   * @param {number} g - Gravity value
   */
  setGravity(g) {
    this.gravity = Math.max(0.5, Math.min(8.0, g));
  }

  /**
   * Set bounce damping
   * @param {number} d - Damping value (0-1)
   */
  setBounceDamping(d) {
    this.bounceDamping = Math.max(0.1, Math.min(0.8, d));
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
