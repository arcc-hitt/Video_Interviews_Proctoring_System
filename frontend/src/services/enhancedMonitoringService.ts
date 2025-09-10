import { DrowsinessDetectionService, type DrowsinessEvent } from './drowsinessDetectionService';
import { AudioDetectionService, type AudioEvent } from './audioDetectionService';
import type { FaceLandmarks, DetectionEvent } from '../types';

export interface EnhancedMonitoringStats {
  drowsiness: {
    totalBlinks: number;
    avgBlinkRate: number;
    avgDrowsinessScore: number;
  };
  audio: {
    isMonitoring: boolean;
    baselineNoiseLevel: number;
    totalSpeechSegments: number;
    avgVolume: number;
  };
}

/**
 * Integration service that combines drowsiness detection and audio monitoring
 * for enhanced proctoring capabilities
 */
export class EnhancedMonitoringService {
  private drowsinessService: DrowsinessDetectionService;
  private audioService: AudioDetectionService;
  private isActive = false;

  public onDetectionEvent?: (event: DetectionEvent) => void;

  constructor() {
    this.drowsinessService = new DrowsinessDetectionService();
    this.audioService = new AudioDetectionService();

    // Set up event handlers
    this.drowsinessService.onDrowsinessEvent = this.handleDrowsinessEvent.bind(this);
    this.audioService.onAudioEvent = this.handleAudioEvent.bind(this);
  }

  /**
   * Initialize and start enhanced monitoring
   */
  public async startMonitoring(sessionId: string, candidateId: string): Promise<void> {
    try {
      // Set session information for both services
      this.audioService.setSessionInfo(sessionId, candidateId);

      // Start audio monitoring
      await this.audioService.startMonitoring();

      this.isActive = true;
      console.log('Enhanced monitoring started successfully');
    } catch (error) {
      console.error('Failed to start enhanced monitoring:', error);
      throw error;
    }
  }

  /**
   * Stop enhanced monitoring
   */
  public stopMonitoring(): void {
    this.audioService.stopMonitoring();
    this.isActive = false;
    console.log('Enhanced monitoring stopped');
  }

  /**
   * Process face landmarks for drowsiness detection
   */
  public async processFaceLandmarks(
    faceLandmarks: FaceLandmarks[],
    sessionId: string,
    candidateId: string
  ): Promise<DrowsinessEvent | null> {
    if (!this.isActive) {
      return null;
    }

    return await this.drowsinessService.processFaceLandmarks(
      faceLandmarks,
      sessionId,
      candidateId
    );
  }

  /**
   * Handle drowsiness events
   */
  private handleDrowsinessEvent(event: DrowsinessEvent): void {
    if (this.onDetectionEvent) {
      this.onDetectionEvent(event);
    }
  }

  /**
   * Handle audio events
   */
  private handleAudioEvent(event: AudioEvent): void {
    if (this.onDetectionEvent) {
      this.onDetectionEvent(event);
    }
  }

  /**
   * Get comprehensive monitoring statistics
   */
  public getMonitoringStats(): EnhancedMonitoringStats {
    return {
      drowsiness: this.drowsinessService.getAnalysisStats(),
      audio: this.audioService.getAnalysisStats()
    };
  }

  /**
   * Reset all detection states
   */
  public reset(): void {
    this.drowsinessService.reset();
    this.audioService.reset();
  }

  /**
   * Check if monitoring is active
   */
  public get isMonitoring(): boolean {
    return this.isActive;
  }

  /**
   * Get drowsiness service for direct access if needed
   */
  public get drowsinessDetection(): DrowsinessDetectionService {
    return this.drowsinessService;
  }

  /**
   * Get audio service for direct access if needed
   */
  public get audioDetection(): AudioDetectionService {
    return this.audioService;
  }
}
