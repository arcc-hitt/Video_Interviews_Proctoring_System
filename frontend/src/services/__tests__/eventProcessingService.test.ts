import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DetectionEventProcessingService } from '../eventProcessingService';
import type { DetectionEvent, ProcessedEvent } from '../../types';

// Mock fetch for API calls
global.fetch = vi.fn();

describe('DetectionEventProcessingService', () => {
  let service: DetectionEventProcessingService;
  let mockOnEventProcessed: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnEventProcessed = vi.fn();
    
    // Mock successful API responses
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ success: true })
    });

    service = new DetectionEventProcessingService({
      batchSize: 2,
      flushInterval: 100, // Shorter interval for testing
      retryAttempts: 2,
      retryDelay: 50
    });
    
    service.onEventProcessed = mockOnEventProcessed;
  });

  afterEach(() => {
    service.cleanup();
  });

  describe('processEvent', () => {
    it('should process a detection event and create processed event', () => {
      const detectionEvent: DetectionEvent = {
        sessionId: 'session-123',
        candidateId: 'candidate-456',
        eventType: 'focus-loss',
        timestamp: new Date(),
        duration: 5000,
        confidence: 0.85,
        metadata: { gazeDirection: { x: 0.8, y: 0.3 } }
      };

      const result = service.processEvent(detectionEvent);

      expect(result).toMatchObject({
        id: expect.any(String),
        sessionId: 'session-123',
        candidateId: 'candidate-456',
        eventType: 'focus-loss',
        timestamp: detectionEvent.timestamp,
        duration: 5000,
        confidence: 0.85,
        isProcessed: true,
        isDuplicate: false
      });

      expect(result.metadata).toMatchObject({
        gazeDirection: { x: 0.8, y: 0.3 },
        processedAt: expect.any(Date),
        originalEvent: detectionEvent
      });

      expect(mockOnEventProcessed).toHaveBeenCalledWith(result);
    });

    it('should detect and mark duplicate events', () => {
      const baseEvent: DetectionEvent = {
        sessionId: 'session-123',
        candidateId: 'candidate-456',
        eventType: 'focus-loss',
        timestamp: new Date(),
        duration: 5000,
        confidence: 0.85,
        metadata: {}
      };

      // Process first event
      const firstResult = service.processEvent(baseEvent);
      expect(firstResult.isDuplicate).toBe(false);

      // Process duplicate event (same type, similar time and confidence)
      const duplicateEvent = {
        ...baseEvent,
        timestamp: new Date(baseEvent.timestamp.getTime() + 1000), // 1 second later
        confidence: 0.86 // Very similar confidence
      };

      const secondResult = service.processEvent(duplicateEvent);
      expect(secondResult.isDuplicate).toBe(true);
    });

    it('should not mark as duplicate if confidence difference is significant', () => {
      const baseEvent: DetectionEvent = {
        sessionId: 'session-123',
        candidateId: 'candidate-456',
        eventType: 'focus-loss',
        timestamp: new Date(),
        duration: 5000,
        confidence: 0.5,
        metadata: {}
      };

      // Process first event
      const firstResult = service.processEvent(baseEvent);
      expect(firstResult.isDuplicate).toBe(false);

      // Process event with significantly different confidence
      const differentEvent = {
        ...baseEvent,
        timestamp: new Date(baseEvent.timestamp.getTime() + 1000),
        confidence: 0.9 // Significantly different confidence
      };

      const secondResult = service.processEvent(differentEvent);
      expect(secondResult.isDuplicate).toBe(false);
    });

    it('should not mark as duplicate if time difference is significant', () => {
      const baseEvent: DetectionEvent = {
        sessionId: 'session-123',
        candidateId: 'candidate-456',
        eventType: 'focus-loss',
        timestamp: new Date(),
        duration: 5000,
        confidence: 0.85,
        metadata: {}
      };

      // Process first event
      const firstResult = service.processEvent(baseEvent);
      expect(firstResult.isDuplicate).toBe(false);

      // Process event with significant time difference
      const laterEvent = {
        ...baseEvent,
        timestamp: new Date(baseEvent.timestamp.getTime() + 10000), // 10 seconds later
        confidence: 0.86
      };

      const secondResult = service.processEvent(laterEvent);
      expect(secondResult.isDuplicate).toBe(false);
    });
  });

  describe('aggregateEvents', () => {
    it('should aggregate events by type', () => {
      const events: ProcessedEvent[] = [
        {
          id: '1',
          sessionId: 'session-123',
          candidateId: 'candidate-456',
          eventType: 'focus-loss',
          timestamp: new Date('2024-01-01T10:00:00Z'),
          duration: 5000,
          confidence: 0.8,
          metadata: {},
          isProcessed: true,
          isDuplicate: false
        },
        {
          id: '2',
          sessionId: 'session-123',
          candidateId: 'candidate-456',
          eventType: 'focus-loss',
          timestamp: new Date('2024-01-01T10:05:00Z'),
          duration: 3000,
          confidence: 0.9,
          metadata: {},
          isProcessed: true,
          isDuplicate: false
        },
        {
          id: '3',
          sessionId: 'session-123',
          candidateId: 'candidate-456',
          eventType: 'absence',
          timestamp: new Date('2024-01-01T10:10:00Z'),
          duration: 10000,
          confidence: 0.95,
          metadata: {},
          isProcessed: true,
          isDuplicate: false
        }
      ];

      const aggregations = service.aggregateEvents(events);

      expect(aggregations.size).toBe(2);

      const focusLossAgg = aggregations.get('focus-loss');
      expect(focusLossAgg).toMatchObject({
        eventType: 'focus-loss',
        count: 2,
        totalDuration: 8000,
        firstOccurrence: new Date('2024-01-01T10:00:00Z'),
        lastOccurrence: new Date('2024-01-01T10:05:00Z')
      });
      expect(focusLossAgg?.averageConfidence).toBeCloseTo(0.85, 2);

      const absenceAgg = aggregations.get('absence');
      expect(absenceAgg).toMatchObject({
        eventType: 'absence',
        count: 1,
        totalDuration: 10000,
        averageConfidence: 0.95
      });
    });

    it('should skip duplicate events in aggregation', () => {
      const events: ProcessedEvent[] = [
        {
          id: '1',
          sessionId: 'session-123',
          candidateId: 'candidate-456',
          eventType: 'focus-loss',
          timestamp: new Date(),
          duration: 5000,
          confidence: 0.8,
          metadata: {},
          isProcessed: true,
          isDuplicate: false
        },
        {
          id: '2',
          sessionId: 'session-123',
          candidateId: 'candidate-456',
          eventType: 'focus-loss',
          timestamp: new Date(),
          duration: 3000,
          confidence: 0.9,
          metadata: {},
          isProcessed: true,
          isDuplicate: true // This should be skipped
        }
      ];

      const aggregations = service.aggregateEvents(events);
      const focusLossAgg = aggregations.get('focus-loss');

      expect(focusLossAgg?.count).toBe(1);
      expect(focusLossAgg?.totalDuration).toBe(5000);
    });
  });

  describe('deduplicateEvents', () => {
    it('should remove duplicate events within time window', () => {
      const baseTime = new Date();
      const events: ProcessedEvent[] = [
        {
          id: '1',
          sessionId: 'session-123',
          candidateId: 'candidate-456',
          eventType: 'focus-loss',
          timestamp: baseTime,
          confidence: 0.8,
          metadata: {},
          isProcessed: true,
          isDuplicate: false
        },
        {
          id: '2',
          sessionId: 'session-123',
          candidateId: 'candidate-456',
          eventType: 'focus-loss',
          timestamp: new Date(baseTime.getTime() + 1000), // 1 second later
          confidence: 0.81, // Very similar confidence
          metadata: {},
          isProcessed: true,
          isDuplicate: false
        }
      ];

      const deduplicated = service.deduplicateEvents(events);

      expect(deduplicated).toHaveLength(1);
      expect(deduplicated[0].id).toBe('1');
      expect(events[1].isDuplicate).toBe(true);
    });

    it('should keep events with significant time or confidence differences', () => {
      const baseTime = new Date();
      const events: ProcessedEvent[] = [
        {
          id: '1',
          sessionId: 'session-123',
          candidateId: 'candidate-456',
          eventType: 'focus-loss',
          timestamp: baseTime,
          confidence: 0.5,
          metadata: {},
          isProcessed: true,
          isDuplicate: false
        },
        {
          id: '2',
          sessionId: 'session-123',
          candidateId: 'candidate-456',
          eventType: 'focus-loss',
          timestamp: new Date(baseTime.getTime() + 1000),
          confidence: 0.9, // Significant confidence difference
          metadata: {},
          isProcessed: true,
          isDuplicate: false
        }
      ];

      const deduplicated = service.deduplicateEvents(events);

      expect(deduplicated).toHaveLength(2);
      expect(events[1].isDuplicate).toBe(false);
    });
  });

  describe('streamEventToBackend', () => {
    it('should successfully stream event to backend', async () => {
      const event: ProcessedEvent = {
        id: '1',
        sessionId: 'session-123',
        candidateId: 'candidate-456',
        eventType: 'focus-loss',
        timestamp: new Date(),
        duration: 5000,
        confidence: 0.8,
        metadata: {},
        isProcessed: true,
        isDuplicate: false
      };

      await service.streamEventToBackend(event);

      expect(global.fetch).toHaveBeenCalledWith('/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: 'session-123',
          candidateId: 'candidate-456',
          eventType: 'focus-loss',
          timestamp: event.timestamp,
          duration: 5000,
          confidence: 0.8,
          metadata: {}
        })
      });
    });

    it('should throw error on failed API call', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500
      });

      const event: ProcessedEvent = {
        id: '1',
        sessionId: 'session-123',
        candidateId: 'candidate-456',
        eventType: 'focus-loss',
        timestamp: new Date(),
        confidence: 0.8,
        metadata: {},
        isProcessed: true,
        isDuplicate: false
      };

      await expect(service.streamEventToBackend(event)).rejects.toThrow('HTTP error! status: 500');
    });
  });

  describe('event streaming and batching', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should batch events and flush when batch size is reached', async () => {
      const event1: DetectionEvent = {
        sessionId: 'session-123',
        candidateId: 'candidate-456',
        eventType: 'focus-loss',
        timestamp: new Date(),
        confidence: 0.8,
        metadata: {}
      };

      const event2: DetectionEvent = {
        sessionId: 'session-123',
        candidateId: 'candidate-456',
        eventType: 'absence',
        timestamp: new Date(),
        confidence: 0.9,
        metadata: {}
      };

      // Process events (batch size is 2)
      service.processEvent(event1);
      service.processEvent(event2);

      // Wait for async operations
      await vi.runAllTimersAsync();

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should have streaming functionality available', () => {
      // Test that the service has the streaming methods available
      expect(typeof service.streamEventToBackend).toBe('function');
      expect(service.getEventQueue).toBeDefined();
      expect(service.clearProcessedEvents).toBeDefined();
    });
  });

  describe('getEventQueue and clearProcessedEvents', () => {
    it('should return copy of event queue', () => {
      const event: DetectionEvent = {
        sessionId: 'session-123',
        candidateId: 'candidate-456',
        eventType: 'focus-loss',
        timestamp: new Date(),
        confidence: 0.8,
        metadata: {}
      };

      service.processEvent(event);
      const queue = service.getEventQueue();

      expect(queue).toHaveLength(1);
      expect(queue[0].eventType).toBe('focus-loss');

      // Modifying returned queue should not affect internal queue
      queue.pop();
      expect(service.getEventQueue()).toHaveLength(1);
    });

    it('should clear all processed events', () => {
      const event: DetectionEvent = {
        sessionId: 'session-123',
        candidateId: 'candidate-456',
        eventType: 'focus-loss',
        timestamp: new Date(),
        confidence: 0.8,
        metadata: {}
      };

      service.processEvent(event);
      expect(service.getEventQueue()).toHaveLength(1);

      service.clearProcessedEvents();
      expect(service.getEventQueue()).toHaveLength(0);
    });
  });
});