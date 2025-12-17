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
            break;

        case 'ArrowRight':
            visualizer.nextScene();
            updateSceneName(visualizer.getCurrentSceneName());
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
