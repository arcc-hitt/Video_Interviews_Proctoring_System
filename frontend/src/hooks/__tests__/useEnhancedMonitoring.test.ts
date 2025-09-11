import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEnhancedMonitoring } from '../useEnhancedMonitoring';
import type { DetectionEvent, FaceLandmarks } from '../../types';

// Mock the enhanced monitoring service
vi.mock('../../services/enhancedMonitoringService', () => ({
  EnhancedMonitoringService: vi.fn().mockImplementation(() => ({
    onDetectionEvent: null,
    startMonitoring: vi.fn().mockResolvedValue(undefined),
    stopMonitoring: vi.fn(),
    processFaceLandmarks: vi.fn().mockResolvedValue(null),
    getMonitoringStats: vi.fn().mockReturnValue({
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
    }),
    reset: vi.fn(),
    isMonitoring: false
  }))
}));

const createMockFaceLandmarks = (): FaceLandmarks[] => {
  return Array.from({ length: 468 }, () => ({
    x: Math.random(),
    y: Math.random(),
    z: Math.random()
  }));
};

const mockOptions = {
  sessionId: 'session-123',
  candidateId: 'candidate-456',
  onDetectionEvent: vi.fn()
};

describe('useEnhancedMonitoring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Initialization', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() => useEnhancedMonitoring(mockOptions));

      expect(result.current.isMonitoring).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.stats).toBeDefined();
      expect(result.current.stats.drowsiness.totalBlinks).toBe(0);
      expect(result.current.stats.audio.isMonitoring).toBe(false);
    });

    it('should initialize the service on mount', () => {
      const { result } = renderHook(() => useEnhancedMonitoring(mockOptions));

      expect(result.current.service).toBeDefined();
    });

    it('should set up event handler', () => {
      const onDetectionEvent = vi.fn();
      const { result } = renderHook(() => 
        useEnhancedMonitoring({ ...mockOptions, onDetectionEvent })
      );

      expect(result.current.service?.onDetectionEvent).toBeDefined();
    });
  });

  describe('Monitoring Control', () => {
    it('should start monitoring successfully', async () => {
      const { result } = renderHook(() => useEnhancedMonitoring(mockOptions));

      await act(async () => {
        await result.current.startMonitoring();
      });

      expect(result.current.service?.startMonitoring).toHaveBeenCalledWith(
        'session-123',
        'candidate-456'
      );
      expect(result.current.isMonitoring).toBe(true);
      expect(result.current.error).toBeNull();
    });

    it('should handle start monitoring errors', async () => {
      const mockError = new Error('Microphone access denied');
      const { result } = renderHook(() => useEnhancedMonitoring(mockOptions));
      
      if (result.current.service) {
        result.current.service.startMonitoring = vi.fn().mockRejectedValue(mockError);
      }

      await act(async () => {
        try {
          await result.current.startMonitoring();
        } catch (error) {
          // Expected to throw
        }
      });

      expect(result.current.isMonitoring).toBe(false);
      expect(result.current.error).toBe('Microphone access denied');
    });

    it('should stop monitoring', async () => {
      const { result } = renderHook(() => useEnhancedMonitoring(mockOptions));

      // Start monitoring first
      await act(async () => {
        await result.current.startMonitoring();
      });

      // Stop monitoring
      act(() => {
        result.current.stopMonitoring();
      });

      expect(result.current.service?.stopMonitoring).toHaveBeenCalled();
      expect(result.current.isMonitoring).toBe(false);
    });
  });

  describe('Face Landmarks Processing', () => {
    it('should process face landmarks when monitoring is active', async () => {
      const { result } = renderHook(() => useEnhancedMonitoring(mockOptions));
      const mockLandmarks = createMockFaceLandmarks();

      // Start monitoring first
      await act(async () => {
        await result.current.startMonitoring();
      });

      await act(async () => {
        await result.current.processFaceLandmarks(mockLandmarks);
      });

      expect(result.current.service?.processFaceLandmarks).toHaveBeenCalledWith(
        mockLandmarks,
        'session-123',
        'candidate-456'
      );
    });

    it('should not process face landmarks when monitoring is inactive', async () => {
      const { result } = renderHook(() => useEnhancedMonitoring(mockOptions));
      const mockLandmarks = createMockFaceLandmarks();

      const processResult = await act(async () => {
        return await result.current.processFaceLandmarks(mockLandmarks);
      });

      expect(processResult).toBeNull();
      expect(result.current.service?.processFaceLandmarks).not.toHaveBeenCalled();
    });

    it('should handle face processing errors', async () => {
      const { result } = renderHook(() => useEnhancedMonitoring(mockOptions));
      const mockLandmarks = createMockFaceLandmarks();
      const mockError = new Error('Processing failed');

      // Start monitoring
      await act(async () => {
        await result.current.startMonitoring();
      });

      // Mock error in processing
      if (result.current.service) {
        result.current.service.processFaceLandmarks = vi.fn().mockRejectedValue(mockError);
      }

      await act(async () => {
        await result.current.processFaceLandmarks(mockLandmarks);
      });

      expect(result.current.error).toBe('Processing failed');
    });

    it('should return drowsiness events when detected', async () => {
      const mockEvent: DetectionEvent = {
        sessionId: 'session-123',
        candidateId: 'candidate-456',
        eventType: 'drowsiness',
        timestamp: new Date(),
        confidence: 0.8,
        metadata: { description: 'Drowsiness detected' }
      };

      const { result } = renderHook(() => useEnhancedMonitoring(mockOptions));

      // Start monitoring
      await act(async () => {
        await result.current.startMonitoring();
      });

      // Mock service to return event
      if (result.current.service) {
        result.current.service.processFaceLandmarks = vi.fn().mockResolvedValue(mockEvent);
      }

      let processResult: DetectionEvent | null = null;
      await act(async () => {
        processResult = await result.current.processFaceLandmarks(createMockFaceLandmarks());
      });

      expect(processResult).toEqual(mockEvent);
    });
  });

  describe('Statistics and State Management', () => {
    it('should update stats periodically when monitoring', async () => {
      const { result } = renderHook(() => useEnhancedMonitoring(mockOptions));

      // Start monitoring
      await act(async () => {
        await result.current.startMonitoring();
      });

      // Fast forward time to trigger stats update
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(result.current.service?.getMonitoringStats).toHaveBeenCalled();
    });

    it('should not update stats when not monitoring', () => {
      const { result } = renderHook(() => useEnhancedMonitoring(mockOptions));

      // Fast forward time
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      // Should not call getMonitoringStats since not monitoring
      expect(result.current.service?.getMonitoringStats).toHaveBeenCalledTimes(1); // Only initial call
    });

    it('should get current stats', () => {
      const { result } = renderHook(() => useEnhancedMonitoring(mockOptions));

      const stats = result.current.getStats();
      expect(stats).toBeDefined();
      expect(stats.drowsiness).toBeDefined();
      expect(stats.audio).toBeDefined();
    });

    it('should reset monitoring state', () => {
      const { result } = renderHook(() => useEnhancedMonitoring(mockOptions));

      act(() => {
        result.current.reset();
      });

      expect(result.current.service?.reset).toHaveBeenCalled();
    });

    it('should clear errors', async () => {
      const { result } = renderHook(() => useEnhancedMonitoring(mockOptions));

      // Create an error
      if (result.current.service) {
        result.current.service.startMonitoring = vi.fn().mockRejectedValue(new Error('Test error'));
      }

      await act(async () => {
        try {
          await result.current.startMonitoring();
        } catch (error) {
          // Expected
        }
      });

      expect(result.current.error).toBeDefined();

      // Clear error
      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('Event Handling', () => {
    it('should call onDetectionEvent when events are received', () => {
      const onDetectionEvent = vi.fn();
      const { result } = renderHook(() => 
        useEnhancedMonitoring({ ...mockOptions, onDetectionEvent })
      );

      const mockEvent: DetectionEvent = {
        sessionId: 'session-123',
        candidateId: 'candidate-456',
        eventType: 'drowsiness',
        timestamp: new Date(),
        confidence: 0.8,
        metadata: {}
      };

      // Simulate event from service
      if (result.current.service?.onDetectionEvent) {
        result.current.service.onDetectionEvent(mockEvent);
      }

      expect(onDetectionEvent).toHaveBeenCalledWith(mockEvent);
    });

    it('should handle missing onDetectionEvent gracefully', () => {
      const { result } = renderHook(() => 
        useEnhancedMonitoring({ 
          sessionId: mockOptions.sessionId,
          candidateId: mockOptions.candidateId 
        })
      );

      const mockEvent: DetectionEvent = {
        sessionId: 'session-123',
        candidateId: 'candidate-456',
        eventType: 'background-voice',
        timestamp: new Date(),
        confidence: 0.9,
        metadata: {}
      };

      // Should not throw error
      expect(() => {
        if (result.current.service?.onDetectionEvent) {
          result.current.service.onDetectionEvent(mockEvent);
        }
      }).not.toThrow();
    });
  });

  describe('Cleanup', () => {
    it('should stop monitoring on unmount', () => {
      const { result, unmount } = renderHook(() => useEnhancedMonitoring(mockOptions));

      unmount();

      expect(result.current.service?.stopMonitoring).toHaveBeenCalled();
    });

    it('should clear interval on unmount', () => {
      const { unmount } = renderHook(() => useEnhancedMonitoring(mockOptions));
      
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      
      unmount();
      
      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });
});
