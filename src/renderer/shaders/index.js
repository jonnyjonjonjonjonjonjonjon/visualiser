// Psychedelic GLSL Fragment Shaders for Music Visualizer
// All shaders accept the following uniforms:
// - uTime: float (elapsed time)
// - uResolution: vec2 (screen resolution)
// - uBass, uMid, uTreble, uEnergy: float (0-1 audio energy)
// - uBeat: float (1.0 on beat, decays to 0)
// - uSpectrum: sampler2D (512x1 texture of frequency data)
// - uMotionIntensity: float (0-1 webcam motion intensity)
// - uMotionCenter: vec2 (center of motion 0-1)
// - uMotionVelocity: vec2 (motion direction -1 to 1)
// - uMotionMode: int (0=off, 1=push, 2=predator, 3=trails)
// - uMotionTexture: sampler2D (160x120 motion field)
// Note: Spark particles (mode 3) are rendered separately via THREE.Points

const commonVertexShader = `
void main() {
    gl_Position = vec4(position, 1.0);
}
`;

// Common motion uniforms to be added to each shader
const motionUniforms = `
uniform float uMotionIntensity;
uniform vec2 uMotionCenter;
uniform vec2 uMotionVelocity;
uniform int uMotionMode;
uniform sampler2D uMotionTexture;
`;

// Motion helper functions for shaders
const motionHelpers = `
// Sample motion at UV position (flip Y to match webcam orientation)
float getMotion(vec2 uv) {
    return texture2D(uMotionTexture, vec2(uv.x, 1.0 - uv.y)).r;
}

// Push/Displace effect - distorts UV coordinates away from motion
vec2 applyPushDisplace(vec2 uv) {
    if (uMotionMode != 1) return uv;

    float motion = getMotion(uv);
    if (motion < 0.005) return uv;

    vec2 toCenter = uv - uMotionCenter;
    float dist = length(toCenter);

    // Strong push away from motion center
    float pushStrength = (uMotionIntensity * 2.0 + 0.3) * motion;
    vec2 pushDir = normalize(toCenter + 0.001);

    // Add velocity influence for directional push
    pushDir += uMotionVelocity * 0.8;

    // Wider area of effect
    return uv + pushDir * pushStrength * smoothstep(1.5, 0.0, dist);
}

// Paint/Trails effect - adds color overlay where motion detected
vec3 applyPaintTrails(vec3 col, vec2 uv, float time) {
    if (uMotionMode != 2) return col;

    float motion = getMotion(uv);
    if (motion < 0.01) return col;

    // Vibrant rainbow trail color based on position and time
    float hue = fract(time * 0.2 + uv.x * 0.8 + uv.y * 0.5 + motion);
    vec3 trailColor = vec3(
        0.5 + 0.5 * cos(6.28318 * (hue + 0.0)),
        0.5 + 0.5 * cos(6.28318 * (hue + 0.33)),
        0.5 + 0.5 * cos(6.28318 * (hue + 0.67))
    );

    // Make trails brighter and more saturated
    trailColor = pow(trailColor, vec3(0.7)) * 1.3;

    // Strong blend based on motion
    float trailStrength = motion * (uMotionIntensity * 4.0 + 0.5);
    return mix(col, trailColor, clamp(trailStrength, 0.0, 1.0));
}
`;

