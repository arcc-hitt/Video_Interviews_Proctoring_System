import { useState, useEffect, useCallback, useRef } from 'react';
import type { Alert, DetectionEvent } from '../types';
import { AlertStreamingService, type AlertStreamingConfig, type ManualFlag } from '../services/alertStreamingService';
import { ALERT_THROTTLE_CONFIG } from '../config/alertConfig';

interface UseAlertStreamingOptions {
  backendUrl?: string;
  authToken: string;
  sessionId?: string;
  autoConnect?: boolean;
  maxAlerts?: number;
  onError?: (error: Error) => void;
}

interface UseAlertStreamingReturn {
  alerts: Alert[];
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  joinSession: (sessionId: string) => Promise<void>;
  leaveSession: () => void;
  sendManualFlag: (description: string, severity: 'low' | 'medium' | 'high') => void;
  acknowledgeAlert: (alertId: string) => void;
  clearAlerts: () => void;
  clearError: () => void;
}

const getEventMessage = (event: DetectionEvent): string => {
  switch (event.eventType) {
    case 'focus-loss':
      return 'Candidate looked away from screen';
    case 'absence':
      return 'No face detected';
    case 'multiple-faces':
      return 'Multiple faces detected';
    case 'unauthorized-item':
      return 'Unauthorized item detected';
    default:
      return `Event: ${event.eventType}`;
  }
};

const getEventSeverity = (eventType: string): 'low' | 'medium' | 'high' => {
  switch (eventType) {
    case 'focus-loss':
      return 'medium';
    case 'absence':
    case 'multiple-faces':
    case 'unauthorized-item':
      return 'high';
    default:
      return 'low';
  }
};

