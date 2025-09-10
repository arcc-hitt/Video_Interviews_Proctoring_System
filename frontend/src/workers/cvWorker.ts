// Web Worker for computer vision processing
// This worker handles face detection and object detection to avoid blocking the main thread

import { FaceMesh } from '@mediapipe/face_mesh';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';

// Types for worker communication
interface WorkerMessage {
  type: 'PROCESS_FRAME' | 'INITIALIZE' | 'CLEANUP';
  data?: any;
  id?: string;
}

interface WorkerResponse {
  type: 'FRAME_PROCESSED' | 'INITIALIZED' | 'ERROR' | 'CLEANUP_COMPLETE';
  data?: any;
  id?: string;
  error?: string;
}

interface FaceDetectionResult {
  faces: Array<{
    landmarks: Array<{ x: number; y: number; z: number }>;
    boundingBox: { x: number; y: number; width: number; height: number };
    confidence: number;
  }>;
  landmarks: Array<{ x: number; y: number; z: number }>;
  confidence: number;
  timestamp: Date;
}

interface ObjectDetectionResult {
  objects: Array<{
    class: string;
    confidence: number;
    boundingBox: { x: number; y: number; width: number; height: number };
    timestamp: Date;
  }>;
  processingTime?: number;
}

interface ProcessedFrameResult {
  faceDetection?: FaceDetectionResult;
  objectDetection?: ObjectDetectionResult;
  processingTime: number;
}

class CVWorker {
  private faceMesh: FaceMesh | null = null;
  private objectModel: tf.GraphModel | null = null;
  private isInitialized = false;
  private classNames: string[] = [];

