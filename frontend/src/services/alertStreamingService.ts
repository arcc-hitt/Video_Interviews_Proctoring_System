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
  private isConnecting = false;
  private isDestroyed = false;
  private currentSessionId: string | null = null;
  private joinSessionTimeout: NodeJS.Timeout | null = null;

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
        // Prevent connection conflicts
        if (this.isConnected || this.isConnecting || this.isDestroyed) {
          console.log('[AlertStreaming] 🚫 Connection prevented:', {
            isConnected: this.isConnected,
            isConnecting: this.isConnecting,
            isDestroyed: this.isDestroyed
          });
          if (this.isConnected) {
            resolve();
          } else {
            reject(new Error('Connection already in progress or service destroyed'));
          }
          return;
        }

        this.isConnecting = true;

        // Get token from localStorage if not provided in config
        const token = this.config.authToken || localStorage.getItem('token');
        
        if (!token) {
          this.isConnecting = false;
          console.error('[AlertStreaming] ❌ No authentication token available');
          reject(new Error('Authentication token is required'));
          return;
        }

        console.log('[AlertStreaming] 🔐 Connecting with token:', token ? '***has_token***' : 'missing');

        // Disconnect existing socket if any
        if (this.socket) {
          console.log('[AlertStreaming] 🔌 Cleaning up existing socket');
          this.socket.removeAllListeners();
          this.socket.disconnect();
          this.socket = null;
        }

        this.socket = io(this.config.backendUrl, {
          auth: {
            token: token
          },
          extraHeaders: {
            'Authorization': `Bearer ${token}`
          },
          transports: ['websocket', 'polling'],
          timeout: 15000, // Increased timeout
          forceNew: false,
          autoConnect: true,
          reconnection: false // We handle reconnection manually
        });

        this.setupEventListeners();

        // Set up connection promise resolution
        const connectionTimeout = setTimeout(() => {
          this.isConnecting = false;
          reject(new Error('Connection timeout'));
        }, 15000);

        this.socket.on('connect', () => {
          clearTimeout(connectionTimeout);
          console.log('[AlertStreaming] ✅ Alert streaming service connected');
          console.log('[AlertStreaming] 📡 Socket object:', this.socket?.id, 'connected:', this.socket?.connected);
          this.isConnected = true;
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          
          // Join session if sessionId is provided
          if (this.config.sessionId) {
            console.log('[AlertStreaming] 🔄 Auto-joining session:', this.config.sessionId);
            this.joinSessionTimeout = setTimeout(() => {
              if (this.isConnected && !this.isDestroyed) {
                this.joinSession(this.config.sessionId!);
              }
            }, 200); // Increased delay for stability
          }
          
          if (this.callbacks.onConnect) {
            this.callbacks.onConnect();
          }
          
          resolve();
        });

        this.socket.on('connect_error', (error) => {
          clearTimeout(connectionTimeout);
          this.isConnecting = false;
          console.error('[AlertStreaming] ❌ Connection error:', error);
          console.error('[AlertStreaming] Error details:', {
            message: error.message,
            stack: error.stack,
            name: error.name
          });
          
          if (this.callbacks.onError) {
            this.callbacks.onError(new Error(`Connection failed: ${error.message}`));
          }
          
          reject(error);
        });

        this.socket.on('disconnect', (reason) => {
          console.log('[AlertStreaming] 🔌 Socket disconnected:', reason);
          this.isConnected = false;
          this.isConnecting = false;
          
          if (this.callbacks.onDisconnect) {
            this.callbacks.onDisconnect();
          }
        });

      } catch (error) {
        this.isConnecting = false;
        console.error('[AlertStreaming] ❌ Connect method error:', error);
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
      console.log('Disconnect details:', {
        reason,
        wasConnected: this.isConnected,
        sessionId: this.config.sessionId,
        socketConnected: this.socket?.connected
      });
      this.isConnected = false;
      
      if (this.callbacks.onDisconnect) {
        this.callbacks.onDisconnect();
      }
      
      // Attempt reconnection for certain disconnect reasons
      if (reason === 'io server disconnect' || reason === 'transport close' || reason === 'transport error') {
        console.log('Attempting reconnect due to:', reason);
        this.attemptReconnect();
      }
    });

    // Direct alerts from backend (processed alerts with payloads)
    this.socket.on('alert', (alert: any) => {
      console.log('[AlertStreaming] 📥 Received alert from backend:', alert);
      console.log('[AlertStreaming] 📥 Alert details:', {
        id: alert.id,
        type: alert.type,
        eventType: alert.eventType,
        message: alert.message,
        timestamp: alert.timestamp,
        severity: alert.severity,
        confidence: alert.confidence,
        sessionId: alert.sessionId,
        candidateId: alert.candidateId
      });
      
      // Convert backend alert format to frontend Alert interface
      const frontendAlert: Alert = {
        id: alert.id || `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: alert.type || alert.eventType,
        message: alert.message,
        timestamp: new Date(alert.timestamp),
        severity: alert.severity,
        confidence: alert.confidence,
        metadata: alert.metadata
      };
      
      console.log('[AlertStreaming] 📥 Converted frontend alert:', frontendAlert);
      console.log('[AlertStreaming] 📥 Callback available:', !!this.callbacks.onAlert);
      
      if (this.callbacks.onAlert) {
        console.log('[AlertStreaming] 📥 Calling onAlert callback with:', frontendAlert);
        this.callbacks.onAlert(frontendAlert);
      } else {
        console.warn('[AlertStreaming] 📥 No onAlert callback registered!');
      }
    });

    // Detection event from candidate
    this.socket.on('detection_event_broadcast', (event: DetectionEvent) => {
      console.log('[AlertStreaming] 📥 Received detection event broadcast:', event);
      
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

    // Session joined confirmation
    this.socket.on('session_joined', (data: any) => {
      console.log('[AlertStreaming] ✅ Session joined confirmation:', data);
      console.log('[AlertStreaming] Session details:', {
        sessionId: data.sessionId,
        role: data.role,
        userId: data.userId,
        connectedUsers: data.connectedUsers,
        interviewerCount: data.connectedUsers?.interviewers?.length || 0
      });
    });

    // Session join error
    this.socket.on('session_join_error', (error: any) => {
      console.error('[AlertStreaming] ❌ Session join error:', error);
      if (this.callbacks.onError) {
        this.callbacks.onError(new Error(`Session join error: ${error.message || error}`));
      }
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
      console.warn('[AlertStreaming] Cannot join session: not connected', {
        hasSocket: !!this.socket,
        isConnected: this.isConnected,
        socketConnected: this.socket?.connected
      });
      return;
    }

    // Prevent duplicate session joins
    if (this.currentSessionId === sessionId) {
      console.log('[AlertStreaming] 🔄 Already joined session:', sessionId);
      return;
    }

    this.currentSessionId = sessionId;
    this.config.sessionId = sessionId;
    
    // Get authentication token and user info from localStorage
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    let userId = 'interviewer-default';
    
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        userId = user.userId || user.id || userId;
      } catch (e) {
        console.warn('[AlertStreaming] Failed to parse user data from localStorage');
      }
    }
    
    const joinPayload = {
      sessionId,
      role: 'interviewer',
      userId,
      token
    };
    
    console.log('[AlertStreaming] 📤 Emitting join_session event with full payload:', {
      sessionId,
      role: 'interviewer',
      userId,
      hasToken: !!token,
      socketId: this.socket.id,
      socketConnected: this.socket.connected
    });
    
    this.socket.emit('join_session', joinPayload);

    console.log(`[AlertStreaming] ✅ Successfully emitted join session: ${sessionId} as interviewer`);
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
    console.log('[AlertStreaming] 🔌 Disconnecting from alert stream');
    
    // Clear any pending session join timeout
    if (this.joinSessionTimeout) {
      clearTimeout(this.joinSessionTimeout);
      this.joinSessionTimeout = null;
    }
    
    if (this.socket) {
      this.socket.removeAllListeners(); // Clean up all listeners
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
    this.isConnecting = false;
    this.currentSessionId = null;
    this.reconnectAttempts = 0;
    console.log('[AlertStreaming] ❌ Alert streaming service disconnected');
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.isDestroyed = true;
    
    // Clear any pending timeouts
    if (this.joinSessionTimeout) {
      clearTimeout(this.joinSessionTimeout);
      this.joinSessionTimeout = null;
    }
    
    this.disconnect();
    this.callbacks = {};
  }
}