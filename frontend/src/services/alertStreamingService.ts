import { io, Socket } from 'socket.io-client';
import type { DetectionEvent, Alert } from '../types';

export interface AlertStreamingConfig {
  backendUrl: string;
  authToken: string;
  sessionId?: string;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

export interface AlertStreamingCallbacks {
  onAlert?: (alert: Alert) => void;
  onDetectionEvent?: (event: DetectionEvent) => void;
  onManualFlag?: (flag: ManualFlag) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

export interface ManualFlag {
  id: string;
  sessionId: string;
  interviewerId: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  timestamp: Date;
  flagged: boolean;
}

export class AlertStreamingService {
  private socket: Socket | null = null;
  private config: AlertStreamingConfig;
  private callbacks: AlertStreamingCallbacks;
  private reconnectAttempts = 0;
  private maxReconnectAttempts: number;
  private reconnectDelay: number;
  private isConnected = false;

  constructor(config: AlertStreamingConfig, callbacks: AlertStreamingCallbacks = {}) {
    this.config = config;
    this.callbacks = callbacks;
    this.maxReconnectAttempts = config.reconnectAttempts || 5;
    this.reconnectDelay = config.reconnectDelay || 1000;
  }

  /**
   * Initialize WebSocket connection for real-time alert streaming
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.socket = io(this.config.backendUrl, {
          auth: {
            token: this.config.authToken
          },
          transports: ['websocket', 'polling'],
          timeout: 10000,
          forceNew: true
        });

        this.setupEventListeners();

        this.socket.on('connect', () => {
          console.log('Alert streaming service connected');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          
          // Join session if sessionId is provided
          if (this.config.sessionId) {
            this.joinSession(this.config.sessionId);
          }
          
          if (this.callbacks.onConnect) {
            this.callbacks.onConnect();
          }
          
          resolve();
        });

        this.socket.on('connect_error', (error) => {
          console.error('Alert streaming connection error:', error);
          this.isConnected = false;
          
          if (this.callbacks.onError) {
            this.callbacks.onError(new Error(`Connection failed: ${error.message}`));
          }
          
          reject(error);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Setup WebSocket event listeners
   */
  private setupEventListeners(): void {
    if (!this.socket) return;

    // Connection events
    this.socket.on('disconnect', (reason) => {
      console.log('Alert streaming service disconnected:', reason);
      this.isConnected = false;
      
      if (this.callbacks.onDisconnect) {
        this.callbacks.onDisconnect();
      }
      
      // Attempt reconnection for certain disconnect reasons
      if (reason === 'io server disconnect' || reason === 'transport close') {
        this.attemptReconnect();
      }
    });

    // Detection event from candidate
    this.socket.on('detection_event_broadcast', (event: DetectionEvent) => {
      console.log('Received detection event:', event);
      
      const alert = this.convertDetectionEventToAlert(event);
      
      if (this.callbacks.onAlert) {
        this.callbacks.onAlert(alert);
      }
      
      if (this.callbacks.onDetectionEvent) {
        this.callbacks.onDetectionEvent(event);
      }
    });

    // Manual flag from interviewer
    this.socket.on('manual_flag_broadcast', (flag: ManualFlag) => {
      console.log('Received manual flag:', flag);
      
      const alert: Alert = {
        type: 'unauthorized-item', // Generic type for manual flags
        message: `Manual Flag: ${flag.description}`,
        timestamp: flag.timestamp,
        severity: flag.severity
      };
      
      if (this.callbacks.onAlert) {
        this.callbacks.onAlert(alert);
      }
      
      if (this.callbacks.onManualFlag) {
        this.callbacks.onManualFlag(flag);
      }
    });

    // Session status updates
    this.socket.on('session_status_update', (data: any) => {
      console.log('Session status update:', data);
      // Handle session status changes if needed
    });

    // Error handling
    this.socket.on('error', (error: any) => {
      console.error('WebSocket error:', error);
      
      if (this.callbacks.onError) {
        this.callbacks.onError(new Error(`WebSocket error: ${error.message || error}`));
      }
    });
  }

