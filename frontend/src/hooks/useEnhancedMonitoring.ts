import { useCallback, useEffect, useRef, useState } from 'react';
import { EnhancedMonitoringService } from '../services/enhancedMonitoringService';
import type { DetectionEvent, FaceLandmarks } from '../types';

export interface UseEnhancedMonitoringOptions {
  sessionId: string;
  candidateId: string;
  onDetectionEvent?: (event: DetectionEvent) => void;
}

export interface EnhancedMonitoringState {
  isMonitoring: boolean;
  stats: {
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
  };
  error: string | null;
}

/**
 * Custom hook for enhanced monitoring (drowsiness and audio detection)
 * Integrates with the existing proctoring system
 */
export function useEnhancedMonitoring({
  sessionId,
  candidateId,
  onDetectionEvent
}: UseEnhancedMonitoringOptions) {
  const serviceRef = useRef<EnhancedMonitoringService | null>(null);
  const [state, setState] = useState<EnhancedMonitoringState>({
    isMonitoring: false,
    stats: {
      drowsiness: {
        totalBlinks: 0,
        avgBlinkRate: 0,
        avgDrowsinessScore: 0
      },
      audio: {
        isMonitoring: false,
        baselineNoiseLevel: 0,
        totalSpeechSegments: 0,
        avgVolume: 0
      }
    },
    error: null
  });

  // Initialize the service
  useEffect(() => {
    if (!serviceRef.current) {
      serviceRef.current = new EnhancedMonitoringService();
      
      // Set up event handler
      serviceRef.current.onDetectionEvent = (event: DetectionEvent) => {
        if (onDetectionEvent) {
          onDetectionEvent(event);
        }
      };
    }

    return () => {
      if (serviceRef.current) {
        serviceRef.current.stopMonitoring();
      }
    };
  }, [onDetectionEvent]);

  // Start monitoring
  const startMonitoring = useCallback(async () => {
    if (!serviceRef.current) return;

    try {
      setState(prev => ({ ...prev, error: null }));
      await serviceRef.current.startMonitoring(sessionId, candidateId);
      
      setState(prev => ({
        ...prev,
        isMonitoring: true,
        stats: serviceRef.current!.getMonitoringStats()
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start enhanced monitoring';
      setState(prev => ({
        ...prev,
        isMonitoring: false,
        error: errorMessage
      }));
      throw error;
    }
  }, [sessionId, candidateId]);

  // Stop monitoring
  const stopMonitoring = useCallback(() => {
    if (!serviceRef.current) return;

    serviceRef.current.stopMonitoring();
    setState(prev => ({
      ...prev,
      isMonitoring: false,
      stats: serviceRef.current!.getMonitoringStats()
    }));
  }, []);

  // Process face landmarks for drowsiness detection
  const processFaceLandmarks = useCallback(async (faceLandmarks: FaceLandmarks[]) => {
    if (!serviceRef.current || !state.isMonitoring) {
      return null;
    }

    try {
      const result = await serviceRef.current.processFaceLandmarks(
        faceLandmarks,
        sessionId,
        candidateId
      );

      // Update stats after processing
      setState(prev => ({
        ...prev,
        stats: serviceRef.current!.getMonitoringStats()
      }));

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to process face landmarks';
      setState(prev => ({ ...prev, error: errorMessage }));
      return null;
    }
  }, [sessionId, candidateId, state.isMonitoring]);

  // Update stats periodically
  useEffect(() => {
    if (!state.isMonitoring || !serviceRef.current) return;

    const interval = setInterval(() => {
      setState(prev => ({
        ...prev,
        stats: serviceRef.current!.getMonitoringStats()
      }));
    }, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, [state.isMonitoring]);

  // Reset monitoring state
  const reset = useCallback(() => {
    if (!serviceRef.current) return;

    serviceRef.current.reset();
    setState(prev => ({
      ...prev,
      stats: serviceRef.current!.getMonitoringStats(),
      error: null
    }));
  }, []);

  // Get current detection statistics
  const getStats = useCallback(() => {
    if (!serviceRef.current) return state.stats;
    return serviceRef.current.getMonitoringStats();
  }, [state.stats]);

  // Clear error
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    // State
    isMonitoring: state.isMonitoring,
    stats: state.stats,
    error: state.error,
    
    // Actions
    startMonitoring,
    stopMonitoring,
    processFaceLandmarks,
    reset,
    getStats,
    clearError,
    
    // Direct service access if needed
    service: serviceRef.current
  };
}
