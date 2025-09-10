import { useEffect, useRef, useCallback, useState } from 'react';
import { MediaPipeFaceDetectionService } from '../services/faceDetectionService';
import { TensorFlowObjectDetectionService } from '../services/objectDetectionService';
import { DetectionEventProcessingService } from '../services/eventProcessingService';
import type { 
  FocusEvent, 
  DetectionEvent, 
  ProcessedEvent,
  FocusStatus,
  UnauthorizedItem,
  EventAggregation
} from '../types';

interface UseComputerVisionOptions {
  enabled?: boolean;
  sessionId?: string;
  candidateId?: string;
  onDetectionEvent?: (event: DetectionEvent) => void;
  onProcessedEvent?: (event: ProcessedEvent) => void;
}

interface UseComputerVisionReturn {
  isInitialized: boolean;
  currentFocusStatus: FocusStatus | null;
  unauthorizedItems: UnauthorizedItem[];
  processFrame: (imageData: ImageData) => Promise<void>;
  getEventAggregations: () => Map<string, EventAggregation>;
  getEventQueue: () => ProcessedEvent[];
  clearEvents: () => void;
  cleanup: () => void;
  error: string | null;
}

export const useComputerVision = ({
  enabled = true,
  sessionId = '',
  candidateId = '',
  onDetectionEvent,
  onProcessedEvent
}: UseComputerVisionOptions = {}): UseComputerVisionReturn => {
  const faceServiceRef = useRef<MediaPipeFaceDetectionService | null>(null);
  const objectServiceRef = useRef<TensorFlowObjectDetectionService | null>(null);
  const eventServiceRef = useRef<DetectionEventProcessingService | null>(null);
  
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentFocusStatus, setCurrentFocusStatus] = useState<FocusStatus | null>(null);
  const [unauthorizedItems, setUnauthorizedItems] = useState<UnauthorizedItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Initialize all services
  useEffect(() => {
    if (!enabled) return;

    const initializeServices = async () => {
      try {
        // Initialize event processing service
        const eventService = new DetectionEventProcessingService({
          batchSize: 5,
          flushInterval: 3000,
          retryAttempts: 3,
          retryDelay: 1000
        });

        eventService.onEventProcessed = (event: ProcessedEvent) => {
          if (onProcessedEvent) {
            onProcessedEvent(event);
          }
        };

        // Initialize face detection service
        const faceService = new MediaPipeFaceDetectionService();
        faceService.onFocusEvent = (focusEvent: FocusEvent) => {
          handleFocusEvent(focusEvent, eventService);
        };

        // Initialize object detection service
        const objectService = new TensorFlowObjectDetectionService();
        objectService.onUnauthorizedItemDetected = (item: UnauthorizedItem) => {
          handleUnauthorizedItemEvent(item, eventService);
        };

        faceServiceRef.current = faceService;
        objectServiceRef.current = objectService;
        eventServiceRef.current = eventService;

        setIsInitialized(true);
        setError(null);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to initialize computer vision services';
        setError(errorMessage);
        console.error('Computer vision initialization error:', err);
      }
    };

    initializeServices();

    return () => {
      if (faceServiceRef.current) {
        faceServiceRef.current.cleanup();
        faceServiceRef.current = null;
      }
      if (objectServiceRef.current) {
        objectServiceRef.current.cleanup();
        objectServiceRef.current = null;
      }
      if (eventServiceRef.current) {
        eventServiceRef.current.cleanup();
        eventServiceRef.current = null;
      }
      setIsInitialized(false);
    };
  }, [enabled, onProcessedEvent]);

  // Handle focus events from face detection
  const handleFocusEvent = useCallback((focusEvent: FocusEvent, eventService: DetectionEventProcessingService) => {
    if (!sessionId || !candidateId) return;

    const detectionEvent: DetectionEvent = {
      sessionId,
      candidateId,
      eventType: mapFocusEventToDetectionType(focusEvent.type),
      timestamp: focusEvent.timestamp,
      duration: focusEvent.duration,
      confidence: focusEvent.confidence,
      metadata: {
        ...focusEvent.metadata,
        originalEventType: focusEvent.type,
        source: 'face-detection'
      }
    };

    // Process through event service
    eventService.processEvent(detectionEvent);

    // Also call the original handler if provided
    if (onDetectionEvent) {
      onDetectionEvent(detectionEvent);
    }
  }, [sessionId, candidateId, onDetectionEvent]);

  // Handle unauthorized item events from object detection
  const handleUnauthorizedItemEvent = useCallback((item: UnauthorizedItem, eventService: DetectionEventProcessingService) => {
    if (!sessionId || !candidateId) return;

    const detectionEvent: DetectionEvent = {
      sessionId,
      candidateId,
      eventType: 'unauthorized-item',
      timestamp: item.firstDetected,
      duration: item.persistenceDuration,
      confidence: item.confidence,
      metadata: {
        itemType: item.type,
        position: item.position,
        persistenceDuration: item.persistenceDuration,
        source: 'object-detection'
      }
    };

    // Process through event service
    eventService.processEvent(detectionEvent);

    // Also call the original handler if provided
    if (onDetectionEvent) {
      onDetectionEvent(detectionEvent);
    }
  }, [sessionId, candidateId, onDetectionEvent]);

  // Process a video frame through both detection services
  const processFrame = useCallback(async (imageData: ImageData): Promise<void> => {
    if (!isInitialized || !enabled) return;

    try {
      const promises: Promise<any>[] = [];

      // Face detection
      if (faceServiceRef.current) {
        promises.push(
          faceServiceRef.current.detectFace(imageData).then(faceResult => {
            const gazeDirection = faceServiceRef.current!.trackGazeDirection(faceResult.landmarks);
            const focusStatus = faceServiceRef.current!.checkFocusStatus(gazeDirection, faceResult.faces.length);
            setCurrentFocusStatus(focusStatus);
            return focusStatus;
          })
        );
      }

      // Object detection
      if (objectServiceRef.current) {
        promises.push(
          objectServiceRef.current.detectObjects(imageData).then(objects => {
            const unauthorizedItems = objectServiceRef.current!.classifyUnauthorizedItems(objects);
            setUnauthorizedItems(unauthorizedItems);
            return unauthorizedItems;
          })
        );
      }

      await Promise.all(promises);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Computer vision processing error';
      setError(errorMessage);
      console.error('Computer vision processing error:', err);
    }
  }, [isInitialized, enabled]);

  // Get event aggregations
  const getEventAggregations = useCallback((): Map<string, EventAggregation> => {
    if (!eventServiceRef.current) {
      return new Map();
    }
    
    const events = eventServiceRef.current.getEventQueue();
    return eventServiceRef.current.aggregateEvents(events);
  }, []);

  // Get event queue
  const getEventQueue = useCallback((): ProcessedEvent[] => {
    if (!eventServiceRef.current) {
      return [];
    }
    return eventServiceRef.current.getEventQueue();
  }, []);

  // Clear events
  const clearEvents = useCallback(() => {
    if (eventServiceRef.current) {
      eventServiceRef.current.clearProcessedEvents();
    }
  }, []);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (faceServiceRef.current) {
      faceServiceRef.current.cleanup();
      faceServiceRef.current = null;
    }
    if (objectServiceRef.current) {
      objectServiceRef.current.cleanup();
      objectServiceRef.current = null;
    }
    if (eventServiceRef.current) {
      eventServiceRef.current.cleanup();
      eventServiceRef.current = null;
    }
    setIsInitialized(false);
    setCurrentFocusStatus(null);
    setUnauthorizedItems([]);
    setError(null);
  }, []);

  return {
    isInitialized,
    currentFocusStatus,
    unauthorizedItems,
    processFrame,
    getEventAggregations,
    getEventQueue,
    clearEvents,
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
      return 'focus-loss'; // For now, treat as focus-loss with different metadata
    default:
      return 'focus-loss';
  }
}

export default useComputerVision;