  /**
   * Convert detection event to alert format
   */
  private convertDetectionEventToAlert(event: DetectionEvent): Alert {
    const alertMessages: Record<DetectionEvent['eventType'], string> = {
      'focus-loss': 'Candidate looking away from screen',
      'absence': 'Candidate not present in frame',
      'multiple-faces': 'Multiple faces detected',
      'unauthorized-item': `Unauthorized item detected: ${event.metadata?.objectType || 'unknown item'}`
    };

    const alertSeverities: Record<DetectionEvent['eventType'], Alert['severity']> = {
      'focus-loss': 'low',
      'absence': 'medium',
      'multiple-faces': 'high',
      'unauthorized-item': 'high'
    };

    return {
      type: event.eventType,
      message: alertMessages[event.eventType],
      timestamp: new Date(event.timestamp),
      severity: alertSeverities[event.eventType]
    };
  }

  /**
   * Join a specific session for monitoring
   */
  joinSession(sessionId: string): void {
    if (!this.socket || !this.isConnected) {
      console.warn('Cannot join session: not connected');
      return;
    }

    this.config.sessionId = sessionId;
    this.socket.emit('join_session', {
      sessionId,
      role: 'interviewer'
    });

    console.log(`Joined session: ${sessionId}`);
  }

  /**
   * Leave current session
   */
  leaveSession(): void {
    if (!this.socket || !this.config.sessionId) return;

    this.socket.emit('leave_session', this.config.sessionId);
    console.log(`Left session: ${this.config.sessionId}`);
    this.config.sessionId = undefined;
  }

  /**
   * Send manual flag to other participants
   */
  sendManualFlag(description: string, severity: 'low' | 'medium' | 'high'): void {
    if (!this.socket || !this.config.sessionId || !this.isConnected) {
      console.warn('Cannot send manual flag: not connected or no session');
      return;
    }

    const flag: Partial<ManualFlag> = {
      sessionId: this.config.sessionId,
      description,
      severity,
      timestamp: new Date(),
      flagged: severity === 'high'
    };

    this.socket.emit('manual_flag', flag);
    console.log('Sent manual flag:', flag);
  }

  /**
   * Acknowledge an alert (send to backend for logging)
   */
  acknowledgeAlert(alertId: string, sessionId?: string): void {
    if (!this.socket || !this.isConnected) {
      console.warn('Cannot acknowledge alert: not connected');
      return;
    }

    this.socket.emit('alert_acknowledged', {
      alertId,
      sessionId: sessionId || this.config.sessionId,
      timestamp: new Date(),
      acknowledgedBy: 'interviewer' // In real app, get from auth context
    });

    console.log(`Acknowledged alert: ${alertId}`);
  }

  /**
   * Attempt to reconnect to the WebSocket server
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      if (this.callbacks.onError) {
        this.callbacks.onError(new Error('Failed to reconnect after maximum attempts'));
      }
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff

    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms`);

    setTimeout(() => {
      this.connect().catch((error) => {
        console.error('Reconnection failed:', error);
        this.attemptReconnect();
      });
    }, delay);
  }

  /**
   * Update authentication token
   */
  updateAuthToken(token: string): void {
    this.config.authToken = token;
    
    if (this.socket && this.isConnected) {
      // Reconnect with new token
      this.disconnect();
      this.connect();
    }
  }

  /**
   * Update callbacks
   */
  updateCallbacks(callbacks: Partial<AlertStreamingCallbacks>): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Get connection status
   */
  isConnectedToServer(): boolean {
    return this.isConnected && this.socket?.connected === true;
  }

  /**
   * Get current session ID
   */
  getCurrentSessionId(): string | undefined {
    return this.config.sessionId;
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
    this.reconnectAttempts = 0;
    console.log('Alert streaming service disconnected');
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.disconnect();
    this.callbacks = {};
  }
}