const waveform2DShader = `
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uEnergy;
uniform float uBeat;
uniform sampler2D uSpectrum;
${motionUniforms}

#define PI 3.14159265359

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

${motionHelpers}

void main() {
    vec2 originalUV = gl_FragCoord.xy / uResolution.xy;
    vec2 uv = applyPushDisplace(originalUV);
    vec2 center = uv - 0.5;
    center.x *= uResolution.x / uResolution.y;

    vec3 col = vec3(0.0);

    // Background gradient
    col = mix(vec3(0.02, 0.02, 0.08), vec3(0.08, 0.02, 0.12), uv.y);

    // Sample spectrum with scaled range (microphone only captures low frequencies)
    // Map full screen width to the frequency range that has data (~20% of texture)
    float maxFreqRange = 0.25;
    float texX = pow(uv.x, 1.5) * maxFreqRange;
    float spectrumVal = texture2D(uSpectrum, vec2(texX, 0.5)).r;

    // Amplify and normalize spectrum value
    float waveHeight = spectrumVal * 2.5;

    // Create mirrored waveform centered vertically
    float centerY = 0.5;
    float distFromCenter = abs(uv.y - centerY);

    // Main waveform - mirrored
    float wave = smoothstep(waveHeight * 0.5 + 0.01, waveHeight * 0.5, distFromCenter);

    // Color based on frequency position (left = bass, right = treble)
    float hue = uv.x * 0.7 + uTime * 0.05;
    vec3 waveColor = hsv2rgb(vec3(hue, 0.8, 1.0));

    // Add the main wave
    col += wave * waveColor * (1.0 + uBeat * 0.5);

    // Add glow around the wave
    float glow = 0.02 / (abs(distFromCenter - waveHeight * 0.5) + 0.02);
    col += glow * waveColor * 0.3;

    // === Frequency band indicators ===

    // Bass indicator (left side, bottom)
    float bassBar = smoothstep(0.0, 0.15, uv.x) * smoothstep(0.15, 0.0, uv.x - 0.02);
    float bassHeight = uBass * 0.8;
    float bassWave = smoothstep(bassHeight + 0.01, bassHeight, uv.y) * step(0.0, uv.y);
    col += bassBar * bassWave * vec3(1.0, 0.2, 0.3) * 1.5;

    // Mid indicator (left side, middle)
    float midBar = smoothstep(0.0, 0.17, uv.x) * smoothstep(0.17, 0.0, uv.x - 0.04);
    float midHeight = uMid * 0.8;
    float midWave = smoothstep(midHeight + 0.01, midHeight, uv.y) * step(0.0, uv.y);
    col += midBar * midWave * vec3(0.2, 1.0, 0.3) * 1.2;

    // Treble indicator (left side, top)
    float trebleBar = smoothstep(0.0, 0.19, uv.x) * smoothstep(0.19, 0.0, uv.x - 0.06);
    float trebleHeight = uTreble * 0.8;
    float trebleWave = smoothstep(trebleHeight + 0.01, trebleHeight, uv.y) * step(0.0, uv.y);
    col += trebleBar * trebleWave * vec3(0.3, 0.4, 1.0) * 1.2;

    // === Horizontal frequency bands across screen ===

    // Bass band (bottom third)
    float bassZone = smoothstep(0.0, 0.1, uv.y) * smoothstep(0.35, 0.25, uv.y);
    float bassPulse = uBass * (0.5 + 0.5 * sin(uv.x * 20.0 + uTime * 2.0));
    col += bassZone * bassPulse * vec3(1.0, 0.1, 0.2) * 0.4;

    // Mid band (middle third)
    float midZone = smoothstep(0.3, 0.4, uv.y) * smoothstep(0.7, 0.6, uv.y);
    float midPulse = uMid * (0.5 + 0.5 * sin(uv.x * 30.0 - uTime * 3.0));
    col += midZone * midPulse * vec3(0.1, 1.0, 0.3) * 0.3;

    // Treble band (top third)
    float trebleZone = smoothstep(0.65, 0.75, uv.y) * smoothstep(1.0, 0.9, uv.y);
    float treblePulse = uTreble * (0.5 + 0.5 * sin(uv.x * 50.0 + uTime * 5.0));
    col += trebleZone * treblePulse * vec3(0.2, 0.3, 1.0) * 0.4;

    // === Center line spectrum bars ===
    float numBars = 64.0;
    float barWidth = 1.0 / numBars;
    float barIndex = floor(uv.x * numBars);
    float barX = (barIndex + 0.5) / numBars;

    // Sample spectrum with scaled range for this bar
    float barTexX = pow(barX, 1.5) * maxFreqRange;
    float barSpectrum = texture2D(uSpectrum, vec2(barTexX, 0.5)).r;
    barSpectrum = pow(barSpectrum, 0.7) * 2.0; // Amplify

    // Create bar shape
    float inBar = step(barIndex / numBars, uv.x) * step(uv.x, (barIndex + 0.8) / numBars);
    float barBottom = 0.5 - barSpectrum * 0.4;
    float barTop = 0.5 + barSpectrum * 0.4;
    float inBarY = step(barBottom, uv.y) * step(uv.y, barTop);

    // Bar color based on position
    vec3 barColor = hsv2rgb(vec3(barX * 0.6 + 0.6 + uTime * 0.02, 0.9, 0.9));
    col += inBar * inBarY * barColor * 0.6;

    // Beat flash
    col += vec3(1.0) * uBeat * 0.15;

    // Overall energy brightness
    col *= 0.8 + uEnergy * 0.4;

    // Vignette
    float vignette = 1.0 - length(center) * 0.4;
    col *= vignette;

    // Apply webcam effects
    col = applyPaintTrails(col, originalUV, uTime);

    gl_FragColor = vec4(col, 1.0);
}
`;

