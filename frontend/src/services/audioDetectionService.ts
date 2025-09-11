import type { DetectionEvent } from '../types';

export interface AudioMetrics {
  volume: number; // 0-1 scale
  frequency: number; // dominant frequency in Hz
  voiceActivityProbability: number; // 0-1 scale
  backgroundNoiseLevel: number; // 0-1 scale
  speechSegments: SpeechSegment[];
}

export interface SpeechSegment {
  startTime: number; // timestamp in milliseconds
  endTime: number;
  confidence: number; // 0-1 scale
  isCandidateVoice: boolean; // true if likely candidate, false if background
}

export interface AudioEvent extends DetectionEvent {
  eventType: 'background-voice' | 'multiple-voices' | 'excessive-noise';
  audioMetrics: AudioMetrics;
}

export class AudioDetectionService {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private microphone: MediaStreamAudioSourceNode | null = null;
  private dataArray: Uint8Array<ArrayBuffer> | null = null;
  private isInitialized = false;
  private isMonitoring = false;

  // Configuration constants
  private readonly VOICE_FREQUENCY_MIN = 85; // Hz - minimum human voice frequency
  private readonly VOICE_FREQUENCY_MAX = 255; // Hz - maximum human voice frequency
  private readonly BACKGROUND_VOICE_THRESHOLD = 0.4; // confidence threshold for background voice
  private readonly NOISE_THRESHOLD = 0.6; // threshold for excessive background noise
  private readonly ANALYSIS_INTERVAL = 100; // milliseconds
  private readonly SPEECH_SEGMENT_MIN_DURATION = 500; // minimum speech segment duration

  // Audio analysis state
  private volumeHistory: number[] = [];
  private currentSpeechSegment: SpeechSegment | null = null;
  private speechSegments: SpeechSegment[] = [];
  private baselineNoiseLevel = 0;
  private calibrationSamples = 0;
  private readonly CALIBRATION_SAMPLES_COUNT = 50; // samples for baseline noise calculation
  private sessionId = '';
  private candidateId = '';

  public onAudioEvent?: (event: AudioEvent) => void;

  constructor() {
    this.initializeAudioContext();
  }

