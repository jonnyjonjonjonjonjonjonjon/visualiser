# Music Visualizer

A real-time audio-reactive WebGL visualizer built with Three.js, featuring 11 shader scenes, webcam integration, iPhone camera support, and particle systems.

## Features

- **11 Visualization Scenes**:
  1. **Waveform 2D** - Spectrum bars and mirrored waveform display
  2. **Fractal Tunnel** - Infinite tunnel with audio-reactive neon grid
  3. **Plasma Dream** - Classic plasma effect with layered sine waves
  4. **Kaleidoscope** - Mirror effect with 6-12 dynamic segments
  5. **Nebula Particles** - Noise-based nebula clouds with RGB frequency mapping
  6. **Black** - Clean black background for webcam/trails overlay
  7. **Motion Paint** - Light-painting effect that captures movement as color
  8. **Webcam** - Direct webcam feed display
  9. **iPhone Camera** - iPhone MJPEG stream with motion effects
  10. **Bubble Rain** - Bubble particles falling over webcam background
  11. **Confetti** - Confetti particles with realistic paper physics

- **Webcam Integration**:
  - Push/Displace mode - distorts visuals away from motion
  - Predator mode - rainbow trails overlay on movement
  - Trails mode - fire/rainbow/audio-reactive spark particles follow motion

- **iPhone Camera Support**:
  - Connect via MJPEG stream from iPhone camera apps
  - Full motion effects when CORS proxy is available
  - Display-only fallback mode

- **Real-time Audio Analysis**:
  - FFT frequency analysis with bass/mid/treble separation
  - Beat detection with configurable sensitivity
  - Adaptive gain normalization

## Installation

### Prerequisites

- Node.js 18+ (https://nodejs.org)
- npm (comes with Node.js)

### Setup

```bash
cd visualiser
npm install
```

## Running

```bash
npm run dev
```

Opens the visualizer in your default browser via Vite dev server with hot reload.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `←` / `→` | Previous / Next scene |
| `1`-`9` | Jump to scenes 1-9 |
| `0` | Jump to scene 10 (Bubble Rain) |
| `←` / `→` | Also reaches scenes 10-11 |
| `Space` | Pause / Resume |
| `M` | Mute audio monitoring |
| `F` or `F11` | Toggle fullscreen |
| `C` | Cycle webcam mode (Off / Push / Predator / Trails) |
| `V` | Cycle spark color (Trails mode only) |
| `+` / `-` | Adjust spark density (Trails mode only) |
| `I` | Connect iPhone camera |
| `D` | Disconnect iPhone camera |
| `P` | Toggle FPS counter |
| `H` | Toggle help overlay |

## Audio Input

The visualizer uses your **microphone** as the audio input. To visualize system audio (music playing from Spotify, YouTube, etc.):

### Virtual Audio Cable (Recommended for Windows)
1. Install [VB-Cable](https://vb-audio.com/Cable/) (free)
2. Set VB-Cable as your default playback device
3. Set VB-Cable as your default recording device
4. Play music — it routes through the virtual cable to the visualizer

### Stereo Mix (if available)
1. Right-click the speaker icon in system tray → Sounds
2. Recording tab → Enable "Stereo Mix"
3. Set Stereo Mix as default recording device

## Technical Details

- **Three.js** - WebGL rendering with custom GLSL shaders
- **Web Audio API** - Real-time FFT analysis and beat detection
- **Vite** - Dev server and production bundler

## License

MIT
