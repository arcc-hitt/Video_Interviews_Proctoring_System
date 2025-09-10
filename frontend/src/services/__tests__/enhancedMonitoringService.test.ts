import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EnhancedMonitoringService } from '../enhancedMonitoringService';
import type { FaceLandmarks, DetectionEvent } from '../../types';

// Mock the services
vi.mock('../drowsinessDetectionService', () => ({
  DrowsinessDetectionService: vi.fn().mockImplementation(() => ({
    onDrowsinessEvent: null,
    processFaceLandmarks: vi.fn().mockResolvedValue(null),
    getAnalysisStats: vi.fn().mockReturnValue({
      totalBlinks: 0,
      avgBlinkRate: 0,
      avgDrowsinessScore: 0
    }),
    reset: vi.fn()
  }))
}));

vi.mock('../audioDetectionService', () => ({
  AudioDetectionService: vi.fn().mockImplementation(() => ({
    onAudioEvent: null,
    startMonitoring: vi.fn().mockResolvedValue(undefined),
    stopMonitoring: vi.fn(),
    setSessionInfo: vi.fn(),
    getAnalysisStats: vi.fn().mockReturnValue({
      isMonitoring: false,
      baselineNoiseLevel: 0,
      totalSpeechSegments: 0,
      avgVolume: 0
    }),
    reset: vi.fn()
  }))
}));

const createMockFaceLandmarks = (): FaceLandmarks[] => {
  const landmarks: FaceLandmarks[] = [];
  for (let i = 0; i < 468; i++) {
    landmarks.push({
      x: Math.random(),
      y: Math.random(),
      z: Math.random()
    });
  }
  return landmarks;
};

