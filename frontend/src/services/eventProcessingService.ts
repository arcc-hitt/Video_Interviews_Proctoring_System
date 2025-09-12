import type {
  DetectionEvent,
  ProcessedEvent,
  EventAggregation,
  EventProcessingService,
  EventStreamConfig
} from '../types';
import { OfflineEventQueue } from './offlineEventQueue';

export class DetectionEventProcessingService implements EventProcessingService {
  private eventQueue: ProcessedEvent[] = [];
  private processedEvents: Map<string, ProcessedEvent> = new Map();
  private streamingQueue: ProcessedEvent[] = [];
  private streamingTimer: number | null = null;
  private isStreaming = false;
  private offlineQueue: OfflineEventQueue;

  // Configuration
  private config: EventStreamConfig = {
    batchSize: 10,
    flushInterval: 2000, // 2 seconds
    retryAttempts: 3,
    retryDelay: 1000 // 1 second
  };

  // Deduplication settings
  private readonly DEDUPLICATION_WINDOW = 5000; // 5 seconds
  private readonly CONFIDENCE_THRESHOLD = 0.1; // Minimum confidence difference to consider as new event

  public onEventProcessed?: (event: ProcessedEvent) => void;

  constructor(config?: Partial<EventStreamConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    // Initialize offline queue
    this.offlineQueue = new OfflineEventQueue({
      maxQueueSize: 1000,
      syncInterval: 5000,
      retryAttempts: 3,
      retryDelay: 1000
    });

    // Set up sync callback for offline queue
    this.offlineQueue.setSyncCallback(this.syncEventsToBackend.bind(this));

    this.startEventStreaming();
  }

  public processEvent(event: DetectionEvent): ProcessedEvent {
    const processedEvent: ProcessedEvent = {
      id: this.generateEventId(event),
      sessionId: event.sessionId,
      candidateId: event.candidateId,
      eventType: event.eventType,
      timestamp: event.timestamp,
      duration: event.duration,
      confidence: event.confidence,
      metadata: {
        ...event.metadata,
        processedAt: new Date(),
        originalEvent: event
      },
      isProcessed: false,
      isDuplicate: false
    };

    // Check for duplicates
    const isDuplicate = this.checkForDuplicate(processedEvent);
    processedEvent.isDuplicate = isDuplicate;

    // Add to queue if not duplicate
    if (!isDuplicate) {
      this.eventQueue.push(processedEvent);
      this.processedEvents.set(processedEvent.id, processedEvent);
      
      // Add to streaming queue for backend transmission
      this.addToStreamingQueue(processedEvent);

      // Add to offline queue for persistence
      this.offlineQueue.addEvent(processedEvent);
    }

    // Mark as processed
    processedEvent.isProcessed = true;

    // Emit processed event
    if (this.onEventProcessed) {
      this.onEventProcessed(processedEvent);
    }

    return processedEvent;
  }

  public aggregateEvents(events: ProcessedEvent[]): Map<string, EventAggregation> {
    const aggregations = new Map<string, EventAggregation>();

    events.forEach(event => {
      if (event.isDuplicate) return; // Skip duplicates

      const key = event.eventType;
      const existing = aggregations.get(key);

      if (existing) {
        // Update existing aggregation
        existing.count++;
        existing.totalDuration += event.duration || 0;
        existing.averageConfidence = (existing.averageConfidence * (existing.count - 1) + event.confidence) / existing.count;
        existing.lastOccurrence = event.timestamp > existing.lastOccurrence ? event.timestamp : existing.lastOccurrence;
        existing.events.push(event);
      } else {
        // Create new aggregation
        aggregations.set(key, {
          eventType: event.eventType,
          count: 1,
          totalDuration: event.duration || 0,
          averageConfidence: event.confidence,
          firstOccurrence: event.timestamp,
          lastOccurrence: event.timestamp,
          events: [event]
        });
      }
    });

    return aggregations;
  }

  public deduplicateEvents(events: ProcessedEvent[]): ProcessedEvent[] {
    const uniqueEvents: ProcessedEvent[] = [];
    const eventMap = new Map<string, ProcessedEvent>();

    // Sort events by timestamp
    const sortedEvents = [...events].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    sortedEvents.forEach(event => {
      const key = this.generateDeduplicationKey(event);
      const existing = eventMap.get(key);

      if (!existing) {
        // First occurrence of this event type
        eventMap.set(key, event);
        uniqueEvents.push(event);
      } else {
        // Check if this is a genuine duplicate or a new occurrence
        const timeDiff = event.timestamp.getTime() - existing.timestamp.getTime();
        const confidenceDiff = Math.abs(event.confidence - existing.confidence);

        if (timeDiff > this.DEDUPLICATION_WINDOW || confidenceDiff > this.CONFIDENCE_THRESHOLD) {
          // This is a new occurrence, not a duplicate
          eventMap.set(key, event);
          uniqueEvents.push(event);
        } else {
          // This is a duplicate, mark it as such
          event.isDuplicate = true;
        }
      }
    });

    return uniqueEvents;
  }

