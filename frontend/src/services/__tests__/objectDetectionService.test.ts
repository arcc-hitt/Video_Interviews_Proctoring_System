import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DetectedObject, UnauthorizedItem } from '../../types';

// Mock TensorFlow.js completely
vi.mock('@tensorflow/tfjs', () => ({
  ready: vi.fn().mockResolvedValue(undefined),
  loadGraphModel: vi.fn().mockResolvedValue({
    executeAsync: vi.fn().mockResolvedValue([
      { data: vi.fn().mockResolvedValue(new Float32Array([0.1, 0.2, 0.8, 0.9])), dispose: vi.fn() },
      { data: vi.fn().mockResolvedValue(new Float32Array([77])), dispose: vi.fn() },
      { data: vi.fn().mockResolvedValue(new Float32Array([0.85])), dispose: vi.fn() },
      { data: vi.fn().mockResolvedValue(new Float32Array([1])), dispose: vi.fn() }
    ]),
    dispose: vi.fn()
  }),
  browser: {
    fromPixels: vi.fn().mockReturnValue({
      dispose: vi.fn(),
      resizeNearestNeighbor: vi.fn().mockReturnThis(),
      cast: vi.fn().mockReturnThis(),
      expandDims: vi.fn().mockReturnThis()
    })
  }
}));

vi.mock('@tensorflow/tfjs-backend-webgl', () => ({}));

// Mock ImageData for test environment
global.ImageData = class ImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }
} as any;

// Import after mocking
const { TensorFlowObjectDetectionService } = await import('../objectDetectionService');

