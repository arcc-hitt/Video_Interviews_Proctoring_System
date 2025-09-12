import { useEffect, useRef, useCallback, useState } from 'react';
import { BlazeFaceDetectionService } from '../services/blazeFaceDetectionService';
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
  const serviceRef = useRef<BlazeFaceDetectionService | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentFocusStatus, setCurrentFocusStatus] = useState<FocusStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Handle focus events from the detection service
  const handleFocusEvent = useCallback((focusEvent: FocusEvent) => {
    if (onDetectionEvent && sessionId && candidateId) {
      // Create proper metadata structure according to shared types
      const metadata: Record<string, any> = {
        eventSource: 'face-detection',
        processingTime: Date.now() - focusEvent.timestamp.getTime()
      };

      // Add faceCount if available
      if (focusEvent.metadata.faceCount !== undefined) {
        metadata.faceCount = focusEvent.metadata.faceCount;
      }

      // Add gazeDirection if available and properly structured
      if (focusEvent.metadata.gazeDirection) {
        metadata.gazeDirection = {
          x: Number(focusEvent.metadata.gazeDirection.x) || 0,
          y: Number(focusEvent.metadata.gazeDirection.y) || 0
        };
      }

      // Add description based on event type and metadata
      let description = '';
      switch (focusEvent.type) {
        case 'absence':
          description = 'Candidate not visible in camera frame';
          break;
        case 'multiple-faces':
          description = `Multiple faces detected: ${focusEvent.metadata.faceCount || 'unknown'} faces`;
          break;
        case 'focus-loss':
          description = 'Candidate looking away from screen';
          break;
        case 'focus-restored':
          description = 'Candidate attention restored';
          break;
        default:
          description = `Focus tracking event: ${focusEvent.type}`;
      }
      metadata.description = description;

      // Add any other metadata fields that are safe to pass through
      if (focusEvent.metadata.previousState !== undefined) {
        metadata.previousState = focusEvent.metadata.previousState;
      }

      // Convert FocusEvent to DetectionEvent format
      const detectionEvent: DetectionEvent = {
        sessionId,
        candidateId,
        eventType: focusEvent.type,
        timestamp: focusEvent.timestamp,
        ...(focusEvent.duration && focusEvent.duration > 0 && { duration: focusEvent.duration }),
        confidence: focusEvent.confidence,
        metadata
      };

      onDetectionEvent(detectionEvent);
    }
  }, [onDetectionEvent, sessionId, candidateId]);

  // Initialize the face detection service
  useEffect(() => {
    if (!enabled) return;

    const initializeService = async () => {
      try {
        const service = BlazeFaceDetectionService.getInstance();
        
        // Set up focus event handler
        service.onFocusEvent = handleFocusEvent;

        // Wait for proper initialization
        await service.initialize();

        serviceRef.current = service;
        setIsInitialized(service.getIsInitialized());
        setError(null);
      } catch (error) {
        console.error('Failed to initialize BlazeFace detection service:', error);
        setError(error instanceof Error ? error.message : 'Face detection initialization failed');
        setIsInitialized(false);
      }
    };

    initializeService();
  }, [enabled, handleFocusEvent]);

  // Process video frame for face detection
  const processFrame = useCallback(async (imageData: ImageData): Promise<void> => {
    if (!serviceRef.current || !isInitialized || !enabled) {
      return;
    }

    try {
      const result = await serviceRef.current.detectFace(imageData);
      
      // Update current focus status if we have faces
      if (result.faces.length > 0) {
        const face = result.faces[0];
        const gazeDirection = serviceRef.current.trackGazeDirection(face.landmarks);
        const focusStatus = serviceRef.current.checkFocusStatus(gazeDirection, result.faces.length);
        setCurrentFocusStatus(focusStatus);
      } else {
        // No faces detected
        setCurrentFocusStatus({
          isFocused: false,
          gazeDirection: { x: 0, y: 0, isLookingAtScreen: false, confidence: 0 },
          faceCount: 0,
          isPresent: false,
          confidence: 0
        });
      }
    } catch (error) {
      console.error('Face detection processing error:', error);
      setError(error instanceof Error ? error.message : 'Face detection processing failed');
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    isInitialized,
    currentFocusStatus,
    processFrame,
    cleanup,
    error
  };
};