const fractalTunnelShader = `
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uEnergy;
uniform float uBeat;
uniform sampler2D uSpectrum;
${motionUniforms}

#define PI 3.14159265359

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

${motionHelpers}

void main() {
    vec2 originalUV = gl_FragCoord.xy / uResolution.xy;
    vec2 screenUV = applyPushDisplace(originalUV);
    vec2 uv = (screenUV * uResolution.xy - 0.5 * uResolution.xy) / uResolution.y;

    // Convert to polar coordinates for tunnel effect
    float angle = atan(uv.y, uv.x);
    float radius = length(uv);

    // Prevent division by zero at center
    radius = max(radius, 0.01);

    // Tunnel depth - inverse of radius creates infinite tunnel illusion
    float depth = 1.0 / radius;

    // Animate flying through tunnel - constant smooth speed
    float speed = 3.0;
    float z = depth + uTime * speed;

    // Gentle continuous twist as we travel
    float twist = angle + z * 0.2;

    // Create repeating ring pattern
    float rings = sin(z * 4.0) * 0.5 + 0.5;
    rings = pow(rings, 0.5);

    // Wall segments - fixed count for stability
    float segments = 12.0;
    float segmentPattern = sin(twist * segments) * 0.5 + 0.5;
    segmentPattern = pow(segmentPattern, 2.0);

    // Grid lines on tunnel walls
    float gridX = smoothstep(0.02, 0.0, abs(fract(twist * segments / (2.0 * PI)) - 0.5) - 0.45);
    float gridZ = smoothstep(0.02, 0.0, abs(fract(z * 0.5) - 0.5) - 0.45);
    float grid = max(gridX, gridZ);

    // Wall color - hue shifts with audio
    float hue = fract(z * 0.05 + uBass * 0.3 + uTreble * 0.2);
    float sat = 0.8;
    float val = 0.2 + rings * 0.3 + segmentPattern * 0.2;

    // Brighten walls based on audio energy
    val += uEnergy * 0.4;

    vec3 col = hsv2rgb(vec3(hue, sat, val));

    // Neon grid lines - intensity reacts to audio
    vec3 gridColor = hsv2rgb(vec3(fract(hue + 0.5), 1.0, 0.8));
    float gridIntensity = 0.6 + uMid * 0.8 + uBeat * 0.5;
    col += grid * gridColor * gridIntensity;

    // Depth fog - darker in distance (center of screen)
    float fog = 1.0 - exp(-radius * 3.0);
    col *= fog;

    // Bass pulses the outer edges (wall glow)
    float wallGlow = pow(radius, 0.3) * uBass * 1.2;
    col += vec3(1.0, 0.2, 0.5) * wallGlow;

    // Treble adds subtle sparkle to the walls (optimized: simpler hash)
    float sparkle = fract(uv.x * 127.1 + uv.y * 311.7);
    col += vec3(0.3, 0.5, 0.8) * sparkle * uTreble * 0.2 * rings;

    // Mid frequencies pulse the ring patterns
    col += vec3(0.2, 0.8, 0.4) * rings * uMid * 0.5;

    // Beat flash - colored instead of white, and more subtle
    col += vec3(0.8, 0.4, 1.0) * uBeat * 0.2 * (1.0 - radius);

    // Center glow - subtle and constant
    float centerGlow = 0.02 / (radius + 0.1);
    col += centerGlow * vec3(0.2, 0.4, 0.8);

    // Apply webcam effects
    col = applyPaintTrails(col, originalUV, uTime);

    gl_FragColor = vec4(col, 1.0);
}
`;

