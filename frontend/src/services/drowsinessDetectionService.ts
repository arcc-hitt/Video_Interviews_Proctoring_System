import type { FaceLandmarks, DetectionEvent } from '../types';

export interface EyeMetrics {
  leftEyeAR: number;
  rightEyeAR: number;
  averageEyeAR: number;
  isEyesClosed: boolean;
  blinkDuration: number;
}

export interface DrowsinessMetrics {
  blinkRate: number; // blinks per minute
  averageBlinkDuration: number; // in milliseconds
  longBlinkCount: number; // blinks longer than threshold
  drowsinessScore: number; // 0-1 scale
  isAwake: boolean;
}

export interface DrowsinessEvent extends DetectionEvent {
  eventType: 'drowsiness' | 'eye-closure' | 'excessive-blinking';
  eyeMetrics: EyeMetrics;
  drowsinessMetrics: DrowsinessMetrics;
}

export class DrowsinessDetectionService {
  private readonly EYE_AR_THRESHOLD = 0.21; // Eye aspect ratio threshold for closed eyes
  private readonly LONG_BLINK_THRESHOLD = 300; // milliseconds
  private readonly DROWSINESS_BLINK_RATE_THRESHOLD = 15; // blinks per minute
  private readonly DROWSINESS_SCORE_THRESHOLD = 0.6;
  private readonly WINDOW_SIZE = 60000; // 1 minute window for analysis

  private blinkHistory: Array<{ timestamp: Date; duration: number }> = [];
  private eyeClosureStartTime: Date | null = null;
  private lastEyeState = false; // false = open, true = closed

  public onDrowsinessEvent?: (event: DrowsinessEvent) => void;

  /**
   * Calculate Eye Aspect Ratio (EAR) from facial landmarks
   * EAR = (|p2-p6| + |p3-p5|) / (2*|p1-p4|)
   * where p1-p6 are the eye landmarks
   */
  public calculateEyeAspectRatio(eyeLandmarks: FaceLandmarks[]): number {
    if (eyeLandmarks.length < 6) {
      return 1.0; // Default to open eye
    }

    // Calculate vertical distances
    const vertical1 = this.euclideanDistance(eyeLandmarks[1], eyeLandmarks[5]);
    const vertical2 = this.euclideanDistance(eyeLandmarks[2], eyeLandmarks[4]);
    
    // Calculate horizontal distance
    const horizontal = this.euclideanDistance(eyeLandmarks[0], eyeLandmarks[3]);

    // Calculate EAR
    const ear = (vertical1 + vertical2) / (2.0 * horizontal);
    return ear;
  }

  /**
   * Extract eye landmarks from face landmarks using MediaPipe indices
   */
  public extractEyeLandmarks(faceLandmarks: FaceLandmarks[]): { 
    leftEye: FaceLandmarks[], 
    rightEye: FaceLandmarks[] 
  } {
    // MediaPipe face mesh eye landmark indices
    const leftEyeIndices = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
    const rightEyeIndices = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];

    const leftEye = leftEyeIndices
      .filter(index => index < faceLandmarks.length)
      .map(index => faceLandmarks[index]);

    const rightEye = rightEyeIndices
      .filter(index => index < faceLandmarks.length)
      .map(index => faceLandmarks[index]);