  /**
   * Initialize Web Audio API context and analyzer
   */
  private async initializeAudioContext(): Promise<void> {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      
      // Configure analyzer for voice detection
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.8;
      
      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(new ArrayBuffer(bufferLength));
      
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize audio context:', error);
      throw new Error('Audio detection service initialization failed');
    }
  }

  /**
   * Start audio monitoring with microphone access
   */
  public async startMonitoring(): Promise<void> {
    if (!this.isInitialized || !this.audioContext || !this.analyser) {
      throw new Error('Audio detection service not initialized');
    }

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false, // Disable to detect all audio including background
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      this.microphone = this.audioContext.createMediaStreamSource(stream);
      this.microphone.connect(this.analyser);

      this.isMonitoring = true;
      this.startAnalysis();
    } catch (error) {
      console.error('Failed to start audio monitoring:', error);
      throw new Error('Microphone access denied or failed');
    }
  }

  /**
   * Stop audio monitoring
   */
  public stopMonitoring(): void {
    this.isMonitoring = false;
    
    if (this.microphone) {
      this.microphone.disconnect();
      this.microphone = null;
    }
  }

  /**
   * Start continuous audio analysis
   */
  private startAnalysis(): void {
    if (!this.isMonitoring || !this.analyser || !this.dataArray) {
      return;
    }

    const analyze = () => {
      if (!this.isMonitoring) {
        return;
      }

      this.analyser!.getByteFrequencyData(this.dataArray!);
      const metrics = this.analyzeAudioFrame();
      
      // Update baseline noise level during calibration
      if (this.calibrationSamples < this.CALIBRATION_SAMPLES_COUNT) {
        this.baselineNoiseLevel = (this.baselineNoiseLevel * this.calibrationSamples + metrics.backgroundNoiseLevel) / (this.calibrationSamples + 1);
        this.calibrationSamples++;
      }

      this.processAudioMetrics(metrics);
      
      setTimeout(analyze, this.ANALYSIS_INTERVAL);
    };

    analyze();
  }

  /**
   * Analyze current audio frame and extract metrics
   */
  private analyzeAudioFrame(): AudioMetrics {
    if (!this.dataArray || !this.analyser) {
      return this.getEmptyMetrics();
    }

    const bufferLength = this.dataArray.length;
    const sampleRate = this.audioContext!.sampleRate;
    const frequencyResolution = sampleRate / (2 * bufferLength);

    // Calculate volume (RMS)
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      const amplitude = this.dataArray[i] / 255.0;
      sum += amplitude * amplitude;
    }
    const volume = Math.sqrt(sum / bufferLength);

    // Find dominant frequency
    let maxAmplitude = 0;
    let dominantFrequencyIndex = 0;
    for (let i = 0; i < bufferLength; i++) {
      if (this.dataArray[i] > maxAmplitude) {
        maxAmplitude = this.dataArray[i];
        dominantFrequencyIndex = i;
      }
    }
    const dominantFrequency = dominantFrequencyIndex * frequencyResolution;

    // Calculate voice activity probability
    const voiceActivityProbability = this.calculateVoiceActivity();

    // Calculate background noise level
    const backgroundNoiseLevel = this.calculateBackgroundNoise();

    // Update volume history
    this.volumeHistory.push(volume);
    if (this.volumeHistory.length > 100) { // Keep last 10 seconds
      this.volumeHistory.shift();
    }

    return {
      volume,
      frequency: dominantFrequency,
      voiceActivityProbability,
      backgroundNoiseLevel,
      speechSegments: [...this.speechSegments]
    };
  }

  /**
   * Calculate voice activity probability based on frequency analysis
   */
  private calculateVoiceActivity(): number {
    if (!this.dataArray || !this.analyser) {
      return 0;
    }

    const bufferLength = this.dataArray.length;
    const sampleRate = this.audioContext!.sampleRate;
    const frequencyResolution = sampleRate / (2 * bufferLength);

    // Calculate energy in voice frequency range
    const voiceStartBin = Math.floor(this.VOICE_FREQUENCY_MIN / frequencyResolution);
    const voiceEndBin = Math.floor(this.VOICE_FREQUENCY_MAX / frequencyResolution);

    let voiceEnergy = 0;
    let totalEnergy = 0;

    for (let i = 0; i < bufferLength; i++) {
      const amplitude = this.dataArray[i] / 255.0;
      const energy = amplitude * amplitude;
      
      totalEnergy += energy;
      
      if (i >= voiceStartBin && i <= voiceEndBin) {
        voiceEnergy += energy;
      }
    }

    return totalEnergy > 0 ? voiceEnergy / totalEnergy : 0;
  }

  /**
   * Calculate background noise level
   */
  private calculateBackgroundNoise(): number {
    if (!this.dataArray) {
      return 0;
    }

    // Calculate noise level as RMS of lower frequencies (below voice range)
    const bufferLength = this.dataArray.length;
    const sampleRate = this.audioContext!.sampleRate;
    const frequencyResolution = sampleRate / (2 * bufferLength);
    const noiseEndBin = Math.floor(this.VOICE_FREQUENCY_MIN / frequencyResolution);

    let noiseSum = 0;
    for (let i = 0; i < Math.min(noiseEndBin, bufferLength); i++) {
      const amplitude = this.dataArray[i] / 255.0;
      noiseSum += amplitude * amplitude;
    }

    return Math.sqrt(noiseSum / noiseEndBin);
  }

  /**
   * Process audio metrics and detect events
   */
  private processAudioMetrics(metrics: AudioMetrics): void {
    const now = Date.now();

    // Detect speech segments
    if (metrics.voiceActivityProbability > this.BACKGROUND_VOICE_THRESHOLD) {
      if (!this.currentSpeechSegment) {
        // Start new speech segment
        this.currentSpeechSegment = {
          startTime: now,
          endTime: now,
          confidence: metrics.voiceActivityProbability,
          isCandidateVoice: this.isCandidateVoice(metrics)
        };
      } else {
        // Update current speech segment
        this.currentSpeechSegment.endTime = now;
        this.currentSpeechSegment.confidence = 
          (this.currentSpeechSegment.confidence + metrics.voiceActivityProbability) / 2;
      }
    } else if (this.currentSpeechSegment) {
      // End current speech segment
      const duration = this.currentSpeechSegment.endTime - this.currentSpeechSegment.startTime;
      if (duration >= this.SPEECH_SEGMENT_MIN_DURATION) {
        this.speechSegments.push({ ...this.currentSpeechSegment });
        
        // Check for background voice event
        if (!this.currentSpeechSegment.isCandidateVoice) {
          this.triggerAudioEvent('background-voice', metrics);
        }
      }
      this.currentSpeechSegment = null;
    }

    // Detect multiple voices (overlapping speech segments)
    const recentSegments = this.speechSegments.filter(
      segment => now - segment.endTime < 5000 // last 5 seconds
    );
    const candidateSegments = recentSegments.filter(s => s.isCandidateVoice);
    const backgroundSegments = recentSegments.filter(s => !s.isCandidateVoice);

    if (candidateSegments.length > 0 && backgroundSegments.length > 0) {
      this.triggerAudioEvent('multiple-voices', metrics);
    }

    // Detect excessive background noise
    if (metrics.backgroundNoiseLevel > this.baselineNoiseLevel + this.NOISE_THRESHOLD) {
      this.triggerAudioEvent('excessive-noise', metrics);
    }

    // Clean up old speech segments
    this.speechSegments = this.speechSegments.filter(
      segment => now - segment.endTime < 60000 // keep last minute
    );
  }

  /**
   * Determine if detected voice is likely the candidate
   */
  private isCandidateVoice(metrics: AudioMetrics): boolean {
    // Simple heuristic: assume louder, more frequent voices are the candidate
    // In a real implementation, this could use voice fingerprinting or ML models
    const avgVolume = this.volumeHistory.length > 0 
      ? this.volumeHistory.reduce((a, b) => a + b, 0) / this.volumeHistory.length 
      : 0;
    
    return metrics.volume > avgVolume * 1.2; // Candidate voice is typically louder
  }

  /**
   * Trigger audio detection event
   */
  private triggerAudioEvent(
    eventType: 'background-voice' | 'multiple-voices' | 'excessive-noise',
    metrics: AudioMetrics
  ): void {
    // Prevent spam by limiting event frequency
    const lastEvent = this.speechSegments[this.speechSegments.length - 1];
    if (lastEvent && Date.now() - lastEvent.endTime < 2000) {
      return; // Skip if last event was less than 2 seconds ago
    }

    const event: AudioEvent = {
      sessionId: this.sessionId,
      candidateId: this.candidateId,
      eventType,
      timestamp: new Date(),
      confidence: this.calculateEventConfidence(eventType, metrics),
      metadata: {
        audioMetrics: metrics,
        description: this.getEventDescription(eventType, metrics)
      },
      audioMetrics: metrics
    };

    if (this.onAudioEvent) {
      this.onAudioEvent(event);
    }
  }

  /**
   * Calculate confidence for detected event
   */
  private calculateEventConfidence(
    eventType: 'background-voice' | 'multiple-voices' | 'excessive-noise',
    metrics: AudioMetrics
  ): number {
    switch (eventType) {
      case 'background-voice':
        return Math.min(metrics.voiceActivityProbability * 1.2, 1.0);
      case 'multiple-voices':
        return Math.min(metrics.voiceActivityProbability * 1.5, 1.0);
      case 'excessive-noise':
        return Math.min((metrics.backgroundNoiseLevel - this.baselineNoiseLevel) / this.NOISE_THRESHOLD, 1.0);
      default:
        return 0.5;
    }
  }

  /**
   * Generate human-readable event description
   */
  private getEventDescription(
    eventType: 'background-voice' | 'multiple-voices' | 'excessive-noise',
    metrics: AudioMetrics
  ): string {
    switch (eventType) {
      case 'background-voice':
        return `Background voice detected (confidence: ${(metrics.voiceActivityProbability * 100).toFixed(1)}%)`;
      case 'multiple-voices':
        return `Multiple voices detected simultaneously`;
      case 'excessive-noise':
        return `Excessive background noise detected (level: ${(metrics.backgroundNoiseLevel * 100).toFixed(1)}%)`;
      default:
        return 'Audio anomaly detected';
    }
  }

  /**
   * Get empty metrics object
   */
  private getEmptyMetrics(): AudioMetrics {
    return {
      volume: 0,
      frequency: 0,
      voiceActivityProbability: 0,
      backgroundNoiseLevel: 0,
      speechSegments: []
    };
  }

  /**
   * Get current analysis statistics
   */
  public getAnalysisStats(): {
    isMonitoring: boolean;
    baselineNoiseLevel: number;
    totalSpeechSegments: number;
    avgVolume: number;
  } {
    const avgVolume = this.volumeHistory.length > 0 
      ? this.volumeHistory.reduce((a, b) => a + b, 0) / this.volumeHistory.length 
      : 0;

    return {
      isMonitoring: this.isMonitoring,
      baselineNoiseLevel: this.baselineNoiseLevel,
      totalSpeechSegments: this.speechSegments.length,
      avgVolume
    };
  }

  /**
   * Reset detection state
   */
  public reset(): void {
    this.volumeHistory = [];
    this.speechSegments = [];
    this.currentSpeechSegment = null;
    this.baselineNoiseLevel = 0;
    this.calibrationSamples = 0;
  }

  /**
   * Update session information for events
   */
  public setSessionInfo(sessionId: string, candidateId: string): void {
    this.sessionId = sessionId;
    this.candidateId = candidateId;
  }
}
