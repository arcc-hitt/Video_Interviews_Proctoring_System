import { FaceMesh } from '@mediapipe/face_mesh';
// Camera import removed as it's not used in this implementation
import type {
  FaceDetectionResult,
  FaceLandmarks,
  Face,
  GazeDirection,
  FocusStatus,
  FocusEvent,
  FocusDetectionService,
  BoundingBox
} from '../types';

interface TimerState {
  timerId: number | null;
  startTime: Date | null;
  isActive: boolean;
}

export class MediaPipeFaceDetectionService implements FocusDetectionService {
  private faceMesh: FaceMesh | null = null;
  private isInitialized = false;
  private focusLossTimer: TimerState = { timerId: null, startTime: null, isActive: false };
  private absenceTimer: TimerState = { timerId: null, startTime: null, isActive: false };
  private lastFocusStatus: FocusStatus | null = null;
  
  // Configuration constants
  private readonly FOCUS_LOSS_THRESHOLD = 5000; // 5 seconds
  private readonly ABSENCE_THRESHOLD = 10000; // 10 seconds
  private readonly GAZE_THRESHOLD = 0.3; // Threshold for determining if looking at screen
  private readonly MIN_CONFIDENCE = 0.7; // Minimum confidence for face detection

  public onFocusEvent?: (event: FocusEvent) => void;

  constructor() {
    this.initializeFaceMesh();
  }

