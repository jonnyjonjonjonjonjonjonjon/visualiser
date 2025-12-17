const { contextBridge, ipcRenderer } = require('electron');

/**
 * Preload script for music visualizer
 * Exposes a secure API to the renderer process via contextBridge
 */

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Toggle fullscreen mode
   * @returns {Promise<boolean>} New fullscreen state
   */
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),

  /**
   * Toggle always on top mode
   * @returns {Promise<boolean>} New always on top state
   */
  toggleAlwaysOnTop: () => ipcRenderer.invoke('toggle-always-on-top'),

  /**
   * Get available audio input devices
   * @returns {Promise<Array>} List of audio input devices
   */
  getAudioDevices: () => ipcRenderer.invoke('get-audio-devices'),

  /**
   * Register callback for receiving audio data from native capture
   * @param {Function} callback - Function to handle audio data
   * @returns {Function} Cleanup function to remove listener
   */
  onAudioData: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('audio-data', subscription);

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener('audio-data', subscription);
    };
  },

  /**
   * Start MJPEG proxy server for iPhone camera stream
   * @param {string} targetUrl - The MJPEG stream URL to proxy
   * @returns {Promise<{success: boolean, proxyUrl?: string, error?: string}>}
   */
  startMjpegProxy: (targetUrl) => ipcRenderer.invoke('start-mjpeg-proxy', targetUrl),

  /**
   * Stop MJPEG proxy server
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  stopMjpegProxy: () => ipcRenderer.invoke('stop-mjpeg-proxy'),

  /**
   * Register callback for fullscreen state changes
   * @param {Function} callback - Function to handle fullscreen changes
   * @returns {Function} Cleanup function to remove listener
   */
  onFullscreenChanged: (callback) => {
    const subscription = (event, isFullScreen) => callback(isFullScreen);
    ipcRenderer.on('fullscreen-changed', subscription);
    return () => {
      ipcRenderer.removeListener('fullscreen-changed', subscription);
    };
  },

  /**
   * Register callback for window resize events
   * @param {Function} callback - Function to handle resize with {width, height}
   * @returns {Function} Cleanup function to remove listener
   */
  onWindowResized: (callback) => {
    const subscription = (event, size) => callback(size);
    ipcRenderer.on('window-resized', subscription);
    return () => {
      ipcRenderer.removeListener('window-resized', subscription);
    };
  }
});
