import AudioAnalyzer from './audioAnalyzer.js';
import Visualizer from './visualizer.js';
import WebcamAnalyzer from './webcamAnalyzer.js';

// DOM elements
const canvas = document.getElementById('visualizer');
const sceneNameEl = document.getElementById('scene-name');
const statusEl = document.getElementById('status');
const helpEl = document.getElementById('help');
const errorEl = document.getElementById('error-message');
const trailsControlsEl = document.getElementById('trails-controls');
const densitySlider = document.getElementById('density-slider');
const densityValueEl = document.getElementById('density-value');
const particlesSlider = document.getElementById('particles-slider');
const particlesValueEl = document.getElementById('particles-value');
const sizeSlider = document.getElementById('size-slider');
const sizeValueEl = document.getElementById('size-value');
// Paint controls
const paintControlsEl = document.getElementById('paint-controls');
const paintSensitivitySlider = document.getElementById('paint-sensitivity');
const paintSensitivityValueEl = document.getElementById('paint-sensitivity-value');
const paintColorSpeedSlider = document.getElementById('paint-color-speed');
const paintColorSpeedValueEl = document.getElementById('paint-color-speed-value');
const paintFadeDelaySlider = document.getElementById('paint-fade-delay');
const paintFadeDelayValueEl = document.getElementById('paint-fade-delay-value');

// App state
let audioAnalyzer = null;
let visualizer = null;
let webcamAnalyzer = null;
let isPaused = false;
let isHelpVisible = false;
let mouseTimeout = null;

// Handle resize events
function resizeCanvas() {
    if (visualizer) {
        visualizer.handleResize();
    } else {
        // Before visualizer exists, set canvas size directly
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
}

// Show cursor and overlay on mouse move
function handleMouseMove() {
    document.body.classList.add('show-cursor');

    clearTimeout(mouseTimeout);
    mouseTimeout = setTimeout(() => {
        document.body.classList.remove('show-cursor');
    }, 2000);
}

// Update scene name in UI
function updateSceneName(name) {
    sceneNameEl.textContent = name;
}

// Show error message
function showError(message) {
    errorEl.querySelector('p').textContent = message;
    errorEl.classList.add('visible');
    document.body.classList.add('show-cursor');
}

// Hide error message
function hideError() {
    errorEl.classList.remove('visible');
}

// Show/hide trails controls based on mode
function updateTrailsControlsVisibility() {
    if (webcamAnalyzer && webcamAnalyzer.getMode() === 3) {
        trailsControlsEl.classList.add('visible');
    } else {
        trailsControlsEl.classList.remove('visible');
    }
}

// Update trails controls UI to match current settings
function updateTrailsControlsUI() {
    if (!visualizer) return;

    // Update color buttons
    const colorMode = visualizer.sparkSystem ? visualizer.sparkSystem.getColorMode() : 0;
    trailsControlsEl.querySelectorAll('[data-color]').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.color) === colorMode);
    });

    // Update density slider
    const density = visualizer.getSparkDensity();
    densitySlider.value = density * 100;
    densityValueEl.textContent = `${Math.round(density * 100)}%`;

    // Update particles slider
    const particles = visualizer.sparkSystem ? visualizer.sparkSystem.getMaxParticles() : 2000;
    particlesSlider.value = particles;
    particlesValueEl.textContent = particles.toString();

    // Update size slider (convert multiplier back to slider value)
    const size = visualizer.sparkSystem ? visualizer.sparkSystem.getSizeMultiplier() : 1.0;
    sizeSlider.value = Math.round((size - 1.0) * 100);  // 1.0x → 0, 2.0x → 100, 0.5x → -50
    sizeValueEl.textContent = `${Math.round(size * 100)}%`;
}

