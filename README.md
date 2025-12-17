# Music Visualizer

A psychedelic music visualization app that creates beautiful, reactive visuals from audio input.

## Features

- **6 Unique Visualization Scenes**:
  1. **Fractal Tunnel** - Raymarched fractal with audio-reactive zoom
  2. **Plasma Dream** - Classic plasma effect with layered sine waves
  3. **Kaleidoscope** - Mirror effect with 6-12 dynamic segments
  4. **Waveform Terrain** - 3D neon grid terrain driven by audio spectrum
  5. **Nebula Particles** - Noise-based nebula clouds with RGB frequency mapping
  6. **Geometric Pulse** - Sacred geometry (Flower of Life, Metatron's Cube)

- **Real-time Audio Analysis**:
  - FFT frequency analysis
  - Beat detection
  - Bass/Mid/Treble separation
  - Adaptive gain normalization

- **Controls**:
  - Switch between scenes with arrow keys or number keys
  - Fullscreen mode
  - Always-on-top window option

## Installation

### Prerequisites

- Node.js 18+ (https://nodejs.org)
- npm (comes with Node.js)

### Setup

```bash
# Clone or download this project
cd visualiser

# Install dependencies
npm install
```

## Running the App

### Development Mode
```bash
npm run dev
```
This starts Vite dev server with hot reload and opens Electron.

### Production Mode
```bash
# Build the renderer first
npm run build:renderer

# Run the app
npm start
```

## Building for Distribution

### Windows
```bash
npm run build:win
```
Creates installer and portable executable in `build/` folder.

### macOS
```bash
npm run build:mac
```

### Linux
```bash
npm run build:linux
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `←` / `→` | Previous / Next scene |
| `1` - `6` | Jump to specific scene |
| `Space` | Pause / Resume |
| `F` or `F11` | Toggle fullscreen |
| `T` | Toggle always-on-top |
| `H` | Show/hide help overlay |
| `M` | Mute audio monitoring |
| `Esc` | Exit fullscreen |

## Audio Input

The visualizer uses your **microphone** as the audio input. To visualize system audio (music playing from Spotify, YouTube, etc.), you have two options:

### Option 1: Virtual Audio Cable (Recommended for Windows)
1. Install [VB-Cable](https://vb-audio.com/Cable/) (free)
2. Set VB-Cable as your default playback device
3. Set VB-Cable as your default recording device
4. Play music - it routes through the virtual cable to the visualizer

### Option 2: Stereo Mix (if available)
1. Right-click the speaker icon in system tray → Sounds
2. Recording tab → Enable "Stereo Mix"
3. Set Stereo Mix as default recording device

### Option 3: Physical Setup
- Use speakers and place the microphone near them
- Works but may pick up ambient noise

## Project Structure

```
visualiser/
├── src/
│   ├── main/           # Electron main process
│   │   ├── main.js     # App entry, window management
│   │   └── preload.js  # Secure IPC bridge
│   └── renderer/       # Frontend (runs in browser context)
│       ├── index.html  # Main HTML
│       ├── index.js    # App initialization
│       ├── audioAnalyzer.js  # Web Audio API analysis
│       ├── visualizer.js     # Three.js rendering engine
│       └── shaders/
│           └── index.js      # GLSL fragment shaders
├── dist/               # Built renderer files
├── build/              # Packaged app output
├── vite.config.js      # Vite bundler config
└── package.json
```

## Technical Details

- **Electron** - Desktop app framework
- **Three.js** - WebGL rendering
- **Web Audio API** - Real-time audio analysis
- **GLSL** - GPU shader programs for visuals
- **Vite** - Fast bundler with hot reload

## Troubleshooting

### "Microphone Access Required" Error
- Grant microphone permission when prompted
- Check browser/system privacy settings

### No Visuals / Black Screen
- Check browser console for errors (F12)
- Ensure WebGL is enabled in your browser

### Visuals Not Reacting to Audio
- Verify correct audio input is selected
- Check that audio is actually playing
- Try adjusting your microphone volume

## License

MIT
