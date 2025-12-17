import AudioAnalyzer from './audioAnalyzer.js';
import Visualizer from './visualizer.js';

// DOM elements
const canvas = document.getElementById('visualizer');
const sceneNameEl = document.getElementById('scene-name');
const statusEl = document.getElementById('status');
const helpEl = document.getElementById('help');
const errorEl = document.getElementById('error-message');

// App state
let audioAnalyzer = null;
let visualizer = null;
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
        visualizer.update(audioData);
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
        statusEl.textContent = 'Ready - Press H for help';

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
