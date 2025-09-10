import { useEffect, useRef, useCallback, useState } from 'react';
import { MediaPipeFaceDetectionService } from '../services/faceDetectionService';
import type { FocusEvent, FocusStatus, DetectionEvent } from '../types';

interface UseFaceDetectionOptions {
  enabled?: boolean;
  onDetectionEvent?: (event: DetectionEvent) => void;
  sessionId?: string;
  candidateId?: string;
}

interface UseFaceDetectionReturn {
  isInitialized: boolean;
  currentFocusStatus: FocusStatus | null;
  processFrame: (imageData: ImageData) => Promise<void>;
  cleanup: () => void;
  error: string | null;
}

export const useFaceDetection = ({
  enabled = true,
  onDetectionEvent,
  sessionId = '',
  candidateId = ''
}: UseFaceDetectionOptions = {}): UseFaceDetectionReturn => {
  const serviceRef = useRef<MediaPipeFaceDetectionService | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentFocusStatus, setCurrentFocusStatus] = useState<FocusStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initialize the face detection service
  useEffect(() => {
    if (!enabled) return;

    const initializeService = async () => {
      try {
        const service = new MediaPipeFaceDetectionService();
        
        // Set up focus event handler
        service.onFocusEvent = (focusEvent: FocusEvent) => {
          handleFocusEvent(focusEvent);
        };

        serviceRef.current = service;
        setIsInitialized(true);
        setError(null);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to initialize face detection';
        setError(errorMessage);
        console.error('Face detection initialization error:', err);
      }
    };

    initializeService();

    return () => {
      if (serviceRef.current) {
        serviceRef.current.cleanup();
        serviceRef.current = null;
      }
      setIsInitialized(false);
    };
  }, [enabled]);

  // Handle focus events and convert to detection events
  const handleFocusEvent = useCallback((focusEvent: FocusEvent) => {
    if (!onDetectionEvent || !sessionId || !candidateId) return;

    // Convert FocusEvent to DetectionEvent
    const detectionEvent: DetectionEvent = {
      sessionId,
      candidateId,
      eventType: mapFocusEventToDetectionType(focusEvent.type),
      timestamp: focusEvent.timestamp,
      duration: focusEvent.duration,
      confidence: focusEvent.confidence,
      metadata: {
        ...focusEvent.metadata,
        originalEventType: focusEvent.type
      }
    };

    onDetectionEvent(detectionEvent);
  }, [onDetectionEvent, sessionId, candidateId]);

  // Process a video frame for face detection
  const processFrame = useCallback(async (imageData: ImageData): Promise<void> => {
    if (!serviceRef.current || !isInitialized || !enabled) {
      return;
    }

    try {
      // Detect faces in the frame
      const faceDetectionResult = await serviceRef.current.detectFace(imageData);
      
      // Track gaze direction from detected landmarks
      const gazeDirection = serviceRef.current.trackGazeDirection(faceDetectionResult.landmarks);
      
      // Check focus status and handle timers
      const focusStatus = serviceRef.current.checkFocusStatus(gazeDirection, faceDetectionResult.faces.length);
      
      setCurrentFocusStatus(focusStatus);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Face detection processing error';
      setError(errorMessage);
      console.error('Face detection processing error:', err);
    }
  }, [isInitialized, enabled]);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (serviceRef.current) {
      serviceRef.current.cleanup();
      serviceRef.current = null;
    }
    setIsInitialized(false);
    setCurrentFocusStatus(null);
    setError(null);
  }, []);

  return {
    isInitialized,
    currentFocusStatus,
    processFrame,
    cleanup,
    error
  };
};

// Helper function to map focus event types to detection event types
function mapFocusEventToDetectionType(focusEventType: FocusEvent['type']): DetectionEvent['eventType'] {
  switch (focusEventType) {
    case 'focus-loss':
      return 'focus-loss';
    case 'absence':
      return 'absence';
    case 'multiple-faces':
      return 'multiple-faces';
    case 'focus-restored':
    case 'presence-restored':
      // These are positive events, we might want to log them differently
      // For now, we'll treat them as focus-loss with different metadata
      return 'focus-loss';
    default:
      return 'focus-loss';
  }
}

export default useFaceDetection;