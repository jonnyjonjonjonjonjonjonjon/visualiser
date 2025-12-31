import * as THREE from 'three';

/**
 * ConfettiParticleSystem - Realistic paper confetti with orientation-dependent physics
 *
 * Features:
 * - Rectangular strips that visually tumble as they fall
 * - Orientation-dependent drag: flat = slow/hover, edge-on = fast fall
 * - Airflow-induced torque creates natural tumbling
 * - Stall flutter when slow and horizontal
 * - Tilt-induced sideways drift
 * - Festive rainbow color palette
 */

// Physics constants
const GRAVITY = 1.2;              // Base gravity
const BASE_DRAG = 0.4;            // Baseline air resistance
const FLAT_DRAG_MULT = 7.0;       // 7x drag when horizontal
const EDGE_DRAG_MULT = 0.8;       // Low drag when edge-on
const ANGULAR_DAMPING = 0.93;     // Rotation decay per frame
const TORQUE_FROM_VELOCITY = 0.6; // Airflow-induced torque
const FLUTTER_TORQUE = 3.0;       // Random flutter impulse strength
const DRIFT_FROM_TILT = 0.12;     // Sideways drift factor
const STALL_THRESHOLD = 0.015;    // Speed below which flutter kicks in

// Vertex shader - pass rotation and aspect ratio for rectangle rendering
const confettiVertexShader = `
attribute float size;
attribute float alpha;
attribute float hue;
attribute float rotation;
attribute float aspectRatio;

varying float vAlpha;
varying float vHue;
varying float vRotation;
varying float vAspectRatio;

void main() {
  vAlpha = alpha;
  vHue = hue;
  vRotation = rotation;
  vAspectRatio = aspectRatio;

  gl_Position = vec4(position.xy, 0.0, 1.0);
  gl_PointSize = size;
}
`;

// Fragment shader - rotating rectangular confetti strips
const confettiFragmentShader = `
varying float vAlpha;
varying float vHue;
varying float vRotation;
varying float vAspectRatio;

// HSL to RGB conversion
vec3 hsl2rgb(float h, float s, float l) {
  vec3 rgb = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return l + s * (rgb - 0.5) * (1.0 - abs(2.0 * l - 1.0));
}

void main() {
  vec2 uv = gl_PointCoord - 0.5;

  // Rotate UV coordinates
  float c = cos(vRotation);
  float s = sin(vRotation);
  vec2 rotUV = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c);

  // Rectangle shape: wide and thin based on aspect ratio
  vec2 halfSize = vec2(0.45, 0.45 / vAspectRatio);
  vec2 d = abs(rotUV) - halfSize;
  float dist = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);

  // Discard pixels outside rectangle
  if (dist > 0.08) discard;

  // Anti-aliased edge
  float edge = 1.0 - smoothstep(0.0, 0.08, dist);

  // Subtle shading for depth perception
  float shading = 1.0 - length(rotUV) * 0.12;

  // Metallic gold and silver confetti
  vec3 gold = vec3(1.0, 0.84, 0.3);
  vec3 silver = vec3(0.85, 0.87, 0.91);
  vec3 baseColor = vHue < 0.5 ? gold : silver;

  // Add metallic shimmer based on rotation
  float shimmer = 0.85 + 0.15 * sin(vRotation * 4.0);
  vec3 color = baseColor * shading * shimmer;

  gl_FragColor = vec4(color, vAlpha * edge);
}
`;

// Festive color palette (hue values 0-1)
const FESTIVE_HUES = [
  0.0,    // Red
  0.08,   // Orange
  0.14,   // Yellow
  0.33,   // Green
  0.55,   // Cyan
  0.66,   // Blue
  0.75,   // Purple
  0.92    // Pink
];

