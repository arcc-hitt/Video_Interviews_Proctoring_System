import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import type {
  DetectedObject,
  UnauthorizedItem,
  ObjectDetectionService
} from '../types';

// interface CocoDetection {
//   bbox: [number, number, number, number]; // [x, y, width, height]
//   class: string;
//   score: number;
// }

export class TensorFlowObjectDetectionService implements ObjectDetectionService {
  private model: cocoSsd.ObjectDetection | null = null;
  private isInitialized = false;
  private unauthorizedItems: Map<string, UnauthorizedItem> = new Map();
  
  // Configuration constants
  private readonly CONFIDENCE_THRESHOLD = 0.5;
  private readonly PERSISTENCE_THRESHOLD = 2000; // 2 seconds
  private readonly ITEM_EXPIRY_TIME = 5000; // 5 seconds without detection
  private readonly MAX_DETECTIONS = 20;

  // Mapping of COCO classes to unauthorized item types
  private readonly UNAUTHORIZED_CLASS_MAP: Record<string, UnauthorizedItem['type']> = {
    'cell phone': 'phone',
    'book': 'book',
    'laptop': 'laptop',
    'tablet': 'tablet',
    'keyboard': 'electronic-device',
    'mouse': 'electronic-device',
    'remote': 'electronic-device',
    'tv': 'electronic-device'
  };

  public onUnauthorizedItemDetected?: (item: UnauthorizedItem) => void;
  public onModelLoadError?: (error: string) => void;

  constructor() {
    // Initialize asynchronously to avoid blocking constructor
    this.initializeModel().catch(error => {
      console.error('Object detection initialization failed:', error);
      this.isInitialized = true; // Mark as initialized in fallback mode
    });
  }

