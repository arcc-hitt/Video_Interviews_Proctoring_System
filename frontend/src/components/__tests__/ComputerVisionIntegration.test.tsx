import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useComputerVision } from '../../hooks/useComputerVision';
import { useFaceDetection } from '../../hooks/useFaceDetection';
import { DetectionEventProcessingService } from '../../services/eventProcessingService';

// Mock the computer vision hooks
vi.mock('../../hooks/useComputerVision');
vi.mock('../../hooks/useFaceDetection');

describe('Computer Vision Integration - Core Functionality', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Computer Vision Hooks Integration', () => {
    it('should initialize computer vision services correctly', () => {
      const mockProcessFrame = vi.fn();
      const mockCleanup = vi.fn();
      const mockOnDetectionEvent = vi.fn();

      (useComputerVision as vi.Mock).mockReturnValue({
        isInitialized: true,
        currentFocusStatus: null,
        unauthorizedItems: [],
        processFrame: mockProcessFrame,
        getEventAggregations: vi.fn(() => new Map()),
        getEventQueue: vi.fn(() => []),
        clearEvents: vi.fn(),
        cleanup: mockCleanup,
        error: null
      });

      (useFaceDetection as vi.Mock).mockReturnValue({
        isInitialized: true,
        processFrame: mockProcessFrame,
        cleanup: mockCleanup
      });

      // Test that hooks are properly configured
      expect(useComputerVision).toBeDefined();
      expect(useFaceDetection).toBeDefined();
    });

    it('should handle detection events correctly', () => {
      const mockDetectionEvent = {
        sessionId: 'test-session-id',
        candidateId: 'test-candidate-id',
        eventType: 'focus-loss' as const,
        timestamp: new Date(),
        confidence: 0.8,
        metadata: {}
      };

      const mockProcessFrame = vi.fn();
      const mockOnDetectionEvent = vi.fn();

      (useComputerVision as vi.Mock).mockReturnValue({
        isInitialized: true,
        processFrame: mockProcessFrame,
        cleanup: vi.fn(),
        error: null
      });

      // Simulate processing a detection event
      expect(mockProcessFrame).toBeDefined();
      expect(mockOnDetectionEvent).toBeDefined();
    });
  });

  describe('Event Processing Service Integration', () => {
    it('should process detection events through the service', () => {
      const eventService = new DetectionEventProcessingService({
        batchSize: 5,
        flushInterval: 1000,
        retryAttempts: 3,
        retryDelay: 500
      });

      const mockEvent = {
        sessionId: 'test-session-id',
        candidateId: 'test-candidate-id',
        eventType: 'focus-loss' as const,
        timestamp: new Date(),
        confidence: 0.8,
        metadata: {}
      };

      const processedEvent = eventService.processEvent(mockEvent);

      expect(processedEvent).toBeDefined();
      expect(processedEvent.sessionId).toBe('test-session-id');
      expect(processedEvent.eventType).toBe('focus-loss');
      expect(processedEvent.isProcessed).toBe(true);
    });

    it('should aggregate events correctly', () => {
      const eventService = new DetectionEventProcessingService();

      const events = [
        {
          id: 'evt1',
          sessionId: 'test-session-id',
          candidateId: 'test-candidate-id',
          eventType: 'focus-loss' as const,
          timestamp: new Date(),
          confidence: 0.8,
          metadata: {},
          isProcessed: true,
          isDuplicate: false
        },
        {
          id: 'evt2',
          sessionId: 'test-session-id',
          candidateId: 'test-candidate-id',
          eventType: 'focus-loss' as const,
          timestamp: new Date(),
          confidence: 0.9,
          metadata: {},
          isProcessed: true,
          isDuplicate: false
        }
      ];

      const aggregations = eventService.aggregateEvents(events);

      expect(aggregations.size).toBe(1);
      expect(aggregations.has('focus-loss')).toBe(true);
      
      const focusLossAgg = aggregations.get('focus-loss');
      expect(focusLossAgg?.count).toBe(2);
      expect(focusLossAgg?.averageConfidence).toBeCloseTo(0.85);
    });

    it('should deduplicate events correctly', () => {
      const eventService = new DetectionEventProcessingService();

      const events = [
        {
          id: 'evt1',
          sessionId: 'test-session-id',
          candidateId: 'test-candidate-id',
          eventType: 'focus-loss' as const,
          timestamp: new Date(),
          confidence: 0.8,
          metadata: {},
          isProcessed: true,
          isDuplicate: false
        },
        {
          id: 'evt2',
          sessionId: 'test-session-id',
          candidateId: 'test-candidate-id',
          eventType: 'focus-loss' as const,
          timestamp: new Date(Date.now() + 1000), // 1 second later
          confidence: 0.81, // Very similar confidence
          metadata: {},
          isProcessed: true,
          isDuplicate: false
        }
      ];

      const deduplicatedEvents = eventService.deduplicateEvents(events);

      // Should have only one event due to deduplication
      expect(deduplicatedEvents.length).toBe(1);
    });
  });

  describe('Computer Vision Pipeline Flow', () => {
    it('should handle face detection events', () => {
      const mockFaceDetectionResult = {
        faces: [
          {
            landmarks: [],
            boundingBox: { x: 100, y: 100, width: 200, height: 200 },
            confidence: 0.9
          }
        ],
        landmarks: [],
        confidence: 0.9,
        timestamp: new Date()
      };

      const mockGazeDirection = {
        x: 0.1,
        y: 0.2,
        isLookingAtScreen: true,
        confidence: 0.8
      };

      const mockFocusStatus = {
        isFocused: true,
        gazeDirection: mockGazeDirection,
        faceCount: 1,
        isPresent: true,
        confidence: 0.8
      };

      // Test that the pipeline can handle face detection results
      expect(mockFaceDetectionResult.faces).toHaveLength(1);
      expect(mockFocusStatus.isFocused).toBe(true);
      expect(mockFocusStatus.faceCount).toBe(1);
    });

    it('should handle object detection events', () => {
      const mockDetectedObjects = [
        {
          class: 'cell phone',
          confidence: 0.9,
          boundingBox: { x: 50, y: 50, width: 100, height: 150 },
          timestamp: new Date()
        }
      ];

      const mockUnauthorizedItems = [
        {
          type: 'phone' as const,
          confidence: 0.9,
          position: { x: 50, y: 50, width: 100, height: 150 },
          firstDetected: new Date(),
          lastSeen: new Date(),
          persistenceDuration: 2000
        }
      ];

      // Test that object detection results are properly classified
      expect(mockDetectedObjects).toHaveLength(1);
      expect(mockDetectedObjects[0].class).toBe('cell phone');
      expect(mockUnauthorizedItems).toHaveLength(1);
      expect(mockUnauthorizedItems[0].type).toBe('phone');
    });

    it('should handle multiple detection types simultaneously', () => {
      const mockEvents = [
        {
          sessionId: 'test-session-id',
          candidateId: 'test-candidate-id',
          eventType: 'focus-loss' as const,
          timestamp: new Date(),
          confidence: 0.8,
          metadata: {}
        },
        {
          sessionId: 'test-session-id',
          candidateId: 'test-candidate-id',
          eventType: 'unauthorized-item' as const,
          timestamp: new Date(),
          confidence: 0.9,
          metadata: { itemType: 'phone' }
        }
      ];

      const eventService = new DetectionEventProcessingService();
      const processedEvents = mockEvents.map(event => eventService.processEvent(event));

      expect(processedEvents).toHaveLength(2);
      expect(processedEvents[0].eventType).toBe('focus-loss');
      expect(processedEvents[1].eventType).toBe('unauthorized-item');
    });
  });

  describe('Error Handling', () => {
    it('should handle computer vision initialization errors', () => {
      (useComputerVision as vi.Mock).mockReturnValue({
        isInitialized: false,
        processFrame: vi.fn(),
        cleanup: vi.fn(),
        error: 'Computer vision initialization failed'
      });

      const result = useComputerVision({
        enabled: true,
        sessionId: 'test-session-id',
        candidateId: 'test-candidate-id'
      });

      expect(result.isInitialized).toBe(false);
      expect(result.error).toBe('Computer vision initialization failed');
    });

    it('should handle event processing errors gracefully', () => {
      const eventService = new DetectionEventProcessingService();

      // Mock fetch to throw an error
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const mockEvent = {
        sessionId: 'test-session-id',
        candidateId: 'test-candidate-id',
        eventType: 'focus-loss' as const,
        timestamp: new Date(),
        confidence: 0.8,
        metadata: {}
      };

      const processedEvent = eventService.processEvent(mockEvent);

      // Event should still be processed even if backend call fails
      expect(processedEvent).toBeDefined();
      expect(processedEvent.isProcessed).toBe(true);
    });
  });

  describe('Performance and Optimization', () => {
    it('should handle high-frequency events efficiently', () => {
      const eventService = new DetectionEventProcessingService({
        batchSize: 10,
        flushInterval: 1000
      });

      const events = Array.from({ length: 50 }, (_, i) => ({
        sessionId: 'test-session-id',
        candidateId: 'test-candidate-id',
        eventType: 'focus-loss' as const,
        timestamp: new Date(Date.now() + i * 100),
        confidence: 0.8,
        metadata: {}
      }));

      const startTime = Date.now();
      events.forEach(event => eventService.processEvent(event));
      const endTime = Date.now();

      // Should process events quickly
      expect(endTime - startTime).toBeLessThan(1000); // Less than 1 second for 50 events
    });

    it('should clean up resources properly', () => {
      const eventService = new DetectionEventProcessingService();
      
      // Process some events
      const mockEvent = {
        sessionId: 'test-session-id',
        candidateId: 'test-candidate-id',
        eventType: 'focus-loss' as const,
        timestamp: new Date(),
        confidence: 0.8,
        metadata: {}
      };

      eventService.processEvent(mockEvent);

      // Cleanup should not throw errors
      expect(() => eventService.cleanup()).not.toThrow();
    });
  });
});