const plasmaDreamShader = `
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uEnergy;
uniform float uBeat;
uniform sampler2D uSpectrum;
${motionUniforms}

#define PI 3.14159265359

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

${motionHelpers}

float plasma(vec2 uv, float time, float freq1, float freq2) {
    float value = 0.0;
    value += sin(uv.x * freq1 + time);
    value += sin(uv.y * freq2 + time * 1.3);
    value += sin((uv.x + uv.y) * freq1 * 0.5 + time * 0.7);
    value += sin(length(uv) * freq2 + time * 0.5);
    return value * 0.25;
}

void main() {
    vec2 originalUV = gl_FragCoord.xy / uResolution.xy;
    vec2 uv = applyPushDisplace(originalUV);
    vec2 center = uv - 0.5;
    center.x *= uResolution.x / uResolution.y;

    float time = uTime * 0.5;

    // Two plasma layers (optimized from 3 - saves 4 sin() calls per pixel)
    float layer1 = plasma(center * 3.0, time, 5.0 + uBass * 3.0, 6.0 + uTreble * 2.0);
    float layer2 = plasma(center * 2.0, time * 1.5, 7.0 + uMid * 2.0, 4.0);

    // Combine layers
    float combined = (layer1 + layer2 * 0.8) / 1.8;

    // Beat pulse
    combined += uBeat * 0.3;

    // Color cycling based on audio frequencies
    float hue = fract(combined + time * 0.1 + uBass * 0.2);
    float saturation = 0.8 + uMid * 0.2;
    float brightness = 0.6 + uEnergy * 0.4;

    // Add spectrum-based color shift (scaled to mic frequency range)
    float maxFreqRange = 0.25;
    float spectrumSample = texture2D(uSpectrum, vec2(uv.x * maxFreqRange, 0.5)).r;
    hue += spectrumSample * 0.2;

    vec3 col = hsv2rgb(vec3(hue, saturation, brightness));

    // Add extra glow on high energy
    col += vec3(uEnergy * 0.2) * max(0.0, sin(combined * PI * 2.0));

    // Smooth edges
    float edgeFade = smoothstep(0.0, 0.1, uv.x) * smoothstep(1.0, 0.9, uv.x) *
                     smoothstep(0.0, 0.1, uv.y) * smoothstep(1.0, 0.9, uv.y);
    col *= edgeFade;

    // Apply webcam effects
    col = applyPaintTrails(col, originalUV, uTime);

    gl_FragColor = vec4(col, 1.0);
}
`;

const kaleidoscopeShader = `
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uEnergy;
uniform float uBeat;
uniform sampler2D uSpectrum;
${motionUniforms}

#define PI 3.14159265359
#define TAU 6.28318530718

mat2 rotate(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat2(c, -s, s, c);
}

${motionHelpers}

// Smooth noise function
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

vec3 kaleidoPattern(vec2 uv, float time) {
    // Add swirl
    float angle = atan(uv.y, uv.x);
    float radius = length(uv);

    angle += sin(radius * 5.0 - time) * 0.5;
    angle += time * 0.3;

    vec2 swirled = vec2(cos(angle), sin(angle)) * radius;

    // Layered patterns (optimized: 1 noise call instead of 2)
    float pattern = 0.0;
    pattern += noise(swirled * 4.0 + time * 0.2);
    pattern += sin(radius * 10.0 - time * 2.0) * 0.4;

    // Color palette based on angle and radius
    vec3 col1 = vec3(0.8, 0.2, 0.5) + vec3(uBass * 0.3);
    vec3 col2 = vec3(0.2, 0.6, 0.9) + vec3(uMid * 0.3);
    vec3 col3 = vec3(0.9, 0.8, 0.1) + vec3(uTreble * 0.3);

    vec3 col = mix(col1, col2, sin(pattern * PI) * 0.5 + 0.5);
    col = mix(col, col3, sin(radius * 5.0 + time) * 0.5 + 0.5);

    return col * (0.7 + pattern * 0.3);
}

void main() {
    vec2 originalUV = gl_FragCoord.xy / uResolution.xy;
    vec2 screenUV = applyPushDisplace(originalUV);
    vec2 uv = (screenUV * uResolution.xy - 0.5 * uResolution.xy) / min(uResolution.x, uResolution.y);

    // Segment count varies with mid frequencies (6-12 segments)
    float segments = 6.0 + floor(uMid * 6.0);

    // Kaleidoscope effect
    float angle = atan(uv.y, uv.x);
    float radius = length(uv);

    // Mirror into segments
    float segmentAngle = TAU / segments;
    angle = mod(angle, segmentAngle);
    angle = abs(angle - segmentAngle * 0.5);

    // Reconstruct UV with mirroring
    vec2 kaleidoUV = vec2(cos(angle), sin(angle)) * radius;

    // Rotate based on time and bass
    kaleidoUV *= rotate(uTime * 0.3 + uBass * PI);

    // Get pattern color
    vec3 col = kaleidoPattern(kaleidoUV, uTime);

    // Beat flash
    col += vec3(uBeat * 0.4);

    // Energy boost
    col *= 0.8 + uEnergy * 0.4;

    // Radial gradient for depth
    float radialGrad = 1.0 - smoothstep(0.0, 1.5, radius);
    col *= 0.5 + radialGrad * 0.5;

    // Add glow at center
    col += vec3(0.5, 0.3, 0.8) * (1.0 - smoothstep(0.0, 0.3, radius)) * uBeat;

    // Apply webcam effects
    col = applyPaintTrails(col, originalUV, uTime);

    gl_FragColor = vec4(col, 1.0);
}
`;