  private async initializeFaceMesh(): Promise<void> {
    try {
      this.faceMesh = new FaceMesh({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
        }
      });

      this.faceMesh.setOptions({
        maxNumFaces: 3, // Detect up to 3 faces to catch multiple people
        refineLandmarks: true,
        minDetectionConfidence: this.MIN_CONFIDENCE,
        minTrackingConfidence: 0.5
      });

      this.faceMesh.onResults((_results) => {
        // Results will be processed in detectFace method
      });

      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize MediaPipe FaceMesh:', error);
      throw new Error('Face detection service initialization failed');
    }
  }

  public async detectFace(imageData: ImageData): Promise<FaceDetectionResult> {
    if (!this.isInitialized || !this.faceMesh) {
      throw new Error('Face detection service not initialized');
    }

    return new Promise((resolve, reject) => {
      try {
        // Create canvas from ImageData for MediaPipe processing
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
          
          const faces: Face[] = [];
          let allLandmarks: FaceLandmarks[] = [];
          let overallConfidence = 0;

          if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            results.multiFaceLandmarks.forEach((landmarks: any[]) => {
              const faceLandmarks: FaceLandmarks[] = landmarks.map(landmark => ({
                x: landmark.x,
                y: landmark.y,
                z: landmark.z || 0
              }));

              // Calculate bounding box from landmarks
              const boundingBox = this.calculateBoundingBox(faceLandmarks);
              
              // Estimate confidence (MediaPipe doesn't provide per-face confidence)
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

  public trackGazeDirection(landmarks: FaceLandmarks[]): GazeDirection {
    if (landmarks.length === 0) {
      return {
        x: 0,
        y: 0,
        isLookingAtScreen: false,
        confidence: 0
      };
    }

    // Use key facial landmarks for gaze estimation
    // MediaPipe face mesh landmark indices:
    // 1: nose tip, 33: left eye outer corner, 263: right eye outer corner
    // 61: left eye center, 291: right eye center
    const noseTip = landmarks[1] || landmarks[0];
    // const leftEye = landmarks[33] || landmarks[0];
    // const rightEye = landmarks[263] || landmarks[0];
    const leftEyeCenter = landmarks[61] || landmarks[0];
    const rightEyeCenter = landmarks[291] || landmarks[0];

    // Calculate eye center
    const eyeCenterX = (leftEyeCenter.x + rightEyeCenter.x) / 2;
    const eyeCenterY = (leftEyeCenter.y + rightEyeCenter.y) / 2;

    // Calculate gaze direction based on nose tip relative to eye center
    const gazeX = noseTip.x - eyeCenterX;
    const gazeY = noseTip.y - eyeCenterY;

    // Normalize gaze direction
    const magnitude = Math.sqrt(gazeX * gazeX + gazeY * gazeY);
    const normalizedGazeX = magnitude > 0 ? gazeX / magnitude : 0;
    const normalizedGazeY = magnitude > 0 ? gazeY / magnitude : 0;

    // Determine if looking at screen (within threshold)
    const gazeDistance = Math.sqrt(normalizedGazeX * normalizedGazeX + normalizedGazeY * normalizedGazeY);
    const isLookingAtScreen = gazeDistance < this.GAZE_THRESHOLD;

    // Calculate confidence based on landmark quality
    const confidence = this.calculateGazeConfidence(landmarks);

    return {
      x: normalizedGazeX,
      y: normalizedGazeY,
      isLookingAtScreen,
      confidence
    };
  }

  public checkFocusStatus(gazeDirection: GazeDirection, faceCount: number): FocusStatus {
    const isPresent = faceCount > 0;
    const isFocused = isPresent && faceCount === 1 && gazeDirection.isLookingAtScreen;

    const focusStatus: FocusStatus = {
      isFocused,
      gazeDirection,
      faceCount,
      isPresent,
      confidence: gazeDirection.confidence
    };

    // Handle focus state changes and timers
    this.handleFocusStateChange(focusStatus);

    return focusStatus;
  }

  private handleFocusStateChange(currentStatus: FocusStatus): void {
    const previousStatus = this.lastFocusStatus;

    // Handle absence detection
    if (!currentStatus.isPresent) {
      if (!this.absenceTimer.isActive) {
        this.startFocusTimer('absent');
      }
    } else {
      if (this.absenceTimer.isActive) {
        this.stopFocusTimer('absent');
        if (previousStatus && !previousStatus.isPresent) {
          this.emitFocusEvent({
            type: 'presence-restored',
            timestamp: new Date(),
            confidence: currentStatus.confidence,
            metadata: {
              faceCount: currentStatus.faceCount,
              gazeDirection: currentStatus.gazeDirection
            }
          });
        }
      }
    }

    // Handle focus loss detection (only when present)
    if (currentStatus.isPresent) {
      if (!currentStatus.isFocused) {
        if (!this.focusLossTimer.isActive) {
          this.startFocusTimer('looking-away');
        }
      } else {
        if (this.focusLossTimer.isActive) {
          this.stopFocusTimer('looking-away');
          if (previousStatus && !previousStatus.isFocused) {
            this.emitFocusEvent({
              type: 'focus-restored',
              timestamp: new Date(),
              confidence: currentStatus.confidence,
              metadata: {
                faceCount: currentStatus.faceCount,
                gazeDirection: currentStatus.gazeDirection
              }
            });
          }
        }
      }
    }

    // Handle multiple faces
    if (currentStatus.faceCount > 1) {
      this.emitFocusEvent({
        type: 'multiple-faces',
        timestamp: new Date(),
        confidence: currentStatus.confidence,
        metadata: {
          faceCount: currentStatus.faceCount,
          gazeDirection: currentStatus.gazeDirection
        }
      });
    }

    this.lastFocusStatus = currentStatus;
  }

  public startFocusTimer(eventType: 'looking-away' | 'absent'): void {
    const timer = eventType === 'looking-away' ? this.focusLossTimer : this.absenceTimer;
    const threshold = eventType === 'looking-away' ? this.FOCUS_LOSS_THRESHOLD : this.ABSENCE_THRESHOLD;

    if (timer.isActive) return;

    timer.startTime = new Date();
    timer.isActive = true;
    timer.timerId = setTimeout(() => {
      const duration = timer.startTime ? Date.now() - timer.startTime.getTime() : 0;
      
      this.emitFocusEvent({
        type: eventType === 'looking-away' ? 'focus-loss' : 'absence',
        timestamp: timer.startTime || new Date(),
        duration,
        confidence: this.lastFocusStatus?.confidence || 0,
        metadata: {
          faceCount: this.lastFocusStatus?.faceCount || 0,
          gazeDirection: this.lastFocusStatus?.gazeDirection
        }
      });

      timer.isActive = false;
      timer.timerId = null;
      timer.startTime = null;
    }, threshold) as unknown as number;
  }

  public stopFocusTimer(eventType: 'looking-away' | 'absent'): void {
    const timer = eventType === 'looking-away' ? this.focusLossTimer : this.absenceTimer;

    if (timer.timerId) {
      clearTimeout(timer.timerId);
      timer.timerId = null;
    }
    
    timer.isActive = false;
    timer.startTime = null;
  }

  private emitFocusEvent(event: FocusEvent): void {
    if (this.onFocusEvent) {
      this.onFocusEvent(event);
    }
  }

  private calculateBoundingBox(landmarks: FaceLandmarks[]): BoundingBox {
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

  private estimateConfidence(landmarks: FaceLandmarks[]): number {
    // Estimate confidence based on landmark consistency and completeness
    if (landmarks.length < 100) return 0.3; // MediaPipe face mesh should have 468 landmarks
    if (landmarks.length < 200) return 0.5;
    if (landmarks.length < 400) return 0.7;
    return 0.9;
  }

  private calculateGazeConfidence(landmarks: FaceLandmarks[]): number {
    // Calculate confidence based on key landmark availability and quality
    const keyLandmarkIndices = [1, 33, 263, 61, 291]; // nose tip, eye corners, eye centers
    let availableKeyLandmarks = 0;

    keyLandmarkIndices.forEach(index => {
      if (landmarks[index]) {
        availableKeyLandmarks++;
      }
    });

    return availableKeyLandmarks / keyLandmarkIndices.length;
  }

  public cleanup(): void {
    this.stopFocusTimer('looking-away');
    this.stopFocusTimer('absent');
    
    if (this.faceMesh) {
      // MediaPipe doesn't have explicit cleanup, but we can clear references
      this.faceMesh = null;
    }
    
    this.isInitialized = false;
  }
}

export default MediaPipeFaceDetectionService;