  // Add public initialize method for explicit initialization
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;
    await this.initializeModel();
  }

  private async initializeModel(): Promise<void> {
    try {
      // Initialize TensorFlow.js backend
      await tf.ready();
      console.log('TensorFlow.js backend ready');
      
      console.log('Loading COCO-SSD model...');
      
      // Load COCO-SSD model with fallback handling
      try {
        this.model = await cocoSsd.load({
          base: 'lite_mobilenet_v2', // Use lighter model for better performance
        });
        console.log('COCO-SSD model loaded successfully');
      } catch (modelError) {
        console.warn('Failed to load COCO-SSD model, trying fallback:', modelError);
        
        // Try alternative model loading approach
        try {
          this.model = await cocoSsd.load();
          console.log('COCO-SSD fallback model loaded successfully');
        } catch (fallbackError) {
          console.error('All model loading attempts failed:', fallbackError);
          this.model = null;
          
          // Emit error notification
          const errorMessage = 'Object detection model failed to load. The system will continue with face detection only.';
          if (this.onModelLoadError) {
            this.onModelLoadError(errorMessage);
          }
        }
      }

      this.isInitialized = true;
      
      if (this.model) {
        console.log('Object detection model initialized successfully');
      } else {
        console.log('Object detection service initialized in fallback mode (no model available)');
      }
    } catch (error) {
      console.error('Failed to initialize object detection service:', error);
      // Don't throw error - allow service to work in fallback mode
      this.isInitialized = true;
      this.model = null;
      
      const errorMessage = 'Object detection initialization failed. The system will continue with face detection only.';
      if (this.onModelLoadError) {
        this.onModelLoadError(errorMessage);
      }
      console.log('Object detection service initialized in fallback mode due to error');
    }
  }

  public async detectObjects(imageData: ImageData): Promise<DetectedObject[]> {
    if (!this.isInitialized) {
      console.warn('Object detection service not initialized, returning empty result');
      return []; // Return empty array instead of throwing error
    }

    // If model failed to load, return empty array (fallback)
    if (!this.model) {
      console.warn('Object detection model not available, using fallback detection');
      return []; // Return empty array - system will work without object detection
    }

    try {
      // Create a canvas element from ImageData for COCO-SSD
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }

      canvas.width = imageData.width;
      canvas.height = imageData.height;
      ctx.putImageData(imageData, 0, 0);

      // Run detection using COCO-SSD
      const predictions = await this.model.detect(canvas);
      
      // Convert COCO-SSD predictions to our DetectedObject format
      const detectedObjects: DetectedObject[] = predictions
        .filter(prediction => prediction.score >= this.CONFIDENCE_THRESHOLD)
        .slice(0, this.MAX_DETECTIONS)
        .map(prediction => ({
          class: prediction.class,
          confidence: prediction.score,
          boundingBox: {
            x: prediction.bbox[0],
            y: prediction.bbox[1],
            width: prediction.bbox[2],
            height: prediction.bbox[3]
          },
          timestamp: new Date()
        }));

      return detectedObjects;
    } catch (error) {
      console.error('Object detection failed:', error);
      throw error;
    }
  }

  public classifyUnauthorizedItems(objects: DetectedObject[]): UnauthorizedItem[] {
    const unauthorizedItems: UnauthorizedItem[] = [];
    const currentTime = new Date();

    objects.forEach(obj => {
      const itemType = this.UNAUTHORIZED_CLASS_MAP[obj.class.toLowerCase()];
      
      if (itemType && obj.confidence >= this.CONFIDENCE_THRESHOLD) {
        const itemId = this.generateItemId(obj);
        const existingItem = this.unauthorizedItems.get(itemId);

        if (existingItem) {
          // Update existing item
          existingItem.lastSeen = currentTime;
          existingItem.persistenceDuration = currentTime.getTime() - existingItem.firstDetected.getTime();
          existingItem.confidence = Math.max(existingItem.confidence, obj.confidence);
          existingItem.position = obj.boundingBox;
          
          unauthorizedItems.push(existingItem);
        } else {
          // Create new unauthorized item
          const newItem: UnauthorizedItem = {
            type: itemType,
            confidence: obj.confidence,
            position: obj.boundingBox,
            firstDetected: currentTime,
            lastSeen: currentTime,
            persistenceDuration: 0
          };

          this.unauthorizedItems.set(itemId, newItem);
          unauthorizedItems.push(newItem);

          // Emit event for new item if it persists long enough
          if (newItem.persistenceDuration >= this.PERSISTENCE_THRESHOLD) {
            this.emitUnauthorizedItemEvent(newItem);
          }
        }
      }
    });

    // Clean up expired items
    this.clearExpiredItems();

    return unauthorizedItems;
  }

  public trackObjectPresence(item: UnauthorizedItem): void {
    const itemId = this.generateItemIdFromUnauthorized(item);
    this.unauthorizedItems.set(itemId, item);
  }

  public getUnauthorizedItems(): UnauthorizedItem[] {
    return Array.from(this.unauthorizedItems.values());
  }

  public clearExpiredItems(): void {
    const currentTime = new Date();
    const expiredItems: string[] = [];

    this.unauthorizedItems.forEach((item, itemId) => {
      const timeSinceLastSeen = currentTime.getTime() - item.lastSeen.getTime();
      
      if (timeSinceLastSeen > this.ITEM_EXPIRY_TIME) {
        expiredItems.push(itemId);
      }
    });

    expiredItems.forEach(itemId => {
      this.unauthorizedItems.delete(itemId);
    });
  }

  private generateItemId(obj: DetectedObject): string {
    // Generate a unique ID based on object class and approximate position
    const x = Math.floor(obj.boundingBox.x / 50) * 50; // Grid-based positioning
    const y = Math.floor(obj.boundingBox.y / 50) * 50;
    return `${obj.class}-${x}-${y}`;
  }

  private generateItemIdFromUnauthorized(item: UnauthorizedItem): string {
    const x = Math.floor(item.position.x / 50) * 50;
    const y = Math.floor(item.position.y / 50) * 50;
    return `${item.type}-${x}-${y}`;
  }

  private emitUnauthorizedItemEvent(item: UnauthorizedItem): void {
    if (this.onUnauthorizedItemDetected) {
      this.onUnauthorizedItemDetected(item);
    }
  }

  public cleanup(): void {
    this.unauthorizedItems.clear();
    
    if (this.model) {
      // COCO-SSD models don't need explicit disposal like GraphModels
      this.model = null;
    }
    
    this.isInitialized = false;
  }
}

export default TensorFlowObjectDetectionService;