  public async streamEventToBackend(event: ProcessedEvent): Promise<void> {
    try {
      // Convert ProcessedEvent back to DetectionEvent format for API
      const apiEvent: DetectionEvent = {
        sessionId: event.sessionId,
        candidateId: event.candidateId,
        eventType: event.eventType,
        timestamp: event.timestamp,
        duration: event.duration,
        confidence: event.confidence,
        metadata: event.metadata
      };

      // Make API call to backend
      const response = await fetch('/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getAuthToken()}`
        },
        body: JSON.stringify(apiEvent)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      console.log('Event streamed successfully:', event.id);
    } catch (error) {
      console.error('Failed to stream event to backend:', error);
      throw error;
    }
  }

  public getEventQueue(): ProcessedEvent[] {
    return [...this.eventQueue];
  }

  public clearProcessedEvents(): void {
    this.eventQueue = [];
    this.processedEvents.clear();
    this.streamingQueue = [];
  }

  private generateEventId(event: DetectionEvent): string {
    const timestamp = event.timestamp.getTime();
    const hash = this.simpleHash(`${event.sessionId}-${event.eventType}-${timestamp}`);
    return `evt_${hash}_${timestamp}`;
  }

  private generateDeduplicationKey(event: ProcessedEvent): string {
    // Create a key based on event type and approximate timing/location
    const timeWindow = Math.floor(event.timestamp.getTime() / this.DEDUPLICATION_WINDOW);
    return `${event.eventType}-${timeWindow}-${event.sessionId}`;
  }

  private checkForDuplicate(event: ProcessedEvent): boolean {
    // const key = this.generateDeduplicationKey(event);
    
    // Check recent events for duplicates
    const recentEvents = Array.from(this.processedEvents.values()).filter(e => {
      const timeDiff = Math.abs(event.timestamp.getTime() - e.timestamp.getTime());
      return timeDiff <= this.DEDUPLICATION_WINDOW && e.eventType === event.eventType;
    });

    return recentEvents.some(existing => {
      const confidenceDiff = Math.abs(event.confidence - existing.confidence);
      return confidenceDiff <= this.CONFIDENCE_THRESHOLD;
    });
  }

  private addToStreamingQueue(event: ProcessedEvent): void {
    this.streamingQueue.push(event);
    
    // If queue is full, flush immediately
    if (this.streamingQueue.length >= this.config.batchSize) {
      this.flushStreamingQueue();
    }
  }

  private startEventStreaming(): void {
    if (this.streamingTimer) {
      clearInterval(this.streamingTimer);
    }

    this.streamingTimer = setInterval(() => {
      if (this.streamingQueue.length > 0) {
        this.flushStreamingQueue();
      }
    }, this.config.flushInterval) as unknown as number;
  }

  private async flushStreamingQueue(): Promise<void> {
    if (this.isStreaming || this.streamingQueue.length === 0) {
      return;
    }

    this.isStreaming = true;
    const eventsToStream = [...this.streamingQueue];
    this.streamingQueue = [];

    try {
      // Stream events in batch
      await this.streamEventsBatch(eventsToStream);
    } catch (error) {
      console.error('Failed to flush streaming queue:', error);
      // Re-add failed events to queue for retry
      this.streamingQueue.unshift(...eventsToStream);
    } finally {
      this.isStreaming = false;
    }
  }

  private async streamEventsBatch(events: ProcessedEvent[]): Promise<void> {
    const promises = events.map(event => this.streamEventWithRetry(event));
    await Promise.allSettled(promises);
  }

  private async streamEventWithRetry(event: ProcessedEvent, attempt = 1): Promise<void> {
    try {
      await this.streamEventToBackend(event);
    } catch (error) {
      if (attempt < this.config.retryAttempts) {
        console.log(`Retrying event stream (attempt ${attempt + 1}/${this.config.retryAttempts}):`, event.id);
        await this.delay(this.config.retryDelay * attempt);
        return this.streamEventWithRetry(event, attempt + 1);
      } else {
        console.error(`Failed to stream event after ${this.config.retryAttempts} attempts:`, event.id);
        throw error;
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  public cleanup(): void {
    if (this.streamingTimer) {
      clearInterval(this.streamingTimer);
      this.streamingTimer = null;
    }
    
    // Flush any remaining events
    if (this.streamingQueue.length > 0) {
      this.flushStreamingQueue();
    }
    
    this.clearProcessedEvents();
    this.isStreaming = false;
    this.offlineQueue.cleanup();
  }

  /**
   * Sync events to backend (used by offline queue)
   */
  private async syncEventsToBackend(events: ProcessedEvent[]): Promise<boolean> {
    try {
      const response = await fetch('/api/events/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getAuthToken()}`
        },
        body: JSON.stringify({ events })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.success === true;
    } catch (error) {
      console.error('Failed to sync events to backend:', error);
      return false;
    }
  }

  /**
   * Get authentication token (gets from localStorage)
   */
  private getAuthToken(): string {
    return localStorage.getItem('auth_token') || '';
  }

  /**
   * Get offline queue status
   */
  public getOfflineQueueStatus() {
    return this.offlineQueue.getQueueStatus();
  }

  /**
   * Manually sync offline events
   */
  public async syncOfflineEvents() {
    return await this.offlineQueue.syncEvents();
  }
}

export default DetectionEventProcessingService;