import type { ProcessedEvent } from '../types';

interface OfflineEventQueueConfig {
  maxQueueSize: number;
  syncInterval: number;
  retryAttempts: number;
  retryDelay: number;
}

interface QueuedEvent {
  id: string;
  event: ProcessedEvent;
  timestamp: number;
  retryCount: number;
  lastAttempt: number;
}

export class OfflineEventQueue {
  private queue: QueuedEvent[] = [];
  private config: OfflineEventQueueConfig;
  private syncTimer: number | null = null;
  private isOnline = navigator.onLine;
  private syncCallback?: (events: ProcessedEvent[]) => Promise<boolean>;

  constructor(config: Partial<OfflineEventQueueConfig> = {}) {
    this.config = {
      maxQueueSize: 1000,
      syncInterval: 5000, // 5 seconds
      retryAttempts: 3,
      retryDelay: 1000, // 1 second
      ...config
    };

    this.loadFromStorage();
    this.setupOnlineOfflineListeners();
    this.startSyncTimer();
  }

  /**
   * Add an event to the offline queue
   */
  public addEvent(event: ProcessedEvent): void {
    const queuedEvent: QueuedEvent = {
      id: this.generateEventId(event),
      event,
      timestamp: Date.now(),
      retryCount: 0,
      lastAttempt: 0
    };

    // Add to memory queue
    this.queue.push(queuedEvent);

    // Enforce max queue size
    if (this.queue.length > this.config.maxQueueSize) {
      this.queue = this.queue.slice(-this.config.maxQueueSize);
    }

    // Save to storage
    this.saveToStorage();

    // Try to sync immediately if online
    if (this.isOnline) {
      this.syncEvents();
    }
  }

  /**
   * Set the callback function for syncing events
   */
  public setSyncCallback(callback: (events: ProcessedEvent[]) => Promise<boolean>): void {
    this.syncCallback = callback;
  }

  /**
   * Manually trigger sync of queued events
   */
  public async syncEvents(): Promise<{ success: boolean; syncedCount: number; failedCount: number }> {
    if (!this.syncCallback || this.queue.length === 0) {
      return { success: true, syncedCount: 0, failedCount: 0 };
    }

    const eventsToSync = this.queue.filter(item => 
      item.retryCount < this.config.retryAttempts &&
      (Date.now() - item.lastAttempt) > this.config.retryDelay
    );

    if (eventsToSync.length === 0) {
      return { success: true, syncedCount: 0, failedCount: 0 };
    }

    try {
      const events = eventsToSync.map(item => item.event);
      const success = await this.syncCallback(events);

      if (success) {
        // Remove successfully synced events
        const syncedIds = new Set(eventsToSync.map(item => item.id));
        this.queue = this.queue.filter(item => !syncedIds.has(item.id));
        this.saveToStorage();
        
        return { success: true, syncedCount: eventsToSync.length, failedCount: 0 };
      } else {
        // Increment retry count for failed events
        eventsToSync.forEach(item => {
          item.retryCount++;
          item.lastAttempt = Date.now();
        });
        this.saveToStorage();
        
        return { success: false, syncedCount: 0, failedCount: eventsToSync.length };
      }
    } catch (error) {
      console.error('Failed to sync events:', error);
      
      // Increment retry count for all events
      eventsToSync.forEach(item => {
        item.retryCount++;
        item.lastAttempt = Date.now();
      });
      this.saveToStorage();
      
      return { success: false, syncedCount: 0, failedCount: eventsToSync.length };
    }
  }

  /**
   * Get current queue status
   */
  public getQueueStatus(): {
    totalEvents: number;
    pendingEvents: number;
    failedEvents: number;
    oldestEvent: Date | null;
    newestEvent: Date | null;
  } {
    const now = Date.now();
    const pendingEvents = this.queue.filter(item => 
      item.retryCount < this.config.retryAttempts &&
      (now - item.lastAttempt) > this.config.retryDelay
    );
    const failedEvents = this.queue.filter(item => 
      item.retryCount >= this.config.retryAttempts
    );

    return {
      totalEvents: this.queue.length,
      pendingEvents: pendingEvents.length,
      failedEvents: failedEvents.length,
      oldestEvent: this.queue.length > 0 ? new Date(Math.min(...this.queue.map(item => item.timestamp))) : null,
      newestEvent: this.queue.length > 0 ? new Date(Math.max(...this.queue.map(item => item.timestamp))) : null
    };
  }

  /**
   * Clear all events from the queue
   */
  public clearQueue(): void {
    this.queue = [];
    this.saveToStorage();
  }

  /**
   * Clear only failed events from the queue
   */
  public clearFailedEvents(): void {
    this.queue = this.queue.filter(item => item.retryCount < this.config.retryAttempts);
    this.saveToStorage();
  }

  /**
   * Get all queued events (for debugging)
   */
  public getAllEvents(): QueuedEvent[] {
    return [...this.queue];
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  private setupOnlineOfflineListeners(): void {
    const handleOnline = () => {
      this.isOnline = true;
      console.log('Network connection restored, syncing queued events...');
      this.syncEvents();
    };

    const handleOffline = () => {
      this.isOnline = false;
      console.log('Network connection lost, events will be queued offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Store cleanup function
    this.cleanup = () => {
      if (this.syncTimer) {
        clearInterval(this.syncTimer);
        this.syncTimer = null;
      }
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }

  private startSyncTimer(): void {
    this.syncTimer = window.setInterval(() => {
      if (this.isOnline && this.queue.length > 0) {
        this.syncEvents();
      }
    }, this.config.syncInterval);
  }

  private generateEventId(event: ProcessedEvent): string {
    return `${event.sessionId}_${event.eventType}_${event.timestamp.getTime()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private saveToStorage(): void {
    try {
      const data = {
        queue: this.queue,
        timestamp: Date.now()
      };
      localStorage.setItem('offline_event_queue', JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save offline event queue to storage:', error);
    }
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('offline_event_queue');
      if (stored) {
        const data = JSON.parse(stored);
        
        // Only load events from the last 24 hours to prevent storage bloat
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        this.queue = (data.queue || []).filter((item: QueuedEvent) => 
          item.timestamp > oneDayAgo
        );
        
        // Clean up old events from storage
        this.saveToStorage();
      }
    } catch (error) {
      console.error('Failed to load offline event queue from storage:', error);
      this.queue = [];
    }
  }
}