const nebulaParticlesShader = `
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uEnergy;
uniform float uBeat;
uniform sampler2D uSpectrum;
${motionUniforms}

#define PI 3.14159265359

${motionHelpers}

// Hash function for noise
float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

// 3D noise
float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);

    return mix(
        mix(mix(hash(i + vec3(0, 0, 0)), hash(i + vec3(1, 0, 0)), f.x),
            mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
        mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
            mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
        f.z
    );
}

// Fractal Brownian Motion (optimized: 3 iterations instead of 5)
float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;

    for(int i = 0; i < 3; i++) {
        value += amplitude * noise(p * frequency);
        frequency *= 2.0;
        amplitude *= 0.5;
    }

    return value;
}

// Rotate around Y axis
mat2 rotate(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat2(c, -s, s, c);
}

void main() {
    vec2 originalUV = gl_FragCoord.xy / uResolution.xy;
    vec2 screenUV = applyPushDisplace(originalUV);
    vec2 uv = (screenUV * uResolution.xy - 0.5 * uResolution.xy) / min(uResolution.x, uResolution.y);

    // 3D position for noise sampling
    vec3 pos = vec3(uv * 2.0, 0.0);

    // Add swirl motion
    float angle = uTime * 0.2 + length(uv) * 2.0;
    pos.xy *= rotate(angle);

    // Animate through noise space
    pos.z = uTime * 0.3;
    pos.xy += vec2(sin(uTime * 0.1), cos(uTime * 0.15));

    // Sample noise at multiple scales (optimized: 2 fbm calls instead of 3)
    float nebula = fbm(pos * 2.0 + uBass * 0.5);
    nebula += fbm(pos * 5.0 + uMid * 0.3 + uTreble * 0.2) * 0.5;

    // Enhance contrast
    nebula = pow(nebula, 1.5);

    // Color based on frequency bands
    vec3 bassColor = vec3(1.0, 0.1, 0.3) * uBass;
    vec3 midColor = vec3(0.2, 1.0, 0.5) * uMid;
    vec3 trebleColor = vec3(0.3, 0.4, 1.0) * uTreble;

    vec3 col = vec3(0.0);

    // Layer colors based on nebula density
    float layer1 = smoothstep(0.3, 0.6, nebula);
    float layer2 = smoothstep(0.5, 0.8, nebula);
    float layer3 = smoothstep(0.7, 1.0, nebula);

    col += bassColor * layer1 * 2.0;
    col += midColor * layer2 * 2.0;
    col += trebleColor * layer3 * 2.0;

    // Overall brightness based on energy
    col *= 0.5 + uEnergy * 0.8;

    // Add bright cores
    float core = smoothstep(0.8, 1.0, nebula);
    col += vec3(1.0, 0.9, 0.8) * core * 2.0;

    // Pulse with beat
    col += vec3(uBeat * 0.3);

    // Add particles/stars
    vec2 particleUV = uv * 10.0;
    float particles = hash(vec3(floor(particleUV), uTime * 0.1));
    particles = step(0.95, particles) * step(0.1, fract(uTime * 0.5 + particles));
    col += vec3(particles * 0.5);

    // Vignette
    float vignette = 1.0 - length(uv) * 0.4;
    col *= vignette;

    // Apply webcam effects
    col = applyPaintTrails(col, originalUV, uTime);

    gl_FragColor = vec4(col, 1.0);
}
`;