    return { leftEye, rightEye };
  }

  /**
   * Analyze eye metrics from face landmarks
   */
  public analyzeEyeMetrics(faceLandmarks: FaceLandmarks[]): EyeMetrics {
    const { leftEye, rightEye } = this.extractEyeLandmarks(faceLandmarks);
    
    // For EAR calculation, we need 6 specific points per eye in the right order
    // Use the first 6 landmarks from each eye
    const leftEyeAR = leftEye.length >= 6 ? this.calculateEyeAspectRatio(leftEye.slice(0, 6)) : 1.0;
    const rightEyeAR = rightEye.length >= 6 ? this.calculateEyeAspectRatio(rightEye.slice(0, 6)) : 1.0;
    const averageEyeAR = (leftEyeAR + rightEyeAR) / 2.0;
    
    const isEyesClosed = averageEyeAR < this.EYE_AR_THRESHOLD;
    
    // Track blink duration
    let blinkDuration = 0;
    const now = new Date();
    
    if (isEyesClosed && !this.lastEyeState) {
      // Eyes just closed
      this.eyeClosureStartTime = now;
    } else if (!isEyesClosed && this.lastEyeState && this.eyeClosureStartTime) {
      // Eyes just opened - blink completed
      blinkDuration = now.getTime() - this.eyeClosureStartTime.getTime();
      this.recordBlink(now, blinkDuration);
      this.eyeClosureStartTime = null;
    } else if (isEyesClosed && this.eyeClosureStartTime) {
      // Eyes still closed - calculate current duration
      blinkDuration = now.getTime() - this.eyeClosureStartTime.getTime();
    }

    this.lastEyeState = isEyesClosed;

    return {
      leftEyeAR,
      rightEyeAR,
      averageEyeAR,
      isEyesClosed,
      blinkDuration
    };
  }

  /**
   * Calculate drowsiness metrics based on blink patterns
   */
  public calculateDrowsinessMetrics(): DrowsinessMetrics {
    const now = new Date();
    const windowStart = new Date(now.getTime() - this.WINDOW_SIZE);
    
    // Filter blinks within the analysis window
    const recentBlinks = this.blinkHistory.filter(
      blink => blink.timestamp >= windowStart
    );

    const blinkCount = recentBlinks.length;
    const blinkRate = (blinkCount / this.WINDOW_SIZE) * 60000; // blinks per minute
    
    const totalBlinkDuration = recentBlinks.reduce((sum, blink) => sum + blink.duration, 0);
    const averageBlinkDuration = blinkCount > 0 ? totalBlinkDuration / blinkCount : 0;
    
    const longBlinkCount = recentBlinks.filter(
      blink => blink.duration > this.LONG_BLINK_THRESHOLD
    ).length;

    // Calculate drowsiness score (0-1 scale)
    let drowsinessScore = 0;
    
    // Factor 1: High blink rate indicates fatigue
    if (blinkRate > this.DROWSINESS_BLINK_RATE_THRESHOLD) {
      drowsinessScore += 0.3;
    }
    
    // Factor 2: Long average blink duration
    if (averageBlinkDuration > this.LONG_BLINK_THRESHOLD) {
      drowsinessScore += 0.4;
    }
    
    // Factor 3: Multiple long blinks
    if (longBlinkCount > 3) {
      drowsinessScore += 0.3;
    }

    const isAwake = drowsinessScore < this.DROWSINESS_SCORE_THRESHOLD;

    return {
      blinkRate,
      averageBlinkDuration,
      longBlinkCount,
      drowsinessScore: Math.min(drowsinessScore, 1.0),
      isAwake
    };
  }

  /**
   * Process face landmarks and detect drowsiness
   */
  public async processFaceLandmarks(
    faceLandmarks: FaceLandmarks[],
    sessionId: string,
    candidateId: string
  ): Promise<DrowsinessEvent | null> {
    if (faceLandmarks.length === 0) {
      return null;
    }

    const eyeMetrics = this.analyzeEyeMetrics(faceLandmarks);
    const drowsinessMetrics = this.calculateDrowsinessMetrics();

    // Determine event type and whether to trigger
    let eventType: 'drowsiness' | 'eye-closure' | 'excessive-blinking' | null = null;
    let shouldTriggerEvent = false;

    if (!drowsinessMetrics.isAwake) {
      eventType = 'drowsiness';
      shouldTriggerEvent = true;
    } else if (eyeMetrics.isEyesClosed && eyeMetrics.blinkDuration > this.LONG_BLINK_THRESHOLD) {
      eventType = 'eye-closure';
      shouldTriggerEvent = true;
    } else if (drowsinessMetrics.blinkRate > this.DROWSINESS_BLINK_RATE_THRESHOLD * 1.5) {
      eventType = 'excessive-blinking';
      shouldTriggerEvent = true;
    }

    if (!shouldTriggerEvent || !eventType) {
      return null;
    }

    const event: DrowsinessEvent = {
      sessionId,
      candidateId,
      eventType,
      timestamp: new Date(),
      confidence: 1 - drowsinessMetrics.drowsinessScore,
      metadata: {
        eyeMetrics,
        drowsinessMetrics,
        description: this.getEventDescription(eventType, eyeMetrics, drowsinessMetrics)
      },
      eyeMetrics,
      drowsinessMetrics
    };

    if (this.onDrowsinessEvent) {
      this.onDrowsinessEvent(event);
    }

    return event;
  }

  /**
   * Record a blink event
   */
  private recordBlink(timestamp: Date, duration: number): void {
    this.blinkHistory.push({ timestamp, duration });
    
    // Clean up old blinks outside the analysis window
    const windowStart = new Date(timestamp.getTime() - this.WINDOW_SIZE);
    this.blinkHistory = this.blinkHistory.filter(
      blink => blink.timestamp >= windowStart
    );
  }

  /**
   * Calculate Euclidean distance between two landmarks
   */
  private euclideanDistance(point1: FaceLandmarks, point2: FaceLandmarks): number {
    const dx = point1.x - point2.x;
    const dy = point1.y - point2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Generate human-readable event description
   */
  private getEventDescription(
    eventType: 'drowsiness' | 'eye-closure' | 'excessive-blinking',
    eyeMetrics: EyeMetrics,
    drowsinessMetrics: DrowsinessMetrics
  ): string {
    switch (eventType) {
      case 'drowsiness':
        return `Drowsiness detected (score: ${drowsinessMetrics.drowsinessScore.toFixed(2)}, blink rate: ${drowsinessMetrics.blinkRate.toFixed(1)}/min)`;
      case 'eye-closure':
        return `Prolonged eye closure detected (duration: ${eyeMetrics.blinkDuration.toFixed(0)}ms)`;
      case 'excessive-blinking':
        return `Excessive blinking detected (${drowsinessMetrics.blinkRate.toFixed(1)} blinks/min)`;
      default:
        return 'Drowsiness-related event detected';
    }
  }

  /**
   * Reset detection state
   */
  public reset(): void {
    this.blinkHistory = [];
    this.eyeClosureStartTime = null;
    this.lastEyeState = false;
  }

  /**
   * Get current analysis statistics
   */
  public getAnalysisStats(): {
    totalBlinks: number;
    avgBlinkRate: number;
    avgDrowsinessScore: number;
  } {
    const metrics = this.calculateDrowsinessMetrics();
    return {
      totalBlinks: this.blinkHistory.length,
      avgBlinkRate: metrics.blinkRate,
      avgDrowsinessScore: metrics.drowsinessScore
    };
  }
}
