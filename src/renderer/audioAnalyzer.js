/**
 * AudioAnalyzer - Comprehensive audio analysis module for music visualization
 *
 * Provides frequency analysis, beat detection, and normalized audio metrics
 * for real-time music visualization applications.
 */

export default class AudioAnalyzer {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.sourceNode = null;
    this.mediaStream = null;

    // Analysis buffers
    this.frequencyData = null;
    this.timeDomainData = null;
    this.bufferLength = 1024; // FFT size

    // Beat detection state
    this.energyHistory = [];
    this.energyHistoryLength = 43; // ~1 second at 60fps
    this.beatThreshold = 1.3;
    this.lastBeatTime = 0;
    this.beatCooldown = 100; // ms
    this.beatDetected = false;

    // Auto-gain normalization
    this.minEnergy = Infinity;
    this.maxEnergy = -Infinity;
    this.rangeDecayFactor = 0.999; // Slow decay towards middle
    this.adaptiveGain = true;

    // Frequency band smoothing
    this.smoothingFactor = 0.7;
    this.previousBass = 0;
    this.previousMid = 0;
    this.previousTreble = 0;
    this.previousAverage = 0;

    // Frequency mapping cache
    this.frequencyBinMap = null;

    // State
    this.isInitialized = false;
    this.sourceType = null;
    this.muted = false;
  }

  /**
   * Initialize the audio analyzer
   * @param {string} sourceType - 'microphone' or 'file'
   * @returns {Promise<void>}
   */
  async init(sourceType = 'microphone') {
    if (this.isInitialized) {
      console.warn('AudioAnalyzer already initialized');
      return;
    }

    this.sourceType = sourceType;

    // Create audio context
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new AudioContext();

    // Create analyser node
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = this.bufferLength * 2; // FFT size is 2x buffer length
    this.analyser.smoothingTimeConstant = 0.8;
    this.analyser.minDecibels = -90;
    this.analyser.maxDecibels = -10;

    // Initialize data arrays
    this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
    this.timeDomainData = new Uint8Array(this.analyser.frequencyBinCount);

    // Build frequency bin map
    this._buildFrequencyBinMap();

    // Connect to microphone if specified
    if (sourceType === 'microphone') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          }
        });
        await this.connectToStream(stream);
      } catch (error) {
        throw new Error(`Failed to access microphone: ${error.message}`);
      }
    }

    this.isInitialized = true;
  }

  /**
   * Connect to a media stream (microphone or audio element)
   * @param {MediaStream} mediaStream - The media stream to analyze
   * @returns {Promise<void>}
   */
  async connectToStream(mediaStream) {
    if (!this.audioContext) {
      throw new Error('AudioAnalyzer not initialized');
    }

    // Resume audio context if suspended
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Disconnect existing source
    if (this.sourceNode) {
      this.sourceNode.disconnect();
    }

    // Store media stream reference
    this.mediaStream = mediaStream;

    // Create source node from stream
    this.sourceNode = this.audioContext.createMediaStreamSource(mediaStream);

    // Connect source to analyser
    this.sourceNode.connect(this.analyser);
    // Note: We don't connect to destination to avoid feedback
  }

  /**
   * Connect to an HTML audio element
   * @param {HTMLAudioElement} audioElement - The audio element to analyze
   */
  connectToAudioElement(audioElement) {
    if (!this.audioContext) {
      throw new Error('AudioAnalyzer not initialized');
    }

    // Disconnect existing source
    if (this.sourceNode) {
      this.sourceNode.disconnect();
    }

    // Create source node from audio element
    this.sourceNode = this.audioContext.createMediaElementSource(audioElement);

    // Connect source to analyser and destination (so we can hear it)
    this.sourceNode.connect(this.analyser);
    this.sourceNode.connect(this.audioContext.destination);
  }

  /**
   * Build frequency bin map for band calculations
   * Maps FFT bins to actual frequencies based on sample rate
   * @private
   */
  _buildFrequencyBinMap() {
    const sampleRate = this.audioContext.sampleRate;
    const binCount = this.analyser.frequencyBinCount;
    const nyquist = sampleRate / 2;

    this.frequencyBinMap = {
      bass: { start: 0, end: 0 },
      mid: { start: 0, end: 0 },
      treble: { start: 0, end: 0 }
    };

    // Calculate bin indices for each frequency range
    // Bass: 20-250 Hz
    this.frequencyBinMap.bass.start = Math.floor(20 / nyquist * binCount);
    this.frequencyBinMap.bass.end = Math.floor(250 / nyquist * binCount);

    // Mid: 250-4000 Hz
    this.frequencyBinMap.mid.start = this.frequencyBinMap.bass.end;
    this.frequencyBinMap.mid.end = Math.floor(4000 / nyquist * binCount);

    // Treble: 4000-20000 Hz
    this.frequencyBinMap.treble.start = this.frequencyBinMap.mid.end;
    this.frequencyBinMap.treble.end = Math.min(
      Math.floor(20000 / nyquist * binCount),
      binCount - 1
    );
  }

  /**
   * Get raw frequency data
   * @returns {Uint8Array} Frequency bin data (0-255 values)
   */
  getFrequencyData() {
    if (!this.analyser) {
      return new Uint8Array(this.bufferLength);
    }

    this.analyser.getByteFrequencyData(this.frequencyData);
    return this.frequencyData;
  }

  /**
   * Get raw waveform data
   * @returns {Uint8Array} Time domain data (0-255 values)
   */
  getWaveformData() {
    if (!this.analyser) {
      return new Uint8Array(this.bufferLength);
    }

    this.analyser.getByteTimeDomainData(this.timeDomainData);
    return this.timeDomainData;
  }

  /**
   * Get average frequency across all bins
   * @returns {number} Normalized value 0-1
   */
  getAverageFrequency() {
    this.getFrequencyData();

    let sum = 0;
    for (let i = 0; i < this.frequencyData.length; i++) {
      sum += this.frequencyData[i];
    }

    const average = sum / this.frequencyData.length / 255;

    // Apply smoothing
    this.previousAverage = this.previousAverage * this.smoothingFactor +
                          average * (1 - this.smoothingFactor);

    return this._normalize(this.previousAverage);
  }

  /**
   * Get bass energy (20-250 Hz)
   * @returns {number} Normalized value 0-1
   */
  getBass() {
    this.getFrequencyData();
    const energy = this._getFrequencyRangeEnergy(
      this.frequencyBinMap.bass.start,
      this.frequencyBinMap.bass.end
    );

    // Apply smoothing
    this.previousBass = this.previousBass * this.smoothingFactor +
                       energy * (1 - this.smoothingFactor);

    return this._normalize(this.previousBass);
  }

  /**
   * Get mid range energy (250-4000 Hz)
   * @returns {number} Normalized value 0-1
   */
  getMid() {
    this.getFrequencyData();
    const energy = this._getFrequencyRangeEnergy(
      this.frequencyBinMap.mid.start,
      this.frequencyBinMap.mid.end
    );

    // Apply smoothing
    this.previousMid = this.previousMid * this.smoothingFactor +
                      energy * (1 - this.smoothingFactor);

    return this._normalize(this.previousMid);
  }

  /**
   * Get treble energy (4000-20000 Hz)
   * @returns {number} Normalized value 0-1
   */
  getTreble() {
    this.getFrequencyData();
    const energy = this._getFrequencyRangeEnergy(
      this.frequencyBinMap.treble.start,
      this.frequencyBinMap.treble.end
    );

    // Apply smoothing
    this.previousTreble = this.previousTreble * this.smoothingFactor +
                         energy * (1 - this.smoothingFactor);

    return this._normalize(this.previousTreble);
  }

  /**
   * Calculate energy in a frequency range
   * @param {number} startBin - Starting bin index
   * @param {number} endBin - Ending bin index
   * @returns {number} Average energy 0-1
   * @private
   */
  _getFrequencyRangeEnergy(startBin, endBin) {
    let sum = 0;
    let count = 0;

    for (let i = startBin; i <= endBin; i++) {
      sum += this.frequencyData[i];
      count++;
    }

    return count > 0 ? sum / count / 255 : 0;
  }

  /**
   * Detect if a beat occurred this frame
   * Uses energy-based beat detection algorithm
   * @returns {boolean} True if beat detected
   */
  getBeatDetected() {
    this.getFrequencyData();

    // Calculate current energy (focus on bass/low-mid for beat detection)
    const currentEnergy = this._getFrequencyRangeEnergy(
      this.frequencyBinMap.bass.start,
      this.frequencyBinMap.mid.start +
        Math.floor((this.frequencyBinMap.mid.end - this.frequencyBinMap.mid.start) * 0.3)
    );

    // Add to history
    this.energyHistory.push(currentEnergy);

    // Maintain history length
    if (this.energyHistory.length > this.energyHistoryLength) {
      this.energyHistory.shift();
    }

    // Calculate average energy
    const averageEnergy = this.energyHistory.reduce((a, b) => a + b, 0) /
                         this.energyHistory.length;

    // Check for beat
    const now = Date.now();
    const timeSinceLastBeat = now - this.lastBeatTime;

    // Beat detected if current energy exceeds threshold and cooldown passed
    if (currentEnergy > averageEnergy * this.beatThreshold &&
        timeSinceLastBeat > this.beatCooldown) {
      this.beatDetected = true;
      this.lastBeatTime = now;
      return true;
    }

    this.beatDetected = false;
    return false;
  }

  /**
   * Get spectrum data divided into bands
   * @param {number} numBands - Number of frequency bands to return
   * @returns {Array<number>} Array of normalized values 0-1
   */
  getSpectrum(numBands = 32) {
    this.getFrequencyData();

    const spectrum = new Array(numBands).fill(0);
    const binCount = this.frequencyData.length;

    // Use logarithmic scaling for more musical distribution
    for (let i = 0; i < numBands; i++) {
      // Calculate logarithmic bin range for this band
      const startRatio = Math.pow(i / numBands, 2);
      const endRatio = Math.pow((i + 1) / numBands, 2);

      const startBin = Math.floor(startRatio * binCount);
      const endBin = Math.floor(endRatio * binCount);

      // Average the bins in this range
      let sum = 0;
      let count = 0;

      for (let j = startBin; j < endBin; j++) {
        sum += this.frequencyData[j];
        count++;
      }

      spectrum[i] = count > 0 ? sum / count / 255 : 0;
    }

    // Normalize spectrum
    return spectrum.map(value => this._normalize(value));
  }

  /**
   * Normalize a value using adaptive gain
   * @param {number} value - Raw value 0-1
   * @returns {number} Normalized value 0-1
   * @private
   */
  _normalize(value) {
    if (!this.adaptiveGain) {
      return Math.max(0, Math.min(1, value));
    }

    // Update min/max tracking
    this.minEnergy = Math.min(this.minEnergy, value);
    this.maxEnergy = Math.max(this.maxEnergy, value);

    // Decay range towards middle to adapt to volume changes
    const middle = (this.minEnergy + this.maxEnergy) / 2;
    this.minEnergy = this.minEnergy * this.rangeDecayFactor +
                    middle * (1 - this.rangeDecayFactor);
    this.maxEnergy = this.maxEnergy * this.rangeDecayFactor +
                    middle * (1 - this.rangeDecayFactor);

    // Prevent division by zero
    const range = this.maxEnergy - this.minEnergy;
    if (range < 0.001) {
      return value;
    }

    // Normalize to 0-1 range
    const normalized = (value - this.minEnergy) / range;
    return Math.max(0, Math.min(1, normalized));
  }

  /**
   * Set beat detection sensitivity
   * @param {number} threshold - Threshold multiplier (1.0-2.0, default 1.3)
   */
  setBeatThreshold(threshold) {
    this.beatThreshold = Math.max(1.0, Math.min(2.0, threshold));
  }

  /**
   * Set beat detection cooldown
   * @param {number} cooldown - Cooldown in milliseconds (default 100)
   */
  setBeatCooldown(cooldown) {
    this.beatCooldown = Math.max(0, cooldown);
  }

  /**
   * Set smoothing factor for frequency bands
   * @param {number} factor - Smoothing factor 0-1 (0=no smoothing, 1=max smoothing)
   */
  setSmoothingFactor(factor) {
    this.smoothingFactor = Math.max(0, Math.min(1, factor));
  }

  /**
   * Enable or disable adaptive gain normalization
   * @param {boolean} enabled - Whether to enable adaptive gain
   */
  setAdaptiveGain(enabled) {
    this.adaptiveGain = enabled;

    if (!enabled) {
      // Reset normalization values
      this.minEnergy = Infinity;
      this.maxEnergy = -Infinity;
    }
  }

  /**
   * Get all audio data in a single object for the visualizer
   * @returns {Object} Object containing bass, mid, treble, energy, beat, spectrum
   */
  getAudioData() {
    return {
      bass: this.getBass(),
      mid: this.getMid(),
      treble: this.getTreble(),
      energy: this.getAverageFrequency(),
      beat: this.getBeatDetected(),
      spectrum: this.getFrequencyData()
    };
  }

  /**
   * Toggle mute state
   */
  toggleMute() {
    this.muted = !this.muted;
  }

  /**
   * Check if muted
   * @returns {boolean} Mute state
   */
  isMuted() {
    return this.muted;
  }

  /**
   * Get audio context for advanced usage
   * @returns {AudioContext} The audio context
   */
  getAudioContext() {
    return this.audioContext;
  }

  /**
   * Get analyser node for advanced usage
   * @returns {AnalyserNode} The analyser node
   */
  getAnalyserNode() {
    return this.analyser;
  }

  /**
   * Resume audio context if suspended
   * @returns {Promise<void>}
   */
  async resume() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  /**
   * Suspend audio context
   * @returns {Promise<void>}
   */
  async suspend() {
    if (this.audioContext && this.audioContext.state === 'running') {
      await this.audioContext.suspend();
    }
  }

  /**
   * Clean up resources
   */
  destroy() {
    // Disconnect nodes
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }

    // Stop media stream tracks
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    // Close audio context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    // Clear buffers
    this.frequencyData = null;
    this.timeDomainData = null;
    this.energyHistory = [];

    this.isInitialized = false;
  }
}
