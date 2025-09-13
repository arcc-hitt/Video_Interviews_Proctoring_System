import { useEffect, useRef, useCallback, useState } from 'react';
import { BlazeFaceDetectionService } from '../services/blazeFaceDetectionService';
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
  onModelLoadError?: (error: string) => void;
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
  onProcessedEvent,
  onModelLoadError
}: UseComputerVisionOptions = {}): UseComputerVisionReturn => {
  const faceServiceRef = useRef<BlazeFaceDetectionService | null>(null);
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
        const faceService = BlazeFaceDetectionService.getInstance();
        await faceService.initialize(); // Wait for face detection to initialize
        faceService.onFocusEvent = (focusEvent: FocusEvent) => {
          handleFocusEvent(focusEvent, eventService);
        };

        // Initialize object detection service
        const objectService = new TensorFlowObjectDetectionService();
        await objectService.initialize(); // Wait for object detection to initialize
        objectService.onUnauthorizedItemDetected = (item: UnauthorizedItem) => {
          handleUnauthorizedItemEvent(item, eventService);
        };
        objectService.onModelLoadError = (error: string) => {
          if (onModelLoadError) {
            onModelLoadError(error);
          }
        };

        faceServiceRef.current = faceService;
        objectServiceRef.current = objectService;
        eventServiceRef.current = eventService;

        setIsInitialized(true);
        setError(null);
        console.log('Computer vision services initialized successfully');
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

    let description = 'Candidate changed focus';
    if (focusEvent.type === 'focus-loss' && focusEvent.metadata?.gazeDirection) {
      const { x, y } = focusEvent.metadata.gazeDirection;
      const HORIZONTAL_THRESHOLD = 0.2;
      const VERTICAL_THRESHOLD = 0.15;

      if (y > VERTICAL_THRESHOLD) {
        description = 'Candidate looked down';
      } else if (y < -VERTICAL_THRESHOLD * 1.5) { // Stricter threshold for looking up
        description = 'Candidate looked up';
      } else if (x > HORIZONTAL_THRESHOLD) {
        description = 'Candidate looked right';
      } else if (x < -HORIZONTAL_THRESHOLD) {
        description = 'Candidate looked left';
      }
    }

    const detectionEvent: DetectionEvent = {
      sessionId,
      candidateId,
      eventType: mapFocusEventToDetectionType(focusEvent.type),
      timestamp: focusEvent.timestamp,
      ...(focusEvent.duration && focusEvent.duration > 0 && { duration: focusEvent.duration }),
      confidence: focusEvent.confidence,
      metadata: {
        ...focusEvent.metadata,
        description, // Add detailed description
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
      ...(item.persistenceDuration && item.persistenceDuration > 0 && { duration: item.persistenceDuration }),
      confidence: item.confidence,
      metadata: {
        objectType: item.type,
        boundingBox: {
          x: item.position.x,
          y: item.position.y,
          width: item.position.width,
          height: item.position.height
        },
        description: `Unauthorized item detected: ${item.type}`,
        eventSource: 'object-detection'
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

      // Face detection with improved error handling
      if (faceServiceRef.current) {
        promises.push(
          faceServiceRef.current.detectFace(imageData)
            .then((faceResult: any) => {
              if (faceResult && faceResult.faces) {
                const gazeDirection = faceServiceRef.current!.trackGazeDirection(faceResult.landmarks || []);
                const focusStatus = faceServiceRef.current!.checkFocusStatus(gazeDirection, faceResult.faces.length);
                setCurrentFocusStatus(focusStatus);
                
                // Note: Face detection alerts (absence, multiple-faces, focus-loss) are handled 
                // by the dedicated BlazeFace service to avoid conflicts and ensure consistency
                
                return focusStatus;
              }
              return null;
            })
            .catch(err => {
              console.warn('Face detection error (non-fatal):', err);
              return null;
            })
        );
      }

      // Object detection with improved error handling
      if (objectServiceRef.current) {
        promises.push(
          objectServiceRef.current.detectObjects(imageData)
            .then(objects => {
              if (objects && Array.isArray(objects)) {
                const unauthorizedItems = objectServiceRef.current!.classifyUnauthorizedItems(objects);
                setUnauthorizedItems(unauthorizedItems);
                
                // Generate real-time alerts for unauthorized items
                unauthorizedItems.forEach(item => {
                  if (item.confidence > 0.7 && sessionId && candidateId) {
                    const detectionEvent: DetectionEvent = {
                      sessionId,
                      candidateId,
                      eventType: 'unauthorized-item',
                      timestamp: new Date(),
                      confidence: item.confidence,
                      metadata: {
                        objectType: item.type,
                        boundingBox: {
                          x: item.position.x,
                          y: item.position.y,
                          width: item.position.width,
                          height: item.position.height
                        },
                        description: `Unauthorized item detected: ${item.type}`,
                        eventSource: 'object-detection'
                      }
                    };
                    if (onDetectionEvent) {
                      onDetectionEvent(detectionEvent);
                    }
                  }
                });
                
                return unauthorizedItems;
              }
              return [];
            })
            .catch(err => {
              console.warn('Object detection error (non-fatal):', err);
              return [];
            })
        );
      }

      await Promise.allSettled(promises); // Use allSettled to handle individual failures
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Computer vision processing error';
      setError(errorMessage);
      console.error('Computer vision processing error:', err);
    }
  }, [isInitialized, enabled, sessionId, candidateId, onDetectionEvent]);

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
    case 'face-visible':
      return 'face-visible';
    case 'multiple-faces':
      return 'multiple-faces';
    default:
      return 'focus-loss';
  }
}

export default useComputerVision;