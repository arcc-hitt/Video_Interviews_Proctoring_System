import type { DetectionEvent } from '../types';

interface FallbackDetectionConfig {
  enableBasicMonitoring: boolean;
  enableTimeTracking: boolean;
  enableManualFlags: boolean;
  enablePeriodicChecks: boolean;
  checkInterval: number; // milliseconds
}

// Removed unused interface

export class FallbackDetectionService {
  private config: FallbackDetectionConfig;
  private isActive = false;
  private checkInterval: number | null = null;
  private sessionStartTime: Date | null = null;
  private lastActivityTime: Date | null = null;
  private onDetectionEvent?: (event: DetectionEvent) => void;

  constructor(config: Partial<FallbackDetectionConfig> = {}) {
    this.config = {
      enableBasicMonitoring: true,
      enableTimeTracking: true,
      enableManualFlags: true,
      enablePeriodicChecks: true,
      checkInterval: 5000, // 5 seconds
      ...config
    };
  }

  public setDetectionCallback(callback: (event: DetectionEvent) => void): void {
    this.onDetectionEvent = callback;
  }

  public start(sessionId: string, candidateId: string): void {
    if (this.isActive) {
      return;
    }

    this.isActive = true;
    this.sessionStartTime = new Date();
    this.lastActivityTime = new Date();

    if (this.config.enablePeriodicChecks) {
      this.startPeriodicChecks(sessionId, candidateId);
    }

    // Set up basic activity monitoring
    this.setupActivityMonitoring(sessionId, candidateId);
  }

  public stop(): void {
    if (!this.isActive) {
      return;
    }

    this.isActive = false;
    this.sessionStartTime = null;
    this.lastActivityTime = null;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  public createManualFlag(
    sessionId: string,
    candidateId: string,
    description: string,
    severity: 'low' | 'medium' | 'high' = 'medium'
  ): void {
    if (!this.isActive || !this.onDetectionEvent) {
      return;
    }

    const event: DetectionEvent = {
      sessionId,
      candidateId,
      eventType: 'manual_flag',
      timestamp: new Date(),
      duration: 0,
      confidence: 1.0,
      metadata: {
        description,
        severity,
        method: 'manual_flag',
        fallbackMode: true
      }
    };

    this.onDetectionEvent(event);
  }

  private startPeriodicChecks(sessionId: string, candidateId: string): void {
    this.checkInterval = window.setInterval(() => {
      this.performPeriodicChecks(sessionId, candidateId);
    }, this.config.checkInterval);
  }

  private performPeriodicChecks(sessionId: string, candidateId: string): void {
    if (!this.isActive || !this.onDetectionEvent) {
      return;
    }

    const now = new Date();
    const sessionDuration = this.sessionStartTime ? 
      now.getTime() - this.sessionStartTime.getTime() : 0;

    // Check for suspicious inactivity
    if (this.config.enableTimeTracking && this.lastActivityTime) {
      const timeSinceActivity = now.getTime() - this.lastActivityTime.getTime();
      const inactivityThreshold = 5 * 60 * 1000; // 5 minutes

      if (timeSinceActivity > inactivityThreshold) {
        this.createInactivityEvent(sessionId, candidateId, timeSinceActivity);
      }
    }

    // Check for session duration anomalies
    if (this.config.enableBasicMonitoring) {
      this.checkSessionDuration(sessionId, candidateId, sessionDuration);
    }

    // Update last activity time
    this.lastActivityTime = now;
  }

  private setupActivityMonitoring(_sessionId: string, _candidateId: string): void {
    // Monitor mouse and keyboard activity
    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    
    const handleActivity = () => {
      this.lastActivityTime = new Date();
    };

    activityEvents.forEach(eventType => {
      document.addEventListener(eventType, handleActivity, { passive: true });
    });

    // Store cleanup function
    this.cleanup = () => {
      activityEvents.forEach(eventType => {
        document.removeEventListener(eventType, handleActivity);
      });
    };
  }

  private createInactivityEvent(sessionId: string, candidateId: string, inactivityDuration: number): void {
    if (!this.onDetectionEvent) return;

    const event: DetectionEvent = {
      sessionId,
      candidateId,
      eventType: 'inactivity',
      timestamp: new Date(),
      duration: inactivityDuration,
      confidence: 0.8,
      metadata: {
        method: 'time_tracking',
        details: `Inactivity detected for ${Math.round(inactivityDuration / 1000)} seconds`,
        fallbackMode: true
      }
    };

    this.onDetectionEvent(event);
  }

  private checkSessionDuration(sessionId: string, candidateId: string, duration: number): void {
    if (!this.onDetectionEvent) return;

    // Check for unusually long sessions (e.g., > 4 hours)
    const maxSessionDuration = 4 * 60 * 60 * 1000; // 4 hours
    if (duration > maxSessionDuration) {
      const event: DetectionEvent = {
        sessionId,
        candidateId,
        eventType: 'long_session',
        timestamp: new Date(),
        duration: duration,
        confidence: 0.7,
        metadata: {
          method: 'basic_monitoring',
          details: `Session duration exceeds ${Math.round(duration / (60 * 60 * 1000))} hours`,
          fallbackMode: true
        }
      };

      this.onDetectionEvent(event);
    }
  }

  public getSessionStats(): {
    sessionDuration: number;
    lastActivity: Date | null;
    isActive: boolean;
  } {
    const now = new Date();
    const sessionDuration = this.sessionStartTime ? 
      now.getTime() - this.sessionStartTime.getTime() : 0;

    return {
      sessionDuration,
      lastActivity: this.lastActivityTime,
      isActive: this.isActive
    };
  }

  private cleanup?: () => void;

  public destroy(): void {
    this.stop();
    if (this.cleanup) {
      this.cleanup();
    }
  }
}

// Simple fallback detection for basic monitoring
export class BasicFallbackDetection {
  private onDetectionEvent?: (event: DetectionEvent) => void;

  constructor() {}

  public setDetectionCallback(callback: (event: DetectionEvent) => void): void {
    this.onDetectionEvent = callback;
  }

  public createBasicEvent(
    sessionId: string,
    candidateId: string,
    eventType: string,
    description: string,
    confidence: number = 0.5
  ): void {
    if (!this.onDetectionEvent) return;

    const event: DetectionEvent = {
      sessionId,
      candidateId,
      eventType,
      timestamp: new Date(),
      duration: 0,
      confidence,
      metadata: {
        method: 'basic_fallback',
        details: description,
        fallbackMode: true
      }
    };

    this.onDetectionEvent(event);
  }

  public createPeriodicHeartbeat(sessionId: string, candidateId: string): void {
    if (!this.onDetectionEvent) return;

    const event: DetectionEvent = {
      sessionId,
      candidateId,
      eventType: 'heartbeat',
      timestamp: new Date(),
      duration: 0,
      confidence: 1.0,
      metadata: {
        method: 'basic_fallback',
        details: 'Periodic heartbeat to maintain session monitoring',
        fallbackMode: true
      }
    };

    this.onDetectionEvent(event);
  }
}

export default FallbackDetectionService;