const geometricPulseShader = `
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uEnergy;
uniform float uBeat;
uniform sampler2D uSpectrum;
${motionUniforms}

#define PI 3.14159265359
#define TAU 6.28318530718

mat2 rotate(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat2(c, -s, s, c);
}

${motionHelpers}

// Distance to circle
float circle(vec2 p, float r) {
    return length(p) - r;
}

// Distance to line segment
float line(vec2 p, vec2 a, vec2 b, float thickness) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h) - thickness;
}

// Flower of Life pattern
float flowerOfLife(vec2 uv, float scale, float time) {
    uv *= scale;
    float pattern = 1.0;

    // Center circle
    pattern = min(pattern, abs(circle(uv, 1.0)) - 0.02);

    // 6 surrounding circles
    for(float i = 0.0; i < 6.0; i++) {
        float angle = i * TAU / 6.0 + time * 0.5;
        vec2 offset = vec2(cos(angle), sin(angle)) * (1.0 + uBass * 0.2);
        pattern = min(pattern, abs(circle(uv - offset, 1.0)) - 0.02);
    }

    // Outer ring
    for(float i = 0.0; i < 12.0; i++) {
        float angle = i * TAU / 12.0 - time * 0.3;
        vec2 offset = vec2(cos(angle), sin(angle)) * (2.0 + uMid * 0.3);
        pattern = min(pattern, abs(circle(uv - offset, 1.0)) - 0.02);
    }

    return pattern;
}

// Metatron's Cube (optimized - reduced from 13 to 7 points)
float metatronsCube(vec2 uv, float scale, float time) {
    uv *= scale;
    float pattern = 1.0;

    // 7 circles: center + 6 surrounding (reduced from 13)
    vec2 centers[7];
    centers[0] = vec2(0.0, 0.0);

    float radius = 1.5;
    for(int i = 0; i < 6; i++) {
        float angle = float(i) * TAU / 6.0 + time;
        centers[i + 1] = vec2(cos(angle), sin(angle)) * radius;
    }

    // Draw circles
    for(int i = 0; i < 7; i++) {
        pattern = min(pattern, abs(circle(uv - centers[i], 0.5)) - 0.02);
    }

    // Connect with lines (21 iterations instead of 66)
    float lineThickness = 0.015;
    for(int i = 0; i < 7; i++) {
        for(int j = i + 1; j < 7; j++) {
            float dist = line(uv, centers[i], centers[j], lineThickness);
            pattern = min(pattern, dist);
        }
    }

    return pattern;
}

// Smooth glow
float glow(float dist, float intensity) {
    return intensity / (dist * dist + 0.001);
}

void main() {
    vec2 originalUV = gl_FragCoord.xy / uResolution.xy;
    vec2 screenUV = applyPushDisplace(originalUV);
    vec2 uv = (screenUV * uResolution.xy - 0.5 * uResolution.xy) / min(uResolution.x, uResolution.y);

    // Rotate entire space
    float rotation = uTime * 0.3 + uBeat * PI * 0.1;
    uv *= rotate(rotation);

    // Scale with audio
    float scale = 1.0 + uEnergy * 0.3 + uBeat * 0.2;

    // Switch between patterns based on time
    float pattern;
    float patternSwitch = mod(floor(uTime * 0.1), 2.0);

    if(patternSwitch < 1.0) {
        pattern = flowerOfLife(uv, scale, uTime);
    } else {
        pattern = metatronsCube(uv, scale * 0.5, uTime);
    }

    // Sharp transitions on beats
    if(uBeat > 0.5) {
        pattern *= 1.0 - uBeat * 0.5;
    }

    // Create glowing effect
    vec3 col = vec3(0.0);

    // Multiple colored glows
    col += vec3(1.0, 0.2, 0.4) * glow(pattern, 0.02 * (1.0 + uBass * 2.0));
    col += vec3(0.2, 0.8, 1.0) * glow(pattern, 0.015 * (1.0 + uMid * 2.0));
    col += vec3(0.8, 1.0, 0.2) * glow(pattern, 0.01 * (1.0 + uTreble * 2.0));

    // Solid lines
    col += vec3(1.0) * (1.0 - smoothstep(0.0, 0.01, pattern)) * 0.5;

    // Energy boost
    col *= 0.7 + uEnergy * 0.5;

    // Beat flash
    col += vec3(1.0) * uBeat * 0.3 * exp(-pattern * 5.0);

    // Add rotating spectrum ring (scaled to mic frequency range)
    float angle = atan(uv.y, uv.x);
    float radius = length(uv);
    float maxFreqRange = 0.25;
    float spectrumAngle = (angle / TAU + 0.5) * maxFreqRange;
    float spectrumValue = texture2D(uSpectrum, vec2(spectrumAngle, 0.5)).r;
    float spectrumRing = smoothstep(0.02, 0.0, abs(radius - 2.0 - spectrumValue * 0.5));
    col += vec3(0.5, 1.0, 0.8) * spectrumRing * 2.0;

    // Background gradient
    vec3 bgGrad = mix(vec3(0.0, 0.0, 0.1), vec3(0.1, 0.0, 0.2), length(uv) * 0.3);
    col = mix(bgGrad, col, clamp(col, 0.0, 1.0));

    // Apply webcam effects
    col = applyPaintTrails(col, originalUV, uTime);

    gl_FragColor = vec4(col, 1.0);
}
`;

