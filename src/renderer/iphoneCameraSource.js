/**
 * IPhoneCameraSource - MJPEG stream handler for iPhone camera
 *
 * Connects to an MJPEG stream from an iPhone app (ipCam, StreamIt, etc.)
 * Uses the img element directly as a texture source to avoid CORS issues.
 */
export default class IPhoneCameraSource {
  constructor() {
    this.streamUrl = null;
    this.imgElement = null;
    this.isConnected = false;
    this.connectionError = null;
  }

  /**
   * Connect to an MJPEG stream URL
   * @param {string} url - The MJPEG stream URL (e.g., http://192.168.1.100:8080/video)
   * @returns {Promise<void>}
   */
  async connect(url) {
    if (this.isConnected) {
      this.disconnect();
    }

    this.streamUrl = url;
    this.connectionError = null;

    // Create image element to display MJPEG stream
    // Browsers automatically update <img> elements with MJPEG streams
    // NOTE: We don't set crossOrigin to avoid CORS issues - the img loads
    // and THREE.js can use it directly as a texture source
    this.imgElement = new Image();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.connectionError = 'Connection timeout - could not load stream';
        reject(new Error(this.connectionError));
      }, 10000);

      this.imgElement.onload = () => {
        clearTimeout(timeout);
        this.isConnected = true;
        resolve();
      };

      this.imgElement.onerror = (e) => {
        clearTimeout(timeout);
        this.connectionError = 'Failed to connect - check URL and network';
        reject(new Error(this.connectionError));
      };

      this.imgElement.src = url;
    });
  }

  /**
   * Get the image element for direct use as texture source
   * @returns {HTMLImageElement|null}
   */
  getImageElement() {
    return this.imgElement;
  }

  /**
   * Get image dimensions
   * @returns {Object} Width and height
   */
  getDimensions() {
    if (!this.imgElement) {
      return { width: 1280, height: 720 };
    }
    return {
      width: this.imgElement.naturalWidth || 1280,
      height: this.imgElement.naturalHeight || 720
    };
  }

  /**
   * Check if connected and streaming
   * @returns {boolean}
   */
  isStreaming() {
    return this.isConnected && this.imgElement !== null;
  }

  /**
   * Get connection error message if any
   * @returns {string|null}
   */
  getError() {
    return this.connectionError;
  }

  /**
   * Get stream URL
   * @returns {string|null}
   */
  getUrl() {
    return this.streamUrl;
  }

  /**
   * Disconnect from stream
   */
  disconnect() {
    if (this.imgElement) {
      this.imgElement.src = '';
      this.imgElement = null;
    }

    this.isConnected = false;
    this.streamUrl = null;
    this.connectionError = null;
  }

  /**
   * Clean up all resources
   */
  destroy() {
    this.disconnect();
  }
}
