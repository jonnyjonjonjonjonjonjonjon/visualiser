import AudioAnalyzer from './audioAnalyzer.js';
import Visualizer from './visualizer.js';
import WebcamAnalyzer from './webcamAnalyzer.js';
import IPhoneCameraSource from './iphoneCameraSource.js';

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
// Fullscreen button
const fullscreenBtn = document.getElementById('fullscreen-btn');
// iPhone modal elements
const iphoneModalEl = document.getElementById('iphone-modal');
const iphoneUrlInput = document.getElementById('iphone-url');
const iphoneConnectBtn = document.getElementById('iphone-connect-btn');
const iphoneCancelBtn = document.getElementById('iphone-cancel-btn');
const iphoneErrorEl = document.getElementById('iphone-error');
const iphoneStatusEl = document.getElementById('iphone-status');
const iphoneFeedEl = document.getElementById('iphone-feed');

// App state
let audioAnalyzer = null;
let visualizer = null;
let webcamAnalyzer = null;
let iphoneSource = null;
let isPaused = false;
let isHelpVisible = false;
let mouseTimeout = null;
let statusTimeout = null;

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

// Update scene name in UI and keep overlay visible
function updateSceneName(name) {
    sceneNameEl.textContent = name;
    document.body.classList.add('show-cursor');

    clearTimeout(statusTimeout);
    clearTimeout(mouseTimeout);

    statusTimeout = setTimeout(() => {
        document.body.classList.remove('show-cursor');
    }, 3000);
}