const blackScreenShader = `
precision highp float;

void main() {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
}
`;

const motionPaintShader = `
precision highp float;

uniform sampler2D uPrevFrame;
uniform sampler2D uMotionTexture;
uniform float uTime;
uniform float uDeltaTime;
uniform vec2 uResolution;

// Configurable parameters
uniform float uPaintSensitivity;  // Motion threshold (default 0.15)
uniform float uPaintColorSpeed;   // Hue cycle speed (default 0.05)
uniform float uPaintFadeDelay;    // Seconds before fading (default 10.0)

// HSV to RGB conversion
vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;

    // Sample previous frame (RGB = color, A = age)
    vec4 prev = texture2D(uPrevFrame, uv);

    // Sample motion texture (flip Y for webcam coords)
    float motion = texture2D(uMotionTexture, vec2(uv.x, 1.0 - uv.y)).r;

    // Check motion against sensitivity threshold
    if (motion > uPaintSensitivity) {
        // Paint with time-based hue
        float hue = fract(uTime * uPaintColorSpeed);
        vec3 color = hsv2rgb(vec3(hue, 0.9, 1.0));
        gl_FragColor = vec4(color, 0.0);  // Reset age to 0
    } else {
        // No motion - age the pixel
        float newAge = prev.a + uDeltaTime / uPaintFadeDelay;

        if (newAge > 1.0) {
            // Fade toward black
            vec3 faded = prev.rgb * (1.0 - uDeltaTime * 0.5);
            gl_FragColor = vec4(faded, 1.0);
        } else {
            // Keep color, increment age
            gl_FragColor = vec4(prev.rgb, newAge);
        }
    }
}
`;

const webcamFeedShader = `
precision highp float;

uniform sampler2D uWebcamTextureHD;
uniform vec2 uResolution;
uniform vec2 uWebcamHDResolution;

void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;

    // Calculate aspect ratios for proper scaling
    float screenAspect = uResolution.x / uResolution.y;
    float webcamAspect = uWebcamHDResolution.x / uWebcamHDResolution.y;

    vec2 webcamUV = uv;

    // Fit webcam to screen while maintaining aspect ratio (cover mode)
    if (screenAspect > webcamAspect) {
        // Screen is wider - fit to width, crop top/bottom
        float scale = screenAspect / webcamAspect;
        webcamUV.y = (uv.y - 0.5) / scale + 0.5;
    } else {
        // Screen is taller - fit to height, crop sides
        float scale = webcamAspect / screenAspect;
        webcamUV.x = (uv.x - 0.5) / scale + 0.5;
    }

    // Flip Y to match webcam orientation
    webcamUV.y = 1.0 - webcamUV.y;

    // Sample HD webcam texture
    vec4 color = texture2D(uWebcamTextureHD, webcamUV);

    gl_FragColor = color;
}
`;