export default class ConfettiParticleSystem {
  constructor(maxParticles = 8000) {
    this.maxParticles = maxParticles;
    this.activeCount = 0;

    // Spawn settings
    this.spawnRate = 160;         // Particles per second
    this.motionThreshold = 30;    // Motion value threshold for collision (0-255)
    this.burstProbability = 0.006; // Occasional bursts

    // Initialize particle pool with paper physics properties
    this.particles = new Array(maxParticles);
    for (let i = 0; i < maxParticles; i++) {
      this.particles[i] = {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 1.0,
        alpha: 1.0,
        hue: 0.0,
        // Rotation physics
        pitch: 0,           // Primary tumbling angle (radians)
        pitchVel: 0,        // Angular velocity (rad/s)
        yaw: 0,             // Secondary spin angle
        yawVel: 0,          // Spin velocity
        flatness: 1.0,      // Cached: abs(cos(pitch)) - 1=flat, 0=edge-on
        // Individual variation
        aspectRatio: 3.0,   // Width/height ratio
        dragCoeff: 1.0,     // Drag variation
        mass: 1.0,          // Inertia variation
        // Lifecycle
        age: 0,
        maxAge: 5.0,
        bounces: 0,
        active: false
      };
    }

    // BufferGeometry for point sprites
    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(maxParticles * 3);
    this.alphas = new Float32Array(maxParticles);
    this.sizes = new Float32Array(maxParticles);
    this.hues = new Float32Array(maxParticles);
    this.rotations = new Float32Array(maxParticles);
    this.aspectRatios = new Float32Array(maxParticles);

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute('hue', new THREE.BufferAttribute(this.hues, 1));
    this.geometry.setAttribute('rotation', new THREE.BufferAttribute(this.rotations, 1));
    this.geometry.setAttribute('aspectRatio', new THREE.BufferAttribute(this.aspectRatios, 1));

    // Custom shader material with normal blending
    this.material = new THREE.ShaderMaterial({
      vertexShader: confettiVertexShader,
      fragmentShader: confettiFragmentShader,
      transparent: true,
      blending: THREE.NormalBlending,
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
   * Spawn a new confetti piece at the top of the screen
   * @param {number} x - Optional x position (0-1), random if not provided
   */
  spawnConfetti(x = null) {
    const particle = this.findInactiveParticle();
    if (!particle) return;

    // Position: either specified or random across top
    particle.x = x !== null ? x : Math.random();
    particle.y = 1.02 + Math.random() * 0.1;

    // Slow initial velocity
    particle.vx = (Math.random() - 0.5) * 0.06;
    particle.vy = -0.06 - Math.random() * 0.08;

    // Random initial rotation with angular velocity for immediate tumbling
    particle.pitch = Math.random() * Math.PI * 2;
    particle.pitchVel = (Math.random() - 0.5) * 3.0;
    particle.yaw = Math.random() * Math.PI * 2;
    particle.yawVel = (Math.random() - 0.5) * 1.5;
    particle.flatness = Math.abs(Math.cos(particle.pitch));

    // Fixed size and shape for uniform confetti
    particle.aspectRatio = 3.0;  // 3:1 ratio
    particle.size = 1.2;
    particle.maxAge = 6.0 + Math.random() * 2.0;

    // Individual variation for physics only
    particle.dragCoeff = 0.8 + Math.random() * 0.4;
    particle.mass = 0.8 + Math.random() * 0.4;

    // Random gold (0) or silver (1)
    particle.hue = Math.random() < 0.5 ? 0.0 : 1.0;

    particle.alpha = 0.9 + Math.random() * 0.1;
    particle.age = 0;
    particle.bounces = 0;
    particle.active = true;
  }

  /**
   * Spawn a burst of confetti
   * @param {number} count - Number of pieces to spawn
   * @param {number} x - X position for burst center
   */
  spawnBurst(count, x = null) {
    const centerX = x !== null ? x : Math.random();
    for (let i = 0; i < count; i++) {
      const spreadX = centerX + (Math.random() - 0.5) * 0.2;
      this.spawnConfetti(Math.max(0, Math.min(1, spreadX)));
    }
  }

  /**
   * Update all particles with paper physics
   * @param {number} dt - Delta time in seconds
   * @param {Uint8ClampedArray} motionBuffer - Motion intensity buffer (160x120)
   * @param {number} motionWidth - Buffer width (160)
   * @param {number} motionHeight - Buffer height (120)
   */
  update(dt, motionBuffer, motionWidth, motionHeight) {
    this.time += dt;

    // Spawn new confetti at steady rate
    this.spawnAccumulator += this.spawnRate * dt;
    while (this.spawnAccumulator >= 1) {
      this.spawnConfetti();
      this.spawnAccumulator -= 1;
    }

    // Occasional bursts for celebration effect
    if (Math.random() < this.burstProbability) {
      this.spawnBurst(8 + Math.floor(Math.random() * 12));
    }

    this.activeCount = 0;

    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      if (!p.active) continue;

      // Age particle
      p.age += dt;

      // === ROTATION PHYSICS ===

      // Update rotation angles
      p.pitch += p.pitchVel * dt;
      p.yaw += p.yawVel * dt;

      // Keep angles in reasonable range
      p.pitch = p.pitch % (Math.PI * 2);
      p.yaw = p.yaw % (Math.PI * 2);

      // Calculate flatness: 1 = horizontal (catches air), 0 = edge-on (slices through)
      p.flatness = Math.abs(Math.cos(p.pitch));

      // Angular damping - rotation naturally slows
      p.pitchVel *= ANGULAR_DAMPING;
      p.yawVel *= ANGULAR_DAMPING;

      // === AIRFLOW-INDUCED TORQUE ===

      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);

      // Falling motion creates torque that flips the paper
      if (speed > 0.01) {
        // More torque when flat (catching air)
        const torqueMagnitude = speed * TORQUE_FROM_VELOCITY * p.flatness;

        // Torque direction depends on orientation + randomness
        const torqueDir = Math.sin(p.pitch * 2) * 0.5 + (Math.random() - 0.5) * 0.3;

        p.pitchVel += torqueDir * torqueMagnitude * dt * 60;
      }

      // === STALL FLUTTER ===

      // When slow and flat, paper develops erratic flutter
      if (speed < STALL_THRESHOLD && p.flatness > 0.7) {
        if (Math.random() < 0.15) {
          p.pitchVel += (Math.random() - 0.5) * FLUTTER_TORQUE;
          p.yawVel += (Math.random() - 0.5) * FLUTTER_TORQUE * 0.5;
        }
      }

      // === ORIENTATION-DEPENDENT DRAG ===

      // Interpolate drag based on flatness
      const effectiveDrag = BASE_DRAG * p.dragCoeff *
        (EDGE_DRAG_MULT + (FLAT_DRAG_MULT - EDGE_DRAG_MULT) * p.flatness);

      // Drag force proportional to v^2
      const dragMag = effectiveDrag * speed * speed;

      if (speed > 0.001) {
        const dragX = -(p.vx / speed) * dragMag;
        const dragY = -(p.vy / speed) * dragMag;

        p.vx += dragX * dt / p.mass;
        p.vy += dragY * dt / p.mass;
      }

      // === GRAVITY WITH LIFT WHEN FLAT ===

      // When flat, paper catches air and creates lift
      const liftFactor = 1.0 - p.flatness * 0.6;  // Up to 60% lift when flat
      const effectiveGravity = GRAVITY * liftFactor;

      p.vy -= effectiveGravity * dt;

      // === TILT-INDUCED DRIFT ===

      // Paper drifts sideways in the direction it's tilting
      const driftDirection = Math.sin(p.pitch + p.yaw);
      p.vx += driftDirection * DRIFT_FROM_TILT * p.flatness * dt;

      // === POSITION UPDATE ===

      const prevY = p.y;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // === MOTION COLLISION ===

      if (motionBuffer && motionWidth && motionHeight) {
        const bufX = Math.floor(p.x * motionWidth);
        const bufY = Math.floor((1 - p.y) * motionHeight);

        if (bufX >= 0 && bufX < motionWidth && bufY >= 0 && bufY < motionHeight) {
          const motionValue = motionBuffer[bufY * motionWidth + bufX];

          if (motionValue > this.motionThreshold) {
            const motionStrength = motionValue / 255;

            // Collision adds angular momentum (paper gets spun)
            p.pitchVel += (Math.random() - 0.5) * 5.0 * motionStrength;
            p.yawVel += (Math.random() - 0.5) * 3.0 * motionStrength;

            // Gentle upward push
            p.vy = 0.15 + motionStrength * 0.2;
            p.vx += (Math.random() - 0.5) * 0.2 * motionStrength;

            // Push back above collision
            p.y = prevY + 0.01;

            // Slight fade with each interaction
            p.alpha *= 0.95;
            p.bounces++;
          }
        }
      }

      // === DEACTIVATION ===

      if (p.y < -0.15 ||
          p.x < -0.15 ||
          p.x > 1.15 ||
          p.bounces > 10 ||
          p.alpha < 0.1 ||
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

        // Alpha - gentle fade near end of life
        const ageRatio = p.age / p.maxAge;
        const ageFade = ageRatio < 0.8 ? 1.0 : 1.0 - Math.pow((ageRatio - 0.8) / 0.2, 2);
        this.alphas[idx] = p.alpha * ageFade;

        // Size with foreshortening effect (thinner when edge-on)
        const foreshortening = 0.3 + 0.7 * p.flatness;
        this.sizes[idx] = p.size * 12 * foreshortening;

        // Hue for color
        this.hues[idx] = p.hue;

        // Combined visual rotation
        this.rotations[idx] = p.pitch + p.yaw * 0.3;

        // Aspect ratio
        this.aspectRatios[idx] = p.aspectRatio;

        idx++;
      }
    }

    // Set draw range
    this.geometry.setDrawRange(0, idx);

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.alpha.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
    this.geometry.attributes.hue.needsUpdate = true;
    this.geometry.attributes.rotation.needsUpdate = true;
    this.geometry.attributes.aspectRatio.needsUpdate = true;
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
   * @param {number} rate - Confetti per second
   */
  setSpawnRate(rate) {
    this.spawnRate = Math.max(10, Math.min(300, rate));
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
