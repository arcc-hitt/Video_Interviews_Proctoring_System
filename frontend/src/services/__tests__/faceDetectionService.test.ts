import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MediaPipeFaceDetectionService } from '../faceDetectionService';
import type { FaceLandmarks } from '../../types';

// Mock MediaPipe modules
vi.mock('@mediapipe/face_mesh', () => ({
  FaceMesh: vi.fn().mockImplementation(() => ({
    setOptions: vi.fn(),
    onResults: vi.fn(),
    send: vi.fn()
  }))
}));

vi.mock('@mediapipe/camera_utils', () => ({
  Camera: vi.fn()
}));

describe('MediaPipeFaceDetectionService', () => {
  let service: MediaPipeFaceDetectionService;
  let mockFocusEventHandler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MediaPipeFaceDetectionService();
    mockFocusEventHandler = vi.fn();
    service.onFocusEvent = mockFocusEventHandler;
  });

  afterEach(() => {
    service.cleanup();
  });

  describe('trackGazeDirection', () => {
    it('should return default gaze direction for empty landmarks', () => {
      const result = service.trackGazeDirection([]);
      
      expect(result).toEqual({
        x: 0,
        y: 0,
        isLookingAtScreen: false,
        confidence: 0
      });
    });

    it('should calculate gaze direction from face landmarks', () => {
      // Mock face landmarks with key points
      const mockLandmarks: FaceLandmarks[] = new Array(468).fill(null).map((_, index) => {
        // Create mock landmarks with specific key points
        if (index === 1) return { x: 0.5, y: 0.5, z: 0 }; // nose tip
        if (index === 33) return { x: 0.3, y: 0.4, z: 0 }; // left eye outer
        if (index === 263) return { x: 0.7, y: 0.4, z: 0 }; // right eye outer
        if (index === 61) return { x: 0.4, y: 0.45, z: 0 }; // left eye center
        if (index === 291) return { x: 0.6, y: 0.45, z: 0 }; // right eye center
        return { x: 0.5, y: 0.5, z: 0 }; // default position
      });

      const result = service.trackGazeDirection(mockLandmarks);
      
      expect(result.x).toBeTypeOf('number');
      expect(result.y).toBeTypeOf('number');
      expect(result.isLookingAtScreen).toBeTypeOf('boolean');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should detect when looking at screen with centered gaze', () => {
      // Create landmarks where nose tip is very close to eye center (minimal gaze distance)
      const mockLandmarks: FaceLandmarks[] = new Array(468).fill(null).map((_, index) => {
        if (index === 1) return { x: 0.5, y: 0.45, z: 0 }; // nose tip very close to eye center
        if (index === 33) return { x: 0.3, y: 0.4, z: 0 }; // left eye outer
        if (index === 263) return { x: 0.7, y: 0.4, z: 0 }; // right eye outer
        if (index === 61) return { x: 0.4, y: 0.45, z: 0 }; // left eye center
        if (index === 291) return { x: 0.6, y: 0.45, z: 0 }; // right eye center
        return { x: 0.5, y: 0.5, z: 0 };
      });

      const result = service.trackGazeDirection(mockLandmarks);
      
      expect(result.isLookingAtScreen).toBe(true);
    });

    it('should detect when looking away with off-center gaze', () => {
      // Create landmarks where nose tip is significantly off-center
      const mockLandmarks: FaceLandmarks[] = new Array(468).fill(null).map((_, index) => {
        if (index === 1) return { x: 0.8, y: 0.3, z: 0 }; // nose tip off-center
        if (index === 33) return { x: 0.3, y: 0.4, z: 0 }; // left eye outer
        if (index === 263) return { x: 0.7, y: 0.4, z: 0 }; // right eye outer
        if (index === 61) return { x: 0.4, y: 0.45, z: 0 }; // left eye center
        if (index === 291) return { x: 0.6, y: 0.45, z: 0 }; // right eye center
        return { x: 0.5, y: 0.5, z: 0 };
      });

      const result = service.trackGazeDirection(mockLandmarks);
      
      expect(result.isLookingAtScreen).toBe(false);
    });
  });

  describe('checkFocusStatus', () => {
    it('should return focused status when single face is looking at screen', () => {
      const gazeDirection = {
        x: 0.1,
        y: 0.1,
        isLookingAtScreen: true,
        confidence: 0.9
      };

      const result = service.checkFocusStatus(gazeDirection, 1);
      
      expect(result.isFocused).toBe(true);
      expect(result.isPresent).toBe(true);
      expect(result.faceCount).toBe(1);
      expect(result.gazeDirection).toEqual(gazeDirection);
    });

    it('should return unfocused status when looking away', () => {
      const gazeDirection = {
        x: 0.8,
        y: 0.3,
        isLookingAtScreen: false,
        confidence: 0.8
      };

      const result = service.checkFocusStatus(gazeDirection, 1);
      
      expect(result.isFocused).toBe(false);
      expect(result.isPresent).toBe(true);
      expect(result.faceCount).toBe(1);
    });

    it('should return unfocused status when multiple faces detected', () => {
      const gazeDirection = {
        x: 0.1,
        y: 0.1,
        isLookingAtScreen: true,
        confidence: 0.9
      };

      const result = service.checkFocusStatus(gazeDirection, 2);
      
      expect(result.isFocused).toBe(false);
      expect(result.isPresent).toBe(true);
      expect(result.faceCount).toBe(2);
    });

    it('should return absent status when no faces detected', () => {
      const gazeDirection = {
        x: 0,
        y: 0,
        isLookingAtScreen: false,
        confidence: 0
      };

      const result = service.checkFocusStatus(gazeDirection, 0);
      
      expect(result.isFocused).toBe(false);
      expect(result.isPresent).toBe(false);
      expect(result.faceCount).toBe(0);
    });

    it('should emit multiple-faces event immediately when multiple faces detected', () => {
      const gazeDirection = {
        x: 0.1,
        y: 0.1,
        isLookingAtScreen: true,
        confidence: 0.9
      };

      service.checkFocusStatus(gazeDirection, 3);
      
      expect(mockFocusEventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'multiple-faces',
          metadata: expect.objectContaining({
            faceCount: 3
          })
        })
      );
    });
  });

  describe('timer management', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should start focus loss timer when looking away', () => {
      const gazeDirection = {
        x: 0.8,
        y: 0.3,
        isLookingAtScreen: false,
        confidence: 0.8
      };

      // First call to establish baseline
      service.checkFocusStatus(gazeDirection, 1);
      
      // Should not emit event immediately
      expect(mockFocusEventHandler).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'focus-loss' })
      );

      // Fast-forward 5 seconds
      vi.advanceTimersByTime(5000);

      // Should emit focus-loss event after 5 seconds
      expect(mockFocusEventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'focus-loss',
          duration: 5000
        })
      );
    });

    it('should start absence timer when no face detected', () => {
      const gazeDirection = {
        x: 0,
        y: 0,
        isLookingAtScreen: false,
        confidence: 0
      };

      // First call to establish baseline
      service.checkFocusStatus(gazeDirection, 0);
      
      // Should not emit event immediately
      expect(mockFocusEventHandler).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'absence' })
      );

      // Fast-forward 10 seconds
      vi.advanceTimersByTime(10000);

      // Should emit absence event after 10 seconds
      expect(mockFocusEventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'absence',
          duration: 10000
        })
      );
    });

    it('should cancel focus loss timer when focus is restored', () => {
      const lookingAwayGaze = {
        x: 0.8,
        y: 0.3,
        isLookingAtScreen: false,
        confidence: 0.8
      };

      const focusedGaze = {
        x: 0.1,
        y: 0.1,
        isLookingAtScreen: true,
        confidence: 0.9
      };

      // Start looking away
      service.checkFocusStatus(lookingAwayGaze, 1);
      
      // Fast-forward 3 seconds (less than 5 second threshold)
      vi.advanceTimersByTime(3000);

      // Restore focus
      service.checkFocusStatus(focusedGaze, 1);

      // Fast-forward past original threshold
      vi.advanceTimersByTime(3000);

      // Should emit focus-restored event but not focus-loss
      expect(mockFocusEventHandler).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'focus-restored' })
      );
      expect(mockFocusEventHandler).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'focus-loss' })
      );
    });

    it('should cancel absence timer when presence is restored', () => {
      const absentGaze = {
        x: 0,
        y: 0,
        isLookingAtScreen: false,
        confidence: 0
      };

      const presentGaze = {
        x: 0.1,
        y: 0.1,
        isLookingAtScreen: true,
        confidence: 0.9
      };

      // Start absent
      service.checkFocusStatus(absentGaze, 0);
      
      // Fast-forward 7 seconds (less than 10 second threshold)
      vi.advanceTimersByTime(7000);

      // Restore presence
      service.checkFocusStatus(presentGaze, 1);

      // Fast-forward past original threshold
      vi.advanceTimersByTime(5000);

      // Should emit presence-restored event but not absence
      expect(mockFocusEventHandler).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'presence-restored' })
      );
      expect(mockFocusEventHandler).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'absence' })
      );
    });
  });

  describe('cleanup', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should clear all timers on cleanup', () => {
      const gazeDirection = {
        x: 0.8,
        y: 0.3,
        isLookingAtScreen: false,
        confidence: 0.8
      };

      // Start timers
      service.checkFocusStatus(gazeDirection, 0); // Start both timers
      
      // Cleanup
      service.cleanup();

      // Timers should be cleared and not fire
      vi.advanceTimersByTime(15000);
      expect(mockFocusEventHandler).not.toHaveBeenCalled();
    });
  });
});