// Show status message and keep UI visible for a few seconds
function showStatus(message, duration = 3000) {
    statusEl.textContent = message;
    document.body.classList.add('show-cursor');

    clearTimeout(statusTimeout);
    clearTimeout(mouseTimeout);

    statusTimeout = setTimeout(() => {
        document.body.classList.remove('show-cursor');
    }, duration);
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

// Show/hide trails controls based on mode (webcam or iPhone)
function updateTrailsControlsVisibility() {
    const isWebcamTrails = webcamAnalyzer && webcamAnalyzer.getMode() === 3;
    const isIPhoneTrails = iphoneSource && iphoneSource.hasCORS() && iphoneSource.getMode() === 3 &&
                           visualizer && visualizer.getCurrentSceneName() === 'iPhone Camera';

    if (isWebcamTrails || isIPhoneTrails) {
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

// Show iPhone connection modal
function showIPhoneModal() {
    iphoneModalEl.classList.add('visible');
    iphoneErrorEl.classList.remove('visible');
    iphoneStatusEl.classList.remove('visible');
    iphoneConnectBtn.disabled = false;
    iphoneUrlInput.focus();
    document.body.classList.add('show-cursor');
}

// Hide iPhone connection modal
function hideIPhoneModal() {
    iphoneModalEl.classList.remove('visible');
    iphoneErrorEl.classList.remove('visible');
    iphoneStatusEl.classList.remove('visible');
}

// Connect to iPhone camera stream
async function connectIPhone() {
    const url = iphoneUrlInput.value.trim();

    if (!url) {
        iphoneErrorEl.textContent = 'Please enter a stream URL';
        iphoneErrorEl.classList.add('visible');
        return;
    }

    // Validate URL format
    try {
        new URL(url);
    } catch (e) {
        iphoneErrorEl.textContent = 'Invalid URL format';
        iphoneErrorEl.classList.add('visible');
        return;
    }

    // Show connecting status
    iphoneErrorEl.classList.remove('visible');
    iphoneStatusEl.classList.add('visible');
    iphoneConnectBtn.disabled = true;

    try {
        // Disconnect existing source if any
        if (iphoneSource) {
            iphoneSource.destroy();
        }

        iphoneSource = new IPhoneCameraSource();
        await iphoneSource.connect(url);

        hideIPhoneModal();

        // Show connection status with CORS info
        if (iphoneSource.hasCORS()) {
            showStatus('iPhone connected (effects available)');
            // Set CORS flag in visualizer
            if (visualizer) {
                visualizer.setIPhoneCORSEnabled(true);
            }
        } else {
            showStatus('iPhone connected (display only)');
            if (visualizer) {
                visualizer.setIPhoneCORSEnabled(false);
            }
        }

        // Store URL for reconnection
        localStorage.setItem('iphoneStreamUrl', url);

        // Show feed if on iPhone Camera visualization
        updateIPhoneFeedVisibility();

    } catch (error) {
        console.error('iPhone connection failed:', error);
        iphoneErrorEl.textContent = error.message || 'Failed to connect to stream';
        iphoneErrorEl.classList.add('visible');
        iphoneStatusEl.classList.remove('visible');
        iphoneConnectBtn.disabled = false;
        iphoneSource = null;
    }
}

// Disconnect iPhone camera
function disconnectIPhone() {
    if (iphoneSource) {
        iphoneSource.destroy();
        iphoneSource = null;
        showStatus('iPhone camera disconnected');
    }
    // Reset CORS flag in visualizer
    if (visualizer) {
        visualizer.setIPhoneCORSEnabled(false);
    }
    // Hide the feed overlay
    iphoneFeedEl.style.display = 'none';
    iphoneFeedEl.src = '';
}

// Update iPhone feed visibility based on current scene and connection
function updateIPhoneFeedVisibility() {
    const isIPhoneScene = visualizer && visualizer.getCurrentSceneName() === 'iPhone Camera';
    const isConnected = iphoneSource && iphoneSource.isStreaming();
    const hasCORS = iphoneSource && iphoneSource.hasCORS();

    // Only show img overlay if:
    // 1. On iPhone Camera scene
    // 2. Connected to iPhone
    // 3. CORS is NOT available (rendering via WebGL when CORS works)
    if (isIPhoneScene && isConnected && !hasCORS) {
        iphoneFeedEl.src = iphoneSource.getUrl();
        iphoneFeedEl.style.display = 'block';
    } else {
        iphoneFeedEl.style.display = 'none';
    }
}

// Initialize fullscreen button
function initFullscreenButton() {
    fullscreenBtn.addEventListener('click', async () => {
        if (window.electronAPI) {
            const result = await window.electronAPI.toggleFullscreen();
            if (result && result.success) {
                fullscreenBtn.classList.toggle('is-fullscreen', result.isFullScreen);
                // Trigger resize after fullscreen transition
                setTimeout(resizeCanvas, 100);
            }
        } else {
            // Fallback for browser - use Fullscreen API on canvas element
            if (!document.fullscreenElement) {
                canvas.requestFullscreen().catch(err => {
                    console.error('Fullscreen error:', err);
                });
                fullscreenBtn.classList.add('is-fullscreen');
            } else {
                document.exitFullscreen();
                fullscreenBtn.classList.remove('is-fullscreen');
            }
            // Trigger resize multiple times to catch the fullscreen transition
            setTimeout(resizeCanvas, 50);
            setTimeout(resizeCanvas, 150);
            setTimeout(resizeCanvas, 300);
        }
    });

    // Listen for fullscreen changes from Electron (keyboard shortcuts F/F11)
    if (window.electronAPI && window.electronAPI.onFullscreenChanged) {
        window.electronAPI.onFullscreenChanged((isFullScreen) => {
            fullscreenBtn.classList.toggle('is-fullscreen', isFullScreen);
            // Trigger resize multiple times to catch the fullscreen transition
            setTimeout(resizeCanvas, 50);
            setTimeout(resizeCanvas, 150);
            setTimeout(resizeCanvas, 300);
        });
    }

    // Listen for fullscreen changes from browser Fullscreen API
    document.addEventListener('fullscreenchange', () => {
        fullscreenBtn.classList.toggle('is-fullscreen', !!document.fullscreenElement);
        // Trigger resize after fullscreen transition
        setTimeout(resizeCanvas, 100);
    });

    // Listen for window resize events from Electron main process
    if (window.electronAPI && window.electronAPI.onWindowResized) {
        window.electronAPI.onWindowResized(() => {
            resizeCanvas();
        });
    }
}

// Initialize iPhone modal event listeners
function initIPhoneControls() {
    iphoneConnectBtn.addEventListener('click', connectIPhone);
    iphoneCancelBtn.addEventListener('click', hideIPhoneModal);

    // Connect on Enter key
    iphoneUrlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            connectIPhone();
        } else if (e.key === 'Escape') {
            hideIPhoneModal();
        }
    });

    // Close modal on backdrop click
    iphoneModalEl.addEventListener('click', (e) => {
        if (e.target === iphoneModalEl) {
            hideIPhoneModal();
        }
    });

    // Restore last used URL
    const savedUrl = localStorage.getItem('iphoneStreamUrl');
    if (savedUrl) {
        iphoneUrlInput.value = savedUrl;
    }
}

