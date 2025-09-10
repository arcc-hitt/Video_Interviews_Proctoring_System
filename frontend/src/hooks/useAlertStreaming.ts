import { useState, useEffect, useCallback, useRef } from 'react';
import type { Alert, DetectionEvent } from '../types';
import { AlertStreamingService, type AlertStreamingConfig, type ManualFlag } from '../services/alertStreamingService';

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
  joinSession: (sessionId: string) => void;
  leaveSession: () => void;
  sendManualFlag: (description: string, severity: 'low' | 'medium' | 'high') => void;
  acknowledgeAlert: (alertId: string) => void;
  clearAlerts: () => void;
  clearError: () => void;
}

export const useAlertStreaming = (options: UseAlertStreamingOptions): UseAlertStreamingReturn => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const serviceRef = useRef<AlertStreamingService | null>(null);
  const maxAlerts = options.maxAlerts || 100;

  // Initialize service
  useEffect(() => {
    const config: AlertStreamingConfig = {
      backendUrl: options.backendUrl || process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000',
      authToken: options.authToken,
      sessionId: options.sessionId,
      reconnectAttempts: 5,
      reconnectDelay: 1000
    };

    const callbacks = {
      onAlert: (alert: Alert) => {
        setAlerts(prev => {
          const newAlerts = [alert, ...prev];
          return newAlerts.slice(0, maxAlerts); // Keep only the most recent alerts
        });
      },
      
      onDetectionEvent: (event: DetectionEvent) => {
        console.log('Detection event received:', event);
      },
      
      onManualFlag: (flag: ManualFlag) => {
        console.log('Manual flag received:', flag);
      },
      
      onConnect: () => {
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
      },
      
      onDisconnect: () => {
        setIsConnected(false);
        setIsConnecting(false);
      },
      
      onError: (err: Error) => {
        setError(err.message);
        setIsConnecting(false);
        if (options.onError) {
          options.onError(err);
        }
      }
    };

    serviceRef.current = new AlertStreamingService(config, callbacks);

    // Auto-connect if enabled
    if (options.autoConnect !== false) {
      connect();
    }

    return () => {
      if (serviceRef.current) {
        serviceRef.current.destroy();
        serviceRef.current = null;
      }
    };
  }, [options.authToken, options.backendUrl, options.sessionId, maxAlerts, options.onError]);

  // Connect to WebSocket
  const connect = useCallback(async () => {
    if (!serviceRef.current || isConnecting || isConnected) return;

    setIsConnecting(true);
    setError(null);

    try {
      await serviceRef.current.connect();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
      setIsConnecting(false);
    }
  }, [isConnecting, isConnected]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (serviceRef.current) {
      serviceRef.current.disconnect();
    }
    setIsConnected(false);
    setIsConnecting(false);
  }, []);

  // Join a session
  const joinSession = useCallback((sessionId: string) => {
    if (serviceRef.current) {
      serviceRef.current.joinSession(sessionId);
    }
  }, []);

  // Leave current session
  const leaveSession = useCallback(() => {
    if (serviceRef.current) {
      serviceRef.current.leaveSession();
    }
  }, []);

  // Send manual flag
  const sendManualFlag = useCallback((description: string, severity: 'low' | 'medium' | 'high') => {
    if (serviceRef.current) {
      serviceRef.current.sendManualFlag(description, severity);
    }
  }, []);

  // Acknowledge alert
  const acknowledgeAlert = useCallback((alertId: string) => {
    if (serviceRef.current) {
      serviceRef.current.acknowledgeAlert(alertId);
    }
  }, []);

  // Clear all alerts
  const clearAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Update auth token when it changes
  useEffect(() => {
    if (serviceRef.current && options.authToken) {
      serviceRef.current.updateAuthToken(options.authToken);
    }
  }, [options.authToken]);

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