describe('EnhancedMonitoringService', () => {
  let service: EnhancedMonitoringService;
  let mockEventHandler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new EnhancedMonitoringService();
    mockEventHandler = vi.fn();
    service.onDetectionEvent = mockEventHandler;
  });

  describe('Initialization', () => {
    it('should initialize with drowsiness and audio services', () => {
      expect(service.drowsinessDetection).toBeDefined();
      expect(service.audioDetection).toBeDefined();
      expect(service.isMonitoring).toBe(false);
    });

    it('should set up event handlers for both services', () => {
      expect(service.drowsinessDetection.onDrowsinessEvent).toBeDefined();
      expect(service.audioDetection.onAudioEvent).toBeDefined();
    });
  });

  describe('Monitoring Control', () => {
    it('should start monitoring successfully', async () => {
      await service.startMonitoring('session123', 'candidate456');

      expect(service.audioDetection.setSessionInfo).toHaveBeenCalledWith('session123', 'candidate456');
      expect(service.audioDetection.startMonitoring).toHaveBeenCalled();
      expect(service.isMonitoring).toBe(true);
    });

    it('should handle start monitoring errors', async () => {
      const mockError = new Error('Audio initialization failed');
      service.audioDetection.startMonitoring = vi.fn().mockRejectedValue(mockError);

      await expect(service.startMonitoring('session123', 'candidate456')).rejects.toThrow(mockError);
      expect(service.isMonitoring).toBe(false);
    });

    it('should stop monitoring properly', async () => {
      await service.startMonitoring('session123', 'candidate456');
      service.stopMonitoring();

      expect(service.audioDetection.stopMonitoring).toHaveBeenCalled();
      expect(service.isMonitoring).toBe(false);
    });
  });

  describe('Face Landmarks Processing', () => {
    beforeEach(async () => {
      await service.startMonitoring('session123', 'candidate456');
    });

    it('should process face landmarks when monitoring is active', async () => {
      const mockLandmarks = createMockFaceLandmarks();
      
      await service.processFaceLandmarks(mockLandmarks, 'session123', 'candidate456');

      expect(service.drowsinessDetection.processFaceLandmarks).toHaveBeenCalledWith(
        mockLandmarks,
        'session123',
        'candidate456'
      );
    });

    it('should not process face landmarks when monitoring is inactive', async () => {
      service.stopMonitoring();
      const mockLandmarks = createMockFaceLandmarks();
      
      const result = await service.processFaceLandmarks(mockLandmarks, 'session123', 'candidate456');

      expect(result).toBeNull();
      expect(service.drowsinessDetection.processFaceLandmarks).not.toHaveBeenCalled();
    });

    it('should return drowsiness events when detected', async () => {
      const mockEvent = {
        sessionId: 'session123',
        candidateId: 'candidate456',
        eventType: 'drowsiness' as const,
        timestamp: new Date(),
        confidence: 0.8,
        metadata: { description: 'Drowsiness detected' },
        eyeMetrics: {
          leftEyeAR: 0.2,
          rightEyeAR: 0.2,
          averageEyeAR: 0.2,
          isEyesClosed: true,
          blinkDuration: 400
        },
        drowsinessMetrics: {
          blinkRate: 20,
          averageBlinkDuration: 350,
          longBlinkCount: 3,
          drowsinessScore: 0.7,
          isAwake: false
        }
      };

      service.drowsinessDetection.processFaceLandmarks = vi.fn().mockResolvedValue(mockEvent);

      const result = await service.processFaceLandmarks(
        createMockFaceLandmarks(),
        'session123',
        'candidate456'
      );

      expect(result).toEqual(mockEvent);
    });
  });

  describe('Event Handling', () => {
    it('should handle drowsiness events', async () => {
      const mockDrowsinessEvent = {
        sessionId: 'session123',
        candidateId: 'candidate456',
        eventType: 'drowsiness' as const,
        timestamp: new Date(),
        confidence: 0.8,
        metadata: { description: 'Drowsiness detected' },
        eyeMetrics: {
          leftEyeAR: 0.2,
          rightEyeAR: 0.2,
          averageEyeAR: 0.2,
          isEyesClosed: true,
          blinkDuration: 400
        },
        drowsinessMetrics: {
          blinkRate: 20,
          averageBlinkDuration: 350,
          longBlinkCount: 3,
          drowsinessScore: 0.7,
          isAwake: false
        }
      };

      // Simulate drowsiness event
      service.drowsinessDetection.onDrowsinessEvent!(mockDrowsinessEvent);

      expect(mockEventHandler).toHaveBeenCalledWith(mockDrowsinessEvent);
    });

    it('should handle audio events', () => {
      const mockAudioEvent = {
        sessionId: 'session123',
        candidateId: 'candidate456',
        eventType: 'background-voice' as const,
        timestamp: new Date(),
        confidence: 0.9,
        metadata: { description: 'Background voice detected' },
        audioMetrics: {
          volume: 0.7,
          frequency: 150,
          voiceActivityProbability: 0.8,
          backgroundNoiseLevel: 0.3,
          speechSegments: []
        }
      };

      // Simulate audio event
      service.audioDetection.onAudioEvent!(mockAudioEvent);

      expect(mockEventHandler).toHaveBeenCalledWith(mockAudioEvent);
    });

    it('should not trigger events when no handler is set', () => {
      service.onDetectionEvent = undefined;

      const mockEvent: DetectionEvent = {
        sessionId: 'session123',
        candidateId: 'candidate456',
        eventType: 'drowsiness',
        timestamp: new Date(),
        confidence: 0.8,
        metadata: {}
      };

      // Should not throw error
      expect(() => {
        service.drowsinessDetection.onDrowsinessEvent!(mockEvent as any);
      }).not.toThrow();
    });
  });

  describe('Statistics and State Management', () => {
    it('should provide comprehensive monitoring statistics', () => {
      const stats = service.getMonitoringStats();

      expect(stats).toHaveProperty('drowsiness');
      expect(stats).toHaveProperty('audio');
      
      expect(stats.drowsiness).toHaveProperty('totalBlinks');
      expect(stats.drowsiness).toHaveProperty('avgBlinkRate');
      expect(stats.drowsiness).toHaveProperty('avgDrowsinessScore');
      
      expect(stats.audio).toHaveProperty('isMonitoring');
      expect(stats.audio).toHaveProperty('baselineNoiseLevel');
      expect(stats.audio).toHaveProperty('totalSpeechSegments');
      expect(stats.audio).toHaveProperty('avgVolume');
    });

    it('should reset both services when reset is called', () => {
      service.reset();

      expect(service.drowsinessDetection.reset).toHaveBeenCalled();
      expect(service.audioDetection.reset).toHaveBeenCalled();
    });

    it('should provide access to individual services', () => {
      expect(service.drowsinessDetection).toBeDefined();
      expect(service.audioDetection).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle drowsiness processing errors gracefully', async () => {
      service.drowsinessDetection.processFaceLandmarks = vi.fn().mockRejectedValue(
        new Error('Processing failed')
      );

      await service.startMonitoring('session123', 'candidate456');

      await expect(
        service.processFaceLandmarks(createMockFaceLandmarks(), 'session123', 'candidate456')
      ).rejects.toThrow('Processing failed');
    });

    it('should handle audio service errors during startup', async () => {
      const mockError = new Error('Microphone access denied');
      service.audioDetection.startMonitoring = vi.fn().mockRejectedValue(mockError);

      await expect(service.startMonitoring('session123', 'candidate456')).rejects.toThrow(mockError);
    });
  });

  describe('Integration', () => {
    it('should coordinate both services effectively', async () => {
      await service.startMonitoring('session123', 'candidate456');

      // Verify audio service setup
      expect(service.audioDetection.setSessionInfo).toHaveBeenCalledWith('session123', 'candidate456');
      expect(service.audioDetection.startMonitoring).toHaveBeenCalled();

      // Process face landmarks
      const landmarks = createMockFaceLandmarks();
      await service.processFaceLandmarks(landmarks, 'session123', 'candidate456');

      expect(service.drowsinessDetection.processFaceLandmarks).toHaveBeenCalledWith(
        landmarks,
        'session123',
        'candidate456'
      );

      // Stop monitoring
      service.stopMonitoring();
      expect(service.audioDetection.stopMonitoring).toHaveBeenCalled();
      expect(service.isMonitoring).toBe(false);
    });
  });
});