export const useAlertStreaming = (options: UseAlertStreamingOptions): UseAlertStreamingReturn => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const serviceRef = useRef<AlertStreamingService | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastAlertTimestamps = useRef<Record<string, number>>({});
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 10;

  // Clear reconnect timeout
  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  // Handle automatic reconnection
  const handleReconnect = useCallback(() => {
    if (reconnectAttempts.current >= maxReconnectAttempts) {
      // Max reconnection attempts reached
      setError('Connection lost. Please refresh the page.');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
    // Attempting to reconnect
    
    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectAttempts.current++;
      connect();
    }, delay);
  }, []);

  const connect = useCallback(async (): Promise<void> => {
    if (!serviceRef.current || isConnecting || isConnected) return;
    
    setIsConnecting(true);
    setError(null);
    
    try {
      await serviceRef.current.connect();
    } catch (error) {
      console.error('Failed to connect to alert streaming service:', error);
      setError(error instanceof Error ? error.message : 'Connection failed');
      setIsConnecting(false);
    }
  }, [isConnecting, isConnected]);

  const disconnect = useCallback(() => {
    clearReconnectTimeout();
    reconnectAttempts.current = 0;
    
    if (serviceRef.current) {
      serviceRef.current.disconnect();
    }
    
    setIsConnected(false);
    setIsConnecting(false);
  }, [clearReconnectTimeout]);

  const joinSession = useCallback(async (sessionId: string): Promise<void> => {
    if (serviceRef.current && isConnected) {
      try {
        await serviceRef.current.joinSession(sessionId);
      } catch (error) {
        console.error('Failed to join session:', error);
        setError(error instanceof Error ? error.message : 'Failed to join session');
      }
    }
  }, [isConnected]);

  const leaveSession = useCallback(() => {
    if (serviceRef.current && isConnected) {
      serviceRef.current.leaveSession();
    }
  }, [isConnected]);

  const sendManualFlag = useCallback((description: string, severity: 'low' | 'medium' | 'high') => {
    if (serviceRef.current && isConnected && options.sessionId) {
      const flag: ManualFlag = {
        id: `flag-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        sessionId: options.sessionId,
        interviewerId: 'current-interviewer', // This should come from auth state
        description,
        severity,
        timestamp: new Date(),
        flagged: true
      };
      
      serviceRef.current.sendManualFlag(flag.description, flag.severity);
    }
  }, [isConnected, options.sessionId]);

  const acknowledgeAlert = useCallback((alertId: string) => {
    // Mark alert as acknowledged instead of removing it
    setAlerts(prev => prev.map(alert => 
      alert.id === alertId 
        ? { 
            ...alert, 
            acknowledged: true, 
            acknowledgedAt: new Date(),
            acknowledgedBy: 'Current User'
          }
        : alert
    ));
    
    // Still send acknowledgment to backend if service is available
    if (serviceRef.current && isConnected) {
      serviceRef.current.acknowledgeAlert(alertId);
    }
  }, [isConnected]);

  const clearAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Initialize service - only recreate when essential dependencies change
  useEffect(() => {
    // Don't recreate service if it already exists and we have a valid token
    if (serviceRef.current && options.authToken) {
      return;
    }

    if (!options.authToken) {
      return;
    }
    
    const config: AlertStreamingConfig = {
      backendUrl: options.backendUrl || import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000',
      authToken: options.authToken,
      sessionId: options.sessionId,
      reconnectAttempts: maxReconnectAttempts,
      reconnectDelay: 2000
    };

    const callbacks = {
      onAlert: (alert: Alert) => {
        const now = Date.now();
        const throttleDuration = ALERT_THROTTLE_CONFIG[alert.type] || ALERT_THROTTLE_CONFIG['default'];
        const lastTimestamp = lastAlertTimestamps.current[alert.type] || 0;

        if (now - lastTimestamp < throttleDuration) {
          return;
        }
        lastAlertTimestamps.current[alert.type] = now;

        setAlerts(prev => {
          // Generate ID if not provided
          const alertWithId = {
            ...alert,
            id: alert.id || `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
          };
          
          // Prevent duplicates and limit alerts
          const newAlerts = [alertWithId, ...prev.filter(a => a.id !== alertWithId.id)];
          return newAlerts; // Keep only the most recent alerts
        });
      },
      
      onDetectionEvent: (event: DetectionEvent) => {
        const now = Date.now();
        const throttleDuration = ALERT_THROTTLE_CONFIG[event.eventType] || ALERT_THROTTLE_CONFIG['default'];
        const lastTimestamp = lastAlertTimestamps.current[event.eventType] || 0;

        if (now - lastTimestamp < throttleDuration) {
          return;
        }
        lastAlertTimestamps.current[event.eventType] = now;

        // Convert detection events to alerts for display
        const alert: Alert = {
          id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: event.eventType,
          message: getEventMessage(event),
          timestamp: event.timestamp,
          severity: getEventSeverity(event.eventType),
          confidence: event.confidence,
          metadata: event.metadata
        };
        setAlerts(prev => [alert, ...prev]);
      },
      
      onManualFlag: () => {
        // Manual flag received
      },
      
      onConnect: () => {
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
        reconnectAttempts.current = 0;
        clearReconnectTimeout();
      },
      
      onDisconnect: () => {
        setIsConnected(false);
        setIsConnecting(false);
        
        // Attempt to reconnect if it wasn't a manual disconnect
        if (options.autoConnect !== false && reconnectAttempts.current < maxReconnectAttempts) {
          handleReconnect();
        }
      },
      
      onError: (err: Error) => {
        console.error('[useAlertStreaming] Alert streaming error:', err);
        setError(err.message);
        setIsConnecting(false);
        if (options.onError) {
          options.onError(err);
        }
      }
    };

    // Clean up existing service first
    if (serviceRef.current) {
      console.log('[useAlertStreaming] Cleaning up existing service');
      serviceRef.current.destroy();
    }

    serviceRef.current = new AlertStreamingService(config, callbacks);

    return () => {
      clearReconnectTimeout();
      // Service will be cleaned up when component actually unmounts or token changes
    };
  }, [options.authToken]); // Only essential dependency

  // Cleanup effect for component unmount
  useEffect(() => {
    return () => {
      if (serviceRef.current) {
        serviceRef.current.destroy();
        serviceRef.current = null;
      }
      clearReconnectTimeout();
    };
  }, []); // Empty dependency array - only runs on unmount

  // Auto-connect effect with better debouncing and service check
  useEffect(() => {
    if (options.autoConnect !== false && options.authToken && serviceRef.current && !isConnected && !isConnecting) {
      // Add debounce to prevent rapid connection attempts in StrictMode
      const connectTimer = setTimeout(() => {
        if (serviceRef.current && !isConnected && !isConnecting && options.authToken) {
          connect();
        }
      }, 100);
      
      return () => {
        clearTimeout(connectTimer);
      };
    }
  }, [options.autoConnect, options.authToken, isConnected, isConnecting, connect]);

  // Handle session changes with debouncing and better checks
  useEffect(() => {
    if (isConnected && options.sessionId && serviceRef.current) {
      // Debounce session joining to prevent multiple rapid calls
      const sessionTimer = setTimeout(() => {
        if (serviceRef.current && isConnected && options.sessionId) {
          joinSession(options.sessionId);
        }
      }, 500); // Increased delay for stability
      
      return () => {
        clearTimeout(sessionTimer);
      };
    }
  }, [options.sessionId, isConnected, joinSession]);

  return {
    alerts,
    isConnected,
    isConnecting,
    error,
    connect,
    disconnect,
    joinSession,
    leaveSession,
    sendManualFlag,
    acknowledgeAlert,
    clearAlerts,
    clearError
  };
};