// Initialize trails controls event listeners
function initTrailsControls() {
    // Color buttons
    trailsControlsEl.querySelectorAll('[data-color]').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!visualizer || !visualizer.sparkSystem) return;
            const mode = parseInt(btn.dataset.color);
            visualizer.sparkSystem.setColorMode(mode);
            updateTrailsControlsUI();
        });
    });

    // Density slider
    densitySlider.addEventListener('input', () => {
        if (!visualizer || !visualizer.sparkSystem) return;
        const density = densitySlider.value / 100;
        visualizer.sparkSystem.setDensity(density);
        densityValueEl.textContent = `${Math.round(density * 100)}%`;
    });

    // Particles slider
    particlesSlider.addEventListener('input', () => {
        if (!visualizer || !visualizer.sparkSystem) return;
        const particles = parseInt(particlesSlider.value);
        visualizer.sparkSystem.setMaxParticles(particles);
        particlesValueEl.textContent = particles.toString();
    });

    // Size slider: 0 = normal (1.0x), positive = bigger, negative = smaller
    sizeSlider.addEventListener('input', () => {
        if (!visualizer || !visualizer.sparkSystem) return;
        const size = 1.0 + parseInt(sizeSlider.value) / 100;  // 0 → 1.0x, 100 → 2.0x, -50 → 0.5x
        visualizer.sparkSystem.setSizeMultiplier(size);
        sizeValueEl.textContent = `${Math.round(size * 100)}%`;
    });
}

// Show/hide paint controls based on current visualization
function updatePaintControlsVisibility() {
    if (visualizer && visualizer.getCurrentSceneName() === 'Motion Paint') {
        paintControlsEl.classList.add('visible');
    } else {
        paintControlsEl.classList.remove('visible');
    }
}

// Update paint controls UI to match current settings
function updatePaintControlsUI() {
    if (!visualizer) return;

    // Sensitivity: slider value 5-50, uniform value 0.05-0.50
    const sensitivity = visualizer.uniforms.uPaintSensitivity.value;
    paintSensitivitySlider.value = Math.round(sensitivity * 100);
    paintSensitivityValueEl.textContent = `${Math.round(sensitivity * 100)}%`;

    // Color speed: slider value 1-20, uniform value 0.01-0.20
    const colorSpeed = visualizer.uniforms.uPaintColorSpeed.value;
    paintColorSpeedSlider.value = Math.round(colorSpeed * 100);
    paintColorSpeedValueEl.textContent = Math.round(colorSpeed * 100).toString();

    // Fade delay: slider value 2-30, uniform value 2.0-30.0
    const fadeDelay = visualizer.uniforms.uPaintFadeDelay.value;
    paintFadeDelaySlider.value = Math.round(fadeDelay);
    paintFadeDelayValueEl.textContent = `${Math.round(fadeDelay)}s`;
}

// Initialize paint controls event listeners
function initPaintControls() {
    // Sensitivity slider
    paintSensitivitySlider.addEventListener('input', () => {
        if (!visualizer) return;
        const sensitivity = parseInt(paintSensitivitySlider.value) / 100;
        visualizer.uniforms.uPaintSensitivity.value = sensitivity;
        paintSensitivityValueEl.textContent = `${paintSensitivitySlider.value}%`;
    });

    // Color speed slider
    paintColorSpeedSlider.addEventListener('input', () => {
        if (!visualizer) return;
        const colorSpeed = parseInt(paintColorSpeedSlider.value) / 100;
        visualizer.uniforms.uPaintColorSpeed.value = colorSpeed;
        paintColorSpeedValueEl.textContent = paintColorSpeedSlider.value;
    });

    // Fade delay slider
    paintFadeDelaySlider.addEventListener('input', () => {
        if (!visualizer) return;
        const fadeDelay = parseInt(paintFadeDelaySlider.value);
        visualizer.uniforms.uPaintFadeDelay.value = fadeDelay;
        paintFadeDelayValueEl.textContent = `${fadeDelay}s`;
    });
}

// Initialize audio
async function initAudio() {
    try {
        statusEl.textContent = 'Requesting microphone access...';
        audioAnalyzer = new AudioAnalyzer();
        await audioAnalyzer.init();
        statusEl.textContent = 'Audio ready';
        hideError();
        return true;
    } catch (error) {
        console.error('Failed to initialize audio:', error);
        statusEl.textContent = 'Audio initialization failed';
        showError('This visualizer needs access to your microphone to analyze audio. Please grant permission and reload the application.');
        return false;
    }
}

// Initialize visualizer
function initVisualizer() {
    visualizer = new Visualizer(canvas);
    visualizer.init();
    updateSceneName(visualizer.getCurrentSceneName());
}

// Render loop
function render() {
    if (!isPaused && audioAnalyzer && visualizer) {
        const audioData = audioAnalyzer.getAudioData();
        const motionData = webcamAnalyzer ? webcamAnalyzer.getMotionData() : null;
        visualizer.update(audioData, motionData);
        visualizer.render();
    }

    requestAnimationFrame(render);
}

