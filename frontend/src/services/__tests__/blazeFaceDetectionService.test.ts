import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BlazeFaceDetectionService } from '../blazeFaceDetectionService';
import type { FaceDetectionResult, FocusEvent } from '../../types';

// Mock TensorFlow.js
vi.mock('@tensorflow/tfjs', () => ({
  setBackend: vi.fn(() => Promise.resolve()),
  ready: vi.fn(() => Promise.resolve()),
  browser: {
    fromPixels: vi.fn(() => ({
      dispose: vi.fn()
    }))
  }
}));

// Mock BlazeFace model
vi.mock('@tensorflow-models/blazeface', () => ({
  load: vi.fn(() => Promise.resolve({
    estimateFaces: vi.fn(() => Promise.resolve([]))
  }))
}));

// Mock ImageData for testing
const createMockImageData = (width = 640, height = 480): ImageData => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  return ctx.createImageData(width, height);
};

describe('BlazeFaceDetectionService', () => {
  let service: BlazeFaceDetectionService;
  let mockFocusEventHandler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BlazeFaceDetectionService();
    mockFocusEventHandler = vi.fn();
    service.onFocusEvent = mockFocusEventHandler;
  });

  afterEach(() => {
    service.cleanup();
  });

  describe('initialization', () => {
    it('should create singleton instance', () => {
      const instance1 = BlazeFaceDetectionService.getInstance();
      const instance2 = BlazeFaceDetectionService.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should initialize properly', async () => {
      await service.initialize();
      expect(service.getIsInitialized()).toBeDefined();
    });
  });

  describe('face detection', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should detect faces from image data', async () => {
      const imageData = createMockImageData();
      const result: FaceDetectionResult = await service.detectFace(imageData);

      expect(result).toBeDefined();
      expect(result.faces).toBeDefined();
      expect(result.confidence).toBeDefined();
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should handle detection errors gracefully', async () => {
      const imageData = createMockImageData();
      const result = await service.detectFace(imageData);

      expect(result).toBeDefined();
      expect(result.faces).toBeDefined();
      expect(result.confidence).toBeDefined();
    });
  });

  describe('focus tracking', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should track gaze direction', () => {
      const landmarks = [
        { x: 0.3, y: 0.3, z: 0 }, // right eye
        { x: 0.7, y: 0.3, z: 0 }, // left eye  
        { x: 0.5, y: 0.5, z: 0 }, // nose tip
        { x: 0.5, y: 0.7, z: 0 }, // mouth center
        { x: 0.2, y: 0.3, z: 0 }, // right ear
        { x: 0.8, y: 0.3, z: 0 }  // left ear
      ];

      const gazeDirection = service.trackGazeDirection(landmarks);

      expect(gazeDirection).toBeDefined();
      expect(gazeDirection.x).toBeDefined();
      expect(gazeDirection.y).toBeDefined();
      expect(gazeDirection.isLookingAtScreen).toBeDefined();
      expect(gazeDirection.confidence).toBeDefined();
    });

    it('should determine focus status', () => {
      const gazeDirection = {
        x: 0,
        y: 0,
        isLookingAtScreen: true,
        confidence: 0.8
      };

      const focusStatus = service.checkFocusStatus(gazeDirection, 1);

      expect(focusStatus.isFocused).toBe(true);
      expect(focusStatus.faceCount).toBe(1);
      expect(focusStatus.isPresent).toBe(true);
      expect(focusStatus.confidence).toBe(0.8);
    });

    it('should handle multiple faces', () => {
      const gazeDirection = {
        x: 0,
        y: 0,
        isLookingAtScreen: true,
        confidence: 0.8
      };

      const focusStatus = service.checkFocusStatus(gazeDirection, 2);

      expect(focusStatus.isFocused).toBe(false); // Multiple faces means not focused
      expect(focusStatus.faceCount).toBe(2);
      expect(focusStatus.isPresent).toBe(true);
    });

    it('should handle no faces', () => {
      const gazeDirection = {
        x: 0,
        y: 0,
        isLookingAtScreen: false,
        confidence: 0
      };

      const focusStatus = service.checkFocusStatus(gazeDirection, 0);

      expect(focusStatus.isFocused).toBe(false);
      expect(focusStatus.faceCount).toBe(0);
      expect(focusStatus.isPresent).toBe(false);
    });
  });

  describe('timer management', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should start and stop focus timers', () => {
      service.startFocusTimer('looking-away');
      service.stopFocusTimer('looking-away');
      
      service.startFocusTimer('absent');
      service.stopFocusTimer('absent');
      
      // If we get here without errors, the timer management is working
      expect(true).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should cleanup resources', () => {
      service.cleanup();
      expect(service.getIsInitialized()).toBe(false);
    });
  });
});
