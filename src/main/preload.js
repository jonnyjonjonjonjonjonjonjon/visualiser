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
  }
});