  async initialize(): Promise<void> {
    try {
      // Initialize TensorFlow.js
      await tf.ready();

      // Initialize MediaPipe FaceMesh
      this.faceMesh = new FaceMesh({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
        }
      });

      this.faceMesh.setOptions({
        maxNumFaces: 3,
        refineLandmarks: true,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5
      });

      // Initialize TensorFlow object detection model
      this.objectModel = await tf.loadGraphModel(
        'https://tfhub.dev/tensorflow/tfjs-model/ssd_mobilenet_v2/1/default/1',
        { fromTFHub: true }
      );

      // Initialize COCO class names
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
    } catch (error) {
      console.error('CV Worker initialization failed:', error);
      throw error;
    }
  }

  async processFrame(imageData: ImageData): Promise<ProcessedFrameResult> {
    if (!this.isInitialized || !this.faceMesh || !this.objectModel) {
      throw new Error('CV Worker not initialized');
    }

    const startTime = performance.now();
    const results: ProcessedFrameResult = { processingTime: 0 };

    try {
      // Process face detection and object detection in parallel
      const [faceResult, objectResult] = await Promise.all([
        this.processFaceDetection(imageData),
        this.processObjectDetection(imageData)
      ]);

      results.faceDetection = faceResult;
      results.objectDetection = objectResult;
      results.processingTime = performance.now() - startTime;

      return results;
    } catch (error) {
      console.error('Frame processing failed:', error);
      results.processingTime = performance.now() - startTime;
      throw error;
    }
  }

  private async processFaceDetection(imageData: ImageData): Promise<FaceDetectionResult> {
    if (!this.faceMesh) {
      throw new Error('Face detection not initialized');
    }

    return new Promise((resolve, reject) => {
      try {
        // Create canvas from ImageData
        const canvas = document.createElement('canvas');
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('Failed to create canvas context'));
          return;
        }

        ctx.putImageData(imageData, 0, 0);

        // Set up one-time result handler
        const handleResults = (results: any) => {
          this.faceMesh!.onResults(() => {}); // Clear the handler
          
          const faces: Array<{
            landmarks: Array<{ x: number; y: number; z: number }>;
            boundingBox: { x: number; y: number; width: number; height: number };
            confidence: number;
          }> = [];
          let allLandmarks: Array<{ x: number; y: number; z: number }> = [];
          let overallConfidence = 0;

          if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            results.multiFaceLandmarks.forEach((landmarks: any[]) => {
              const faceLandmarks: Array<{ x: number; y: number; z: number }> = landmarks.map(landmark => ({
                x: landmark.x,
                y: landmark.y,
                z: landmark.z || 0
              }));

              // Calculate bounding box
              const boundingBox = this.calculateBoundingBox(faceLandmarks);
              const confidence = this.estimateConfidence(faceLandmarks);

              faces.push({
                landmarks: faceLandmarks,
                boundingBox,
                confidence
              });

              allLandmarks = allLandmarks.concat(faceLandmarks);
              overallConfidence = Math.max(overallConfidence, confidence);
            });
          }

          resolve({
            faces,
            landmarks: allLandmarks,
            confidence: overallConfidence,
            timestamp: new Date()
          });
        };

        this.faceMesh!.onResults(handleResults);
        this.faceMesh!.send({ image: canvas });

      } catch (error) {
        reject(error);
      }
    });
  }

  private async processObjectDetection(imageData: ImageData): Promise<ObjectDetectionResult> {
    if (!this.objectModel) {
      throw new Error('Object detection not initialized');
    }

    try {
      // Convert ImageData to tensor
      const tensor = tf.browser.fromPixels(imageData)
        .resizeNearestNeighbor([300, 300])
        .cast('int32')
        .expandDims(0);

      // Run inference
      const predictions = await this.objectModel.executeAsync(tensor) as tf.Tensor[];
      
      // Process predictions
      const objects = await this.processPredictions(predictions, imageData.width, imageData.height);
      
      // Clean up tensors
      tensor.dispose();
      predictions.forEach(pred => pred.dispose());

      return {
        objects,
        processingTime: 0
      };
    } catch (error) {
      console.error('Object detection failed:', error);
      throw error;
    }
  }

  private async processPredictions(
    predictions: tf.Tensor[], 
    originalWidth: number, 
    originalHeight: number
  ): Promise<Array<{
    class: string;
    confidence: number;
    boundingBox: { x: number; y: number; width: number; height: number };
    timestamp: Date;
  }>> {
    const objects: Array<{
      class: string;
      confidence: number;
      boundingBox: { x: number; y: number; width: number; height: number };
      timestamp: Date;
    }> = [];

    // Extract prediction tensors
    const boxes = await predictions[0].data();
    const classes = await predictions[1].data();
    const scores = await predictions[2].data();
    const numDetections = await predictions[3].data();

    const numDet = Math.min(numDetections[0], 20);
    const CONFIDENCE_THRESHOLD = 0.5;

    for (let i = 0; i < numDet; i++) {
      const score = scores[i];
      
      if (score >= CONFIDENCE_THRESHOLD) {
        const classIndex = Math.floor(classes[i]);
        const className = this.classNames[classIndex] || 'unknown';

        // Extract bounding box coordinates
        const yMin = boxes[i * 4];
        const xMin = boxes[i * 4 + 1];
        const yMax = boxes[i * 4 + 2];
        const xMax = boxes[i * 4 + 3];

        // Convert to pixel coordinates
        const boundingBox = {
          x: xMin * originalWidth,
          y: yMin * originalHeight,
          width: (xMax - xMin) * originalWidth,
          height: (yMax - yMin) * originalHeight
        };

        objects.push({
          class: className,
          confidence: score,
          boundingBox,
          timestamp: new Date()
        });
      }
    }

    return objects;
  }

  private calculateBoundingBox(landmarks: Array<{ x: number; y: number; z: number }>): { x: number; y: number; width: number; height: number } {
    if (landmarks.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    let minX = landmarks[0].x;
    let maxX = landmarks[0].x;
    let minY = landmarks[0].y;
    let maxY = landmarks[0].y;

    landmarks.forEach(landmark => {
      minX = Math.min(minX, landmark.x);
      maxX = Math.max(maxX, landmark.x);
      minY = Math.min(minY, landmark.y);
      maxY = Math.max(maxY, landmark.y);
    });

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  private estimateConfidence(landmarks: Array<{ x: number; y: number; z: number }>): number {
    if (landmarks.length < 100) return 0.3;
    if (landmarks.length < 200) return 0.5;
    if (landmarks.length < 400) return 0.7;
    return 0.9;
  }

  cleanup(): void {
    if (this.faceMesh) {
      this.faceMesh = null;
    }
    
    if (this.objectModel) {
      this.objectModel.dispose();
      this.objectModel = null;
    }
    
    this.isInitialized = false;
  }
}

// Worker instance
const cvWorker = new CVWorker();

// Handle messages from main thread
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type, data, id } = event.data;

  try {
    switch (type) {
      case 'INITIALIZE':
        await cvWorker.initialize();
        self.postMessage({
          type: 'INITIALIZED',
          id,
          data: { success: true }
        } as WorkerResponse);
        break;

      case 'PROCESS_FRAME':
        const result = await cvWorker.processFrame(data.imageData);
        self.postMessage({
          type: 'FRAME_PROCESSED',
          id,
          data: result
        } as WorkerResponse);
        break;

      case 'CLEANUP':
        cvWorker.cleanup();
        self.postMessage({
          type: 'CLEANUP_COMPLETE',
          id,
          data: { success: true }
        } as WorkerResponse);
        break;

      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      id,
      error: error instanceof Error ? error.message : 'Unknown error'
    } as WorkerResponse);
  }
};