// Keyboard controls
function handleKeyPress(event) {
    if (!visualizer) return;

    switch(event.key) {
        case 'ArrowLeft':
            visualizer.previousScene();
            updateSceneName(visualizer.getCurrentSceneName());
            updatePaintControlsVisibility();
            break;

        case 'ArrowRight':
            visualizer.nextScene();
            updateSceneName(visualizer.getCurrentSceneName());
            updatePaintControlsVisibility();
            break;

        case ' ':
            event.preventDefault();
            isPaused = !isPaused;
            statusEl.textContent = isPaused ? 'Paused' : 'Playing';
            break;

        case 'm':
        case 'M':
            if (audioAnalyzer) {
                audioAnalyzer.toggleMute();
                const isMuted = audioAnalyzer.isMuted();
                statusEl.textContent = isMuted ? 'Audio muted' : 'Audio unmuted';
            }
            break;

        case 'f':
        case 'F':
        case 'F11':
            event.preventDefault();
            if (window.electronAPI) {
                window.electronAPI.toggleFullscreen();
            }
            break;

        case 't':
        case 'T':
            if (window.electronAPI) {
                window.electronAPI.toggleAlwaysOnTop();
            }
            break;

        case 'h':
        case 'H':
            isHelpVisible = !isHelpVisible;
            if (isHelpVisible) {
                helpEl.classList.add('visible');
            } else {
                helpEl.classList.remove('visible');
            }
            break;

        case 'c':
        case 'C':
            if (webcamAnalyzer) {
                const modeName = webcamAnalyzer.cycleMode();
                statusEl.textContent = `Webcam: ${modeName}`;
                updateTrailsControlsVisibility();
                updateTrailsControlsUI();
            } else {
                statusEl.textContent = 'Webcam not available';
            }
            break;

        case 'v':
        case 'V':
            // Cycle spark color mode (only in Trails mode)
            if (webcamAnalyzer && webcamAnalyzer.getMode() === 3 && visualizer) {
                const colorMode = visualizer.cycleSparkColorMode();
                statusEl.textContent = `Spark Color: ${colorMode}`;
                updateTrailsControlsUI();
            }
            break;

        case '+':
        case '=':
            // Increase spark density (only in Trails mode)
            if (webcamAnalyzer && webcamAnalyzer.getMode() === 3 && visualizer) {
                const density = visualizer.adjustSparkDensity(0.25);
                statusEl.textContent = `Spark Density: ${(density * 100).toFixed(0)}%`;
                updateTrailsControlsUI();
            }
            break;

        case '-':
        case '_':
            // Decrease spark density (only in Trails mode)
            if (webcamAnalyzer && webcamAnalyzer.getMode() === 3 && visualizer) {
                const density = visualizer.adjustSparkDensity(-0.25);
                statusEl.textContent = `Spark Density: ${(density * 100).toFixed(0)}%`;
                updateTrailsControlsUI();
            }
            break;

        default:
            // Number keys 1-9 for direct scene selection
            const num = parseInt(event.key);
            if (num >= 1 && num <= 9) {
                visualizer.setScene(num - 1);
                updateSceneName(visualizer.getCurrentSceneName());
                updatePaintControlsVisibility();
            }
            break;
    }
}

// Initialize app
async function init() {
    // Set up event listeners
    window.addEventListener('resize', resizeCanvas);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('keydown', handleKeyPress);

    // Initialize components
    statusEl.textContent = 'Initializing...';

    const audioInitialized = await initAudio();

    if (audioInitialized) {
        resizeCanvas();
        initVisualizer();
        initTrailsControls();
        initPaintControls();

        // Initialize webcam analyzer (non-blocking, graceful failure)
        try {
            webcamAnalyzer = new WebcamAnalyzer();
            await webcamAnalyzer.init();
            statusEl.textContent = 'Ready - Press H for help, C for webcam';
        } catch (error) {
            console.error('Webcam initialization failed:', error);
            statusEl.textContent = `Webcam error: ${error.message}`;
            webcamAnalyzer = null;
            // After 3 seconds, change to normal status
            setTimeout(() => {
                statusEl.textContent = 'Ready - Press H for help';
            }, 3000);
        }

        // Start render loop
        render();

        // Show cursor briefly at start
        document.body.classList.add('show-cursor');
        setTimeout(() => {
            document.body.classList.remove('show-cursor');
        }, 3000);
    }
}

// Start the app
init();