// Initialize audio
async function initAudio() {
    try {
        statusEl.textContent = 'Requesting microphone access...';
        console.log('Initializing audio analyzer...');

        // Check if mediaDevices API is available (requires secure context)
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
            throw new Error('Media devices not available (requires HTTPS or localhost)');
        }

        // Check available devices first
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(d => d.kind === 'audioinput');
        console.log('Available audio inputs:', audioInputs.length, audioInputs);

        if (audioInputs.length === 0) {
            throw new Error('No audio input devices found');
        }

        audioAnalyzer = new AudioAnalyzer();
        await audioAnalyzer.init();
        console.log('Audio analyzer initialized successfully');
        statusEl.textContent = 'Audio ready';
        hideError();
        return true;
    } catch (error) {
        console.error('Failed to initialize audio:', error);
        statusEl.textContent = 'No audio';
        // Don't show error overlay - just log it
        console.warn('Audio not available:', error.message);
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
    // Check if canvas needs resizing (handles fullscreen and window changes)
    if (visualizer) {
        const canvas = document.getElementById('visualizer');
        if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
            visualizer.handleResize();
        }
    }

    if (!isPaused && visualizer) {
        // Get audio data if available, otherwise use defaults
        const audioData = audioAnalyzer ? audioAnalyzer.getAudioData() : {
            bass: 0,
            mid: 0,
            treble: 0,
            energy: 0,
            beat: false,
            spectrum: new Uint8Array(512)
        };
        const currentScene = visualizer.getCurrentSceneName();

        // Choose motion source based on current scene
        let motionData = null;

        if (currentScene === 'iPhone Camera' && iphoneSource && iphoneSource.hasCORS() && iphoneSource.isActive()) {
            // Use iPhone motion data when on iPhone Camera scene with CORS and effects enabled
            motionData = iphoneSource.getMotionData();

            // Update iPhone HD texture from motion data
            if (motionData) {
                visualizer.updateIPhoneTextureFromMotionData(motionData);
            }
        } else if (webcamAnalyzer) {
            // Use webcam motion data for all other scenes
            motionData = webcamAnalyzer.getMotionData();
        }

        visualizer.update(audioData, motionData);

        // Update iPhone texture when on iPhone Camera scene with CORS
        if (currentScene === 'iPhone Camera' && iphoneSource && iphoneSource.isStreaming() && iphoneSource.hasCORS()) {
            // Always update the HD texture for display
            const imgElement = iphoneSource.getImageElement();
            if (imgElement) {
                visualizer.updateIPhoneHDTexture(imgElement);
            }
        }

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
            updateIPhoneFeedVisibility();
            break;

        case 'ArrowRight':
            visualizer.nextScene();
            updateSceneName(visualizer.getCurrentSceneName());
            updatePaintControlsVisibility();
            updateIPhoneFeedVisibility();
            break;

        case ' ':
            event.preventDefault();
            isPaused = !isPaused;
            showStatus(isPaused ? 'Paused' : 'Playing');
            break;

        case 'm':
        case 'M':
            if (audioAnalyzer) {
                audioAnalyzer.toggleMute();
                const isMuted = audioAnalyzer.isMuted();
                showStatus(isMuted ? 'Audio muted' : 'Audio unmuted');
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
            // Check if we're on iPhone Camera scene with CORS available
            if (visualizer.getCurrentSceneName() === 'iPhone Camera' && iphoneSource && iphoneSource.hasCORS()) {
                const modeName = iphoneSource.cycleMode();
                showStatus(`iPhone: ${modeName}`);
                updateTrailsControlsVisibility();
                updateTrailsControlsUI();
            } else if (webcamAnalyzer) {
                const modeName = webcamAnalyzer.cycleMode();
                showStatus(`Webcam: ${modeName}`);
                updateTrailsControlsVisibility();
                updateTrailsControlsUI();
            } else {
                showStatus('Webcam not available');
            }
            break;

        case 'v':
        case 'V':
            // Cycle spark color mode (only in Trails mode - webcam or iPhone)
            {
                const isWebcamTrails = webcamAnalyzer && webcamAnalyzer.getMode() === 3;
                const isIPhoneTrails = iphoneSource && iphoneSource.hasCORS() && iphoneSource.getMode() === 3 &&
                                       visualizer.getCurrentSceneName() === 'iPhone Camera';
                if ((isWebcamTrails || isIPhoneTrails) && visualizer) {
                    const colorMode = visualizer.cycleSparkColorMode();
                    showStatus(`Spark Color: ${colorMode}`);
                    updateTrailsControlsUI();
                }
            }
            break;

        case '+':
        case '=':
            // Increase spark density (only in Trails mode - webcam or iPhone)
            {
                const isWebcamTrails = webcamAnalyzer && webcamAnalyzer.getMode() === 3;
                const isIPhoneTrails = iphoneSource && iphoneSource.hasCORS() && iphoneSource.getMode() === 3 &&
                                       visualizer.getCurrentSceneName() === 'iPhone Camera';
                if ((isWebcamTrails || isIPhoneTrails) && visualizer) {
                    const density = visualizer.adjustSparkDensity(0.25);
                    showStatus(`Spark Density: ${(density * 100).toFixed(0)}%`);
                    updateTrailsControlsUI();
                }
            }
            break;

        case '-':
        case '_':
            // Decrease spark density (only in Trails mode - webcam or iPhone)
            {
                const isWebcamTrails = webcamAnalyzer && webcamAnalyzer.getMode() === 3;
                const isIPhoneTrails = iphoneSource && iphoneSource.hasCORS() && iphoneSource.getMode() === 3 &&
                                       visualizer.getCurrentSceneName() === 'iPhone Camera';
                if ((isWebcamTrails || isIPhoneTrails) && visualizer) {
                    const density = visualizer.adjustSparkDensity(-0.25);
                    showStatus(`Spark Density: ${(density * 100).toFixed(0)}%`);
                    updateTrailsControlsUI();
                }
            }
            break;

        case 'i':
        case 'I':
            // Show iPhone connection modal (but not if modal is already visible)
            if (!iphoneModalEl.classList.contains('visible')) {
                showIPhoneModal();
            }
            break;

        case 'd':
        case 'D':
            // Disconnect iPhone camera
            if (iphoneSource) {
                disconnectIPhone();
            }
            break;

        default:
            // Number keys 1-9 for direct scene selection
            const num = parseInt(event.key);
            if (num >= 1 && num <= 9) {
                visualizer.setScene(num - 1);
                updateSceneName(visualizer.getCurrentSceneName());
                updatePaintControlsVisibility();
                updateIPhoneFeedVisibility();
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

    // Continue even without audio (for testing iPhone camera, etc.)
    resizeCanvas();
    initVisualizer();
    initTrailsControls();
    initPaintControls();
    initIPhoneControls();
    initFullscreenButton();
    hideError();

    if (audioInitialized) {
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
    } else {
        statusEl.textContent = 'No audio - Press I for iPhone camera';
    }

    // Start render loop
    render();

    // Show cursor briefly at start
    document.body.classList.add('show-cursor');
    setTimeout(() => {
        document.body.classList.remove('show-cursor');
    }, 3000);
}

// Start the app
init();