// iPhone Camera shader - supports motion effects when CORS is available
// When CORS is blocked, displays black and an img overlay shows the feed
// When CORS works, this shader renders the feed with motion effects
const iphoneCameraShader = `
precision highp float;

uniform sampler2D uIPhoneTextureHD;
uniform vec2 uResolution;
uniform vec2 uIPhoneHDResolution;
uniform float uIPhoneCORSEnabled;
uniform float uTime;
${motionUniforms}

${motionHelpers}

void main() {
    // If CORS not enabled, show black (img overlay handles display)
    if (uIPhoneCORSEnabled < 0.5) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    vec2 originalUV = gl_FragCoord.xy / uResolution;

    // Apply motion displacement if in push mode
    vec2 uv = applyPushDisplace(originalUV);

    // Calculate aspect ratios for proper scaling
    float screenAspect = uResolution.x / uResolution.y;
    float phoneAspect = uIPhoneHDResolution.x / uIPhoneHDResolution.y;

    vec2 phoneUV = uv;

    // Fit iPhone feed to screen while maintaining aspect ratio (cover mode)
    if (screenAspect > phoneAspect) {
        // Screen is wider - fit to width, crop top/bottom
        float scale = screenAspect / phoneAspect;
        phoneUV.y = (uv.y - 0.5) / scale + 0.5;
    } else {
        // Screen is taller - fit to height, crop sides
        float scale = phoneAspect / screenAspect;
        phoneUV.x = (uv.x - 0.5) / scale + 0.5;
    }

    // Flip Y to match camera orientation
    phoneUV.y = 1.0 - phoneUV.y;

    // Sample iPhone HD texture
    vec3 color = texture2D(uIPhoneTextureHD, phoneUV).rgb;

    // Apply paint trails if in predator mode
    color = applyPaintTrails(color, originalUV, uTime);

    gl_FragColor = vec4(color, 1.0);
}
`;

// Bubble Rain shader - dimmed webcam background for bubble particle overlay
const bubbleRainShader = `
precision highp float;

uniform vec2 uResolution;
uniform sampler2D uWebcamTextureHD;
uniform vec2 uWebcamHDResolution;

void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;

    // Aspect ratio correction for webcam
    float screenAspect = uResolution.x / uResolution.y;
    float webcamAspect = uWebcamHDResolution.x / uWebcamHDResolution.y;
    vec2 webcamUV = uv;

    if (screenAspect > webcamAspect) {
        float scale = screenAspect / webcamAspect;
        webcamUV.y = (uv.y - 0.5) / scale + 0.5;
    } else {
        float scale = webcamAspect / screenAspect;
        webcamUV.x = (uv.x - 0.5) / scale + 0.5;
    }
    webcamUV.y = 1.0 - webcamUV.y;  // Flip Y

    // Dimmed webcam background (40% brightness)
    vec3 bg = texture2D(uWebcamTextureHD, webcamUV).rgb * 0.4;

    gl_FragColor = vec4(bg, 1.0);
}
`;

// Export all shaders
export default {
    shaders: [
        {
            name: "Waveform 2D",
            vertexShader: commonVertexShader,
            fragmentShader: waveform2DShader
        },
        {
            name: "Fractal Tunnel",
            vertexShader: commonVertexShader,
            fragmentShader: fractalTunnelShader
        },
        {
            name: "Plasma Dream",
            vertexShader: commonVertexShader,
            fragmentShader: plasmaDreamShader
        },
        {
            name: "Kaleidoscope",
            vertexShader: commonVertexShader,
            fragmentShader: kaleidoscopeShader
        },
        {
            name: "Nebula Particles",
            vertexShader: commonVertexShader,
            fragmentShader: nebulaParticlesShader
        },
        {
            name: "Geometric Pulse",
            vertexShader: commonVertexShader,
            fragmentShader: geometricPulseShader
        },
        {
            name: "Black",
            vertexShader: commonVertexShader,
            fragmentShader: blackScreenShader
        },
        {
            name: "Motion Paint",
            vertexShader: commonVertexShader,
            fragmentShader: motionPaintShader
        },
        {
            name: "Webcam",
            vertexShader: commonVertexShader,
            fragmentShader: webcamFeedShader
        },
        {
            name: "iPhone Camera",
            vertexShader: commonVertexShader,
            fragmentShader: iphoneCameraShader
        },
        {
            name: "Bubble Rain",
            vertexShader: commonVertexShader,
            fragmentShader: bubbleRainShader
        }
    ]
};
