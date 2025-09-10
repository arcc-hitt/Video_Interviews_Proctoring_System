import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import type {
  DetectedObject,
  UnauthorizedItem,
  ObjectDetectionService,
  BoundingBox
} from '../types';

// interface CocoDetection {
//   bbox: [number, number, number, number]; // [x, y, width, height]
//   class: string;
//   score: number;
// }

export class TensorFlowObjectDetectionService implements ObjectDetectionService {
  private model: tf.GraphModel | null = null;
  private isInitialized = false;
  private unauthorizedItems: Map<string, UnauthorizedItem> = new Map();
  private classNames: string[] = [];
  
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

  constructor() {
    this.initializeModel();
  }

  private async initializeModel(): Promise<void> {
    try {
      // Initialize TensorFlow.js backend
      await tf.ready();
      
      // Load pre-trained COCO-SSD model
      this.model = await tf.loadGraphModel('https://tfhub.dev/tensorflow/tfjs-model/ssd_mobilenet_v2/1/default/1', {
        fromTFHub: true
      });

      // Initialize COCO class names (simplified list of relevant classes)
      this.classNames = [
        'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat',
        'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat',
        'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack',
        'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball',
        'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket',
        'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
        'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair',
        'couch', 'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse',
        'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink', 'refrigerator',
        'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier', 'toothbrush'
      ];

      this.isInitialized = true;
      console.log('Object detection model initialized successfully');
    } catch (error) {
      console.error('Failed to initialize object detection model:', error);
      throw new Error('Object detection service initialization failed');
    }
  }

  public async detectObjects(imageData: ImageData): Promise<DetectedObject[]> {
    if (!this.isInitialized || !this.model) {
      throw new Error('Object detection service not initialized');
    }

    try {
      // Convert ImageData to tensor
      const tensor = this.imageDataToTensor(imageData);
      
      // Run inference
      const predictions = await this.model.executeAsync(tensor) as tf.Tensor[];
      
      // Process predictions
      const detectedObjects = await this.processPredictions(predictions, imageData.width, imageData.height);
      
      // Clean up tensors
      tensor.dispose();
      predictions.forEach(pred => pred.dispose());

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

  private imageDataToTensor(imageData: ImageData): tf.Tensor {
    // Convert ImageData to tensor format expected by the model
    const tensor = tf.browser.fromPixels(imageData)
      .resizeNearestNeighbor([300, 300]) // MobileNet SSD expects 300x300 input
      .cast('int32')
      .expandDims(0);
    
    return tensor;
  }

  private async processPredictions(
    predictions: tf.Tensor[], 
    originalWidth: number, 
    originalHeight: number
  ): Promise<DetectedObject[]> {
    const detectedObjects: DetectedObject[] = [];

    // Extract prediction tensors
    const boxes = await predictions[0].data(); // [1, N, 4] - bounding boxes
    const classes = await predictions[1].data(); // [1, N] - class indices
    const scores = await predictions[2].data(); // [1, N] - confidence scores
    const numDetections = await predictions[3].data(); // [1] - number of detections

    const numDet = Math.min(numDetections[0], this.MAX_DETECTIONS);

    for (let i = 0; i < numDet; i++) {
      const score = scores[i];
      
      if (score >= this.CONFIDENCE_THRESHOLD) {
        const classIndex = Math.floor(classes[i]);
        const className = this.classNames[classIndex] || 'unknown';

        // Extract bounding box coordinates (normalized to [0, 1])
        const yMin = boxes[i * 4];
        const xMin = boxes[i * 4 + 1];
        const yMax = boxes[i * 4 + 2];
        const xMax = boxes[i * 4 + 3];

        // Convert to pixel coordinates
        const boundingBox: BoundingBox = {
          x: xMin * originalWidth,
          y: yMin * originalHeight,
          width: (xMax - xMin) * originalWidth,
          height: (yMax - yMin) * originalHeight
        };

        detectedObjects.push({
          class: className,
          confidence: score,
          boundingBox,
          timestamp: new Date()
        });
      }
    }

    return detectedObjects;
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
      this.model.dispose();
      this.model = null;
    }
    
    this.isInitialized = false;
  }
}

export default TensorFlowObjectDetectionService;