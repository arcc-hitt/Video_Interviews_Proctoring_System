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
      console.log('Max reconnection attempts reached');
      setError('Connection lost. Please refresh the page.');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
    console.log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttempts.current + 1})`);
    
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
            acknowledgedBy: 'Current User' // In real app, get from auth context
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
      console.log('[useAlertStreaming] 📋 Service already exists, skipping recreation');
      return;
    }

    if (!options.authToken) {
      console.log('[useAlertStreaming] ⚠️ No auth token provided, skipping service creation');
      return;
    }

    console.log('[useAlertStreaming] 🏗️ Creating new AlertStreamingService');
    
    const config: AlertStreamingConfig = {
      backendUrl: options.backendUrl || import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000',
      authToken: options.authToken,
      sessionId: options.sessionId,
      reconnectAttempts: maxReconnectAttempts,
      reconnectDelay: 2000
    };

    const callbacks = {
      onAlert: (alert: Alert) => {
        console.log('[useAlertStreaming] 📥 Received alert:', alert);

        const now = Date.now();
        const throttleDuration = ALERT_THROTTLE_CONFIG[alert.type] || ALERT_THROTTLE_CONFIG['default'];
        const lastTimestamp = lastAlertTimestamps.current[alert.type] || 0;

        if (now - lastTimestamp < throttleDuration) {
          console.log(`[useAlertStreaming] 🤫 Throttling alert of type: ${alert.type}`);
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
        console.log('[useAlertStreaming] 📥 Received detection event:', event);

        const now = Date.now();
        const throttleDuration = ALERT_THROTTLE_CONFIG[event.eventType] || ALERT_THROTTLE_CONFIG['default'];
        const lastTimestamp = lastAlertTimestamps.current[event.eventType] || 0;

        if (now - lastTimestamp < throttleDuration) {
          console.log(`[useAlertStreaming] 🤫 Throttling detection event as alert of type: ${event.eventType}`);
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
      
      onManualFlag: (flag: ManualFlag) => {
        console.log('Manual flag received:', flag);
      },
      
      onConnect: () => {
        console.log('[useAlertStreaming] ✅ Alert streaming connected');
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
        reconnectAttempts.current = 0;
        clearReconnectTimeout();
      },
      
      onDisconnect: () => {
        console.log('[useAlertStreaming] ❌ Alert streaming disconnected');
        setIsConnected(false);
        setIsConnecting(false);
        
        // Attempt to reconnect if it wasn't a manual disconnect
        if (options.autoConnect !== false && reconnectAttempts.current < maxReconnectAttempts) {
          handleReconnect();
        }
      },
      
      onError: (err: Error) => {
        console.error('[useAlertStreaming] ❌ Alert streaming error:', err);
        setError(err.message);
        setIsConnecting(false);
        if (options.onError) {
          options.onError(err);
        }
      }
    };

    // Clean up existing service first
    if (serviceRef.current) {
      console.log('[useAlertStreaming] 🧹 Cleaning up existing service');
      serviceRef.current.destroy();
    }

    serviceRef.current = new AlertStreamingService(config, callbacks);

    return () => {
      console.log('[useAlertStreaming] 🧹 Effect cleanup triggered');
      clearReconnectTimeout();
      // Don't destroy service immediately in cleanup (React StrictMode issue)
      // Service will be cleaned up when component actually unmounts or token changes
    };
  }, [options.authToken]); // Only essential dependency

  // Cleanup effect for component unmount
  useEffect(() => {
    return () => {
      console.log('[useAlertStreaming] 🧹 Component unmounting, destroying service');
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
      console.log('[useAlertStreaming] Auto-connecting to alert stream');
      
      // Add debounce to prevent rapid connection attempts in StrictMode
      const connectTimer = setTimeout(() => {
        if (serviceRef.current && !isConnected && !isConnecting && options.authToken) {
          console.log('[useAlertStreaming] 🚀 Executing delayed connect');
          connect();
        } else {
          console.log('[useAlertStreaming] ⏹️ Skipping connect due to state change');
        }
      }, 200); // Increased delay
      
      return () => {
        console.log('[useAlertStreaming] 🚫 Cancelling connect timer');
        clearTimeout(connectTimer);
      };
    }
  }, [options.autoConnect, options.authToken, isConnected, isConnecting, connect]);

  // Handle session changes with debouncing and better checks
  useEffect(() => {
    console.log('[useAlertStreaming] Session change effect triggered:', {
      isConnected,
      sessionId: options.sessionId,
      hasService: !!serviceRef.current
    });
    
    if (isConnected && options.sessionId && serviceRef.current) {
      console.log('[useAlertStreaming] 🔄 Session changed, scheduling join:', options.sessionId);
      
      // Debounce session joining to prevent multiple rapid calls
      const sessionTimer = setTimeout(() => {
        if (serviceRef.current && isConnected && options.sessionId) {
          console.log('[useAlertStreaming] 🚪 Executing delayed session join:', options.sessionId);
          joinSession(options.sessionId);
        } else {
          console.log('[useAlertStreaming] ⏹️ Skipping session join due to state change');
        }
      }, 500); // Increased delay for stability
      
      return () => {
        console.log('[useAlertStreaming] 🚫 Cancelling session join timer');
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