describe('TensorFlowObjectDetectionService', () => {
  let service: InstanceType<typeof TensorFlowObjectDetectionService>;
  let mockUnauthorizedItemHandler: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockUnauthorizedItemHandler = vi.fn();

    service = new TensorFlowObjectDetectionService();
    service.onUnauthorizedItemDetected = mockUnauthorizedItemHandler;
    
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(() => {
    service.cleanup();
  });

  describe('classifyUnauthorizedItems', () => {
    it('should classify phone as unauthorized item', () => {
      const detectedObjects: DetectedObject[] = [{
        class: 'cell phone',
        confidence: 0.85,
        boundingBox: { x: 100, y: 100, width: 50, height: 80 },
        timestamp: new Date()
      }];

      const result = service.classifyUnauthorizedItems(detectedObjects);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: 'phone',
        confidence: 0.85,
        position: { x: 100, y: 100, width: 50, height: 80 },
        firstDetected: expect.any(Date),
        lastSeen: expect.any(Date),
        persistenceDuration: expect.any(Number)
      });
    });

    it('should classify book as unauthorized item', () => {
      const detectedObjects: DetectedObject[] = [{
        class: 'book',
        confidence: 0.75,
        boundingBox: { x: 200, y: 150, width: 100, height: 120 },
        timestamp: new Date()
      }];

      const result = service.classifyUnauthorizedItems(detectedObjects);
      
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('book');
    });

    it('should classify laptop as unauthorized item', () => {
      const detectedObjects: DetectedObject[] = [{
        class: 'laptop',
        confidence: 0.90,
        boundingBox: { x: 50, y: 200, width: 200, height: 150 },
        timestamp: new Date()
      }];

      const result = service.classifyUnauthorizedItems(detectedObjects);
      
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('laptop');
    });

    it('should classify electronic devices as unauthorized items', () => {
      const detectedObjects: DetectedObject[] = [
        {
          class: 'keyboard',
          confidence: 0.80,
          boundingBox: { x: 100, y: 100, width: 150, height: 50 },
          timestamp: new Date()
        },
        {
          class: 'mouse',
          confidence: 0.70,
          boundingBox: { x: 300, y: 120, width: 30, height: 50 },
          timestamp: new Date()
        }
      ];

      const result = service.classifyUnauthorizedItems(detectedObjects);
      
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('electronic-device');
      expect(result[1].type).toBe('electronic-device');
    });

    it('should ignore authorized objects', () => {
      const detectedObjects: DetectedObject[] = [
        {
          class: 'person',
          confidence: 0.95,
          boundingBox: { x: 0, y: 0, width: 300, height: 400 },
          timestamp: new Date()
        },
        {
          class: 'chair',
          confidence: 0.80,
          boundingBox: { x: 400, y: 300, width: 100, height: 150 },
          timestamp: new Date()
        }
      ];

      const result = service.classifyUnauthorizedItems(detectedObjects);
      
      expect(result).toHaveLength(0);
    });

    it('should filter out low confidence unauthorized items', () => {
      const detectedObjects: DetectedObject[] = [{
        class: 'cell phone',
        confidence: 0.3, // Below threshold
        boundingBox: { x: 100, y: 100, width: 50, height: 80 },
        timestamp: new Date()
      }];

      const result = service.classifyUnauthorizedItems(detectedObjects);
      
      expect(result).toHaveLength(0);
    });

    it('should update existing unauthorized items', () => {
      const detectedObjects: DetectedObject[] = [{
        class: 'cell phone',
        confidence: 0.85,
        boundingBox: { x: 100, y: 100, width: 50, height: 80 },
        timestamp: new Date()
      }];

      // First detection
      const firstResult = service.classifyUnauthorizedItems(detectedObjects);
      expect(firstResult).toHaveLength(1);

      // Second detection with higher confidence
      detectedObjects[0].confidence = 0.95;
      const secondResult = service.classifyUnauthorizedItems(detectedObjects);
      
      expect(secondResult).toHaveLength(1);
      expect(secondResult[0].confidence).toBe(0.95);
      expect(secondResult[0].persistenceDuration).toBeGreaterThan(0);
    });
  });

  describe('trackObjectPresence', () => {
    it('should track unauthorized item presence', () => {
      const item: UnauthorizedItem = {
        type: 'phone',
        confidence: 0.85,
        position: { x: 100, y: 100, width: 50, height: 80 },
        firstDetected: new Date(),
        lastSeen: new Date(),
        persistenceDuration: 1000
      };

      service.trackObjectPresence(item);
      
      const items = service.getUnauthorizedItems();
      expect(items).toHaveLength(1);
      expect(items[0]).toEqual(item);
    });
  });

  describe('clearExpiredItems', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should remove expired items', () => {
      const item: UnauthorizedItem = {
        type: 'phone',
        confidence: 0.85,
        position: { x: 100, y: 100, width: 50, height: 80 },
        firstDetected: new Date(),
        lastSeen: new Date(),
        persistenceDuration: 1000
      };

      service.trackObjectPresence(item);
      expect(service.getUnauthorizedItems()).toHaveLength(1);

      // Fast-forward time beyond expiry threshold
      vi.advanceTimersByTime(6000); // 6 seconds

      service.clearExpiredItems();
      expect(service.getUnauthorizedItems()).toHaveLength(0);
    });

    it('should keep non-expired items', () => {
      const item: UnauthorizedItem = {
        type: 'phone',
        confidence: 0.85,
        position: { x: 100, y: 100, width: 50, height: 80 },
        firstDetected: new Date(),
        lastSeen: new Date(),
        persistenceDuration: 1000
      };

      service.trackObjectPresence(item);
      expect(service.getUnauthorizedItems()).toHaveLength(1);

      // Fast-forward time but not beyond expiry threshold
      vi.advanceTimersByTime(3000); // 3 seconds

      service.clearExpiredItems();
      expect(service.getUnauthorizedItems()).toHaveLength(1);
    });
  });

  describe('integration scenarios', () => {
    it('should handle multiple unauthorized items of different types', () => {
      const detectedObjects: DetectedObject[] = [
        {
          class: 'cell phone',
          confidence: 0.85,
          boundingBox: { x: 100, y: 100, width: 50, height: 80 },
          timestamp: new Date()
        },
        {
          class: 'book',
          confidence: 0.75,
          boundingBox: { x: 200, y: 150, width: 100, height: 120 },
          timestamp: new Date()
        },
        {
          class: 'laptop',
          confidence: 0.90,
          boundingBox: { x: 50, y: 200, width: 200, height: 150 },
          timestamp: new Date()
        }
      ];

      const result = service.classifyUnauthorizedItems(detectedObjects);
      
      expect(result).toHaveLength(3);
      expect(result.map((item: UnauthorizedItem) => item.type)).toEqual(
        expect.arrayContaining(['phone', 'book', 'laptop'])
      );
    });

    it('should handle mixed authorized and unauthorized objects', () => {
      const detectedObjects: DetectedObject[] = [
        {
          class: 'person',
          confidence: 0.95,
          boundingBox: { x: 0, y: 0, width: 300, height: 400 },
          timestamp: new Date()
        },
        {
          class: 'cell phone',
          confidence: 0.85,
          boundingBox: { x: 100, y: 100, width: 50, height: 80 },
          timestamp: new Date()
        },
        {
          class: 'chair',
          confidence: 0.80,
          boundingBox: { x: 400, y: 300, width: 100, height: 150 },
          timestamp: new Date()
        }
      ];

      const result = service.classifyUnauthorizedItems(detectedObjects);
      
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('phone');
    });
  });
});