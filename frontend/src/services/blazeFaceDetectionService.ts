import * as blazeface from '@tensorflow-models/blazeface';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
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

// New state for smoothing detection results
interface DetectionState {
  frameCount: number;
  triggered: boolean;
}

export class BlazeFaceDetectionService implements FocusDetectionService {
  private static instance: BlazeFaceDetectionService | null = null;
  private static isInitializing = false;
  
  private model: blazeface.BlazeFaceModel | null = null;
  private isInitialized = false;
  private focusLossTimer: TimerState = { timerId: null, startTime: null, isActive: false };
  private absenceTimer: TimerState = { timerId: null, startTime: null, isActive: false };
  private currentFocusStatus: FocusStatus | null = null;
  
  // State for smoothing detection
  private absenceState: DetectionState = { frameCount: 0, triggered: false };
  private multipleFacesState: DetectionState = { frameCount: 0, triggered: false };

  // Configuration constants
  private readonly FOCUS_LOSS_THRESHOLD = 5000; // 5 seconds
  private readonly ABSENCE_THRESHOLD = 3; // 3 consecutive frames
  private readonly MULTIPLE_FACES_THRESHOLD = 5; // 5 consecutive frames
  private readonly GAZE_THRESHOLD = 0.3; // Threshold for determining if looking at screen

  public onFocusEvent?: (event: FocusEvent) => void;

  constructor() {
    // Prevent multiple instances
    if (BlazeFaceDetectionService.instance) {
      return BlazeFaceDetectionService.instance;
    }
    
    BlazeFaceDetectionService.instance = this;
    
    if (!BlazeFaceDetectionService.isInitializing) {
      BlazeFaceDetectionService.isInitializing = true;
      // Initialize asynchronously
      this.initializeBlazeFace().catch(error => {
        console.error('BlazeFace initialization failed:', error);
        BlazeFaceDetectionService.isInitializing = false;
      });
    }
  }

  // Add public initialize method for explicit initialization
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    if (!BlazeFaceDetectionService.isInitializing) {
      BlazeFaceDetectionService.isInitializing = true;
      await this.initializeBlazeFace();
    }
  }

  static getInstance(): BlazeFaceDetectionService {
    if (!BlazeFaceDetectionService.instance) {
      BlazeFaceDetectionService.instance = new BlazeFaceDetectionService();
    }
    return BlazeFaceDetectionService.instance;
  }

  private async initializeBlazeFace(): Promise<void> {
    try {
      console.log('Initializing TensorFlow.js BlazeFace...');
      
      // Set TensorFlow.js backend
      await tf.setBackend('webgl');
      await tf.ready();
      
      // Load BlazeFace model
      this.model = await blazeface.load();
      
      this.isInitialized = true;
      console.log('BlazeFace model loaded successfully');
    } catch (error) {
      console.error('Failed to initialize BlazeFace:', error);
      this.isInitialized = false;
      // Don't throw error - allow service to work in fallback mode
    } finally {
      BlazeFaceDetectionService.isInitializing = false;
    }
  }

  public async detectFace(imageData: ImageData): Promise<FaceDetectionResult> {
    if (!this.isInitialized || !this.model) {
      console.warn('Face detection service not initialized, returning empty result');
      return {
        faces: [],
        landmarks: [],
        confidence: 0,
        timestamp: new Date()
      };
    }

    try {
      // Create tensor from ImageData
      const tensor = tf.browser.fromPixels(imageData);
      
      // Detect faces
      const predictions = await this.model.estimateFaces(tensor, false);
      
      // Clean up tensor
      tensor.dispose();

      const faces: Face[] = [];
      let allLandmarks: FaceLandmarks[] = [];
      let overallConfidence = 0;

      if (predictions && predictions.length > 0) {
        predictions.forEach((prediction: any) => {
          const boundingBox: BoundingBox = {
            x: prediction.topLeft[0],
            y: prediction.topLeft[1],
            width: prediction.bottomRight[0] - prediction.topLeft[0],
            height: prediction.bottomRight[1] - prediction.topLeft[1]
          };

          const confidence = prediction.probability || 0.8; // BlazeFace provides probability

          // Extract landmarks if available
          const faceLandmarks: FaceLandmarks[] = [];
          if (prediction.landmarks) {
            prediction.landmarks.forEach((landmark: number[]) => {
              faceLandmarks.push({
                x: landmark[0] / imageData.width, // Normalize to 0-1
                y: landmark[1] / imageData.height, // Normalize to 0-1
                z: 0
              });
            });
          }

          faces.push({
            landmarks: faceLandmarks,
            boundingBox,
            confidence
          });

          allLandmarks = allLandmarks.concat(faceLandmarks);
          overallConfidence = Math.max(overallConfidence, confidence);
        });
      }

      const result: FaceDetectionResult = {
        faces,
        landmarks: allLandmarks,
        confidence: overallConfidence,
        timestamp: new Date()
      };

      // Process focus tracking
      this.processFocusTracking(result);

      return result;
    } catch (error) {
      console.error('Face detection error:', error);
      return {
        faces: [],
        landmarks: [],
        confidence: 0,
        timestamp: new Date()
      };
    }
  }

  public trackGazeDirection(landmarks: FaceLandmarks[]): GazeDirection {
    if (landmarks.length < 6) {
      return { x: 0, y: 0, isLookingAtScreen: false, confidence: 0 };
    }

    // Use key landmarks for gaze estimation
    // BlazeFace provides 6 key points: 
    // 0: right eye, 1: left eye, 2: nose tip, 3: mouth center, 4: right ear, 5: left ear
    
    try {
      const rightEye = landmarks[0];
      const leftEye = landmarks[1];
      const noseTip = landmarks[2];

      // Calculate eye center
      const eyeCenter = {
        x: (rightEye.x + leftEye.x) / 2,
        y: (rightEye.y + leftEye.y) / 2
      };

      // Calculate gaze direction based on nose position relative to eye center
      const x = noseTip.x - eyeCenter.x;
      const y = noseTip.y - eyeCenter.y;

      const normalizedX = Math.max(-1, Math.min(1, x * 10)); // Scale and clamp
      const normalizedY = Math.max(-1, Math.min(1, y * 10)); // Scale and clamp

      const isLookingAtScreen = Math.abs(normalizedX) < this.GAZE_THRESHOLD && Math.abs(normalizedY) < this.GAZE_THRESHOLD;

      return {
        x: normalizedX,
        y: normalizedY,
        isLookingAtScreen,
        confidence: 0.8
      };
    } catch (error) {
      console.error('Error calculating gaze direction:', error);
      return { x: 0, y: 0, isLookingAtScreen: false, confidence: 0 };
    }
  }

  public checkFocusStatus(gazeDirection: GazeDirection, faceCount: number): FocusStatus {
    const isPresent = faceCount > 0;
    const isFocused = isPresent && faceCount === 1 && gazeDirection.isLookingAtScreen;

    return {
      isFocused,
      gazeDirection,
      faceCount,
      isPresent,
      confidence: gazeDirection.confidence
    };
  }

  public startFocusTimer(eventType: 'looking-away' | 'absent'): void {
    const threshold = eventType === 'looking-away' ? this.FOCUS_LOSS_THRESHOLD : this.ABSENCE_THRESHOLD;
    const timer = eventType === 'looking-away' ? this.focusLossTimer : this.absenceTimer;

    if (!timer.isActive) {
      timer.timerId = window.setTimeout(() => {
        this.emitFocusEvent({
          type: eventType === 'looking-away' ? 'focus-loss' : 'absence',
          timestamp: new Date(),
          duration: threshold,
          confidence: 0.9,
          metadata: {
            faceCount: this.currentFocusStatus?.faceCount || 0,
            gazeDirection: this.currentFocusStatus?.gazeDirection
          }
        });
      }, threshold);
      timer.startTime = new Date();
      timer.isActive = true;
    }
  }

  public stopFocusTimer(eventType: 'looking-away' | 'absent'): void {
    const timer = eventType === 'looking-away' ? this.focusLossTimer : this.absenceTimer;
    this.clearTimer(timer);
  }

  private processFocusTracking(result: FaceDetectionResult): void {
    const faceCount = result.faces.length;
    const currentTime = new Date();
    
    if (faceCount === 0) {
      // No face detected
      this.multipleFacesState = { frameCount: 0, triggered: false }; // Reset multiple faces
      this.absenceState.frameCount++;

      if (this.absenceState.frameCount >= this.ABSENCE_THRESHOLD && !this.absenceState.triggered) {
        this.absenceState.triggered = true;
        this.emitFocusEvent({
          type: 'absence',
          timestamp: currentTime,
          confidence: 0.95, // High confidence after several frames
          metadata: {
            faceCount: 0,
            previousState: this.currentFocusStatus ? (this.currentFocusStatus.isFocused ? 'focused' : 'unfocused') : 'unknown'
          }
        });
      }
      
      this.stopFocusTimer('looking-away');
      
    } else if (faceCount > 1) {
      // Multiple faces detected
      this.absenceState = { frameCount: 0, triggered: false }; // Reset absence
      this.multipleFacesState.frameCount++;

      if (this.multipleFacesState.frameCount >= this.MULTIPLE_FACES_THRESHOLD && !this.multipleFacesState.triggered) {
        this.multipleFacesState.triggered = true;
        this.emitFocusEvent({
          type: 'multiple-faces',
          timestamp: currentTime,
          confidence: result.confidence,
          metadata: {
            faceCount,
            previousState: this.currentFocusStatus ? (this.currentFocusStatus.isFocused ? 'focused' : 'unfocused') : 'unknown'
          }
        });
      }
      
      this.stopFocusTimer('looking-away');
      this.stopFocusTimer('absent');
      
    } else {
      // Single face detected
      // Reset both absence and multiple faces state
      if (this.absenceState.triggered) {
        // If absence was triggered, we can consider this a "restored" event
        this.emitFocusEvent({
          type: 'focus-restored',
          timestamp: currentTime,
          confidence: result.faces[0].confidence,
          metadata: {
            faceCount: 1,
            previousState: 'unfocused'
          }
        });
      }
      this.absenceState = { frameCount: 0, triggered: false };
      this.multipleFacesState = { frameCount: 0, triggered: false };

      const face = result.faces[0];
      const gazeDirection = this.trackGazeDirection(face.landmarks);
      const focusStatus = this.checkFocusStatus(gazeDirection, faceCount);
      
      // Check if focus state changed
      const wasFocused = this.currentFocusStatus?.isFocused || false;
      const isNowFocused = focusStatus.isFocused;
      
      this.currentFocusStatus = focusStatus;
      
      if (isNowFocused) {
        // Currently focused - stop all timers
        this.stopFocusTimer('looking-away');
        this.stopFocusTimer('absent');
        
        // If we were not focused before, emit focus-restored event
        if (!wasFocused) {
          this.emitFocusEvent({
            type: 'focus-restored',
            timestamp: currentTime,
            confidence: focusStatus.confidence,
            metadata: {
              faceCount: 1,
              gazeDirection: focusStatus.gazeDirection,
              previousState: wasFocused ? 'focused' : 'unfocused'
            }
          });
        }
      } else {
        // Not focused - start looking-away timer
        this.stopFocusTimer('absent');
        this.startFocusTimer('looking-away');
        
        // If focus was just lost, emit immediate event
        if (wasFocused) {
          this.emitFocusEvent({
            type: 'focus-loss',
            timestamp: currentTime,
            duration: 0, // Immediate detection
            confidence: focusStatus.confidence,
            metadata: {
              faceCount: 1,
              gazeDirection: focusStatus.gazeDirection,
              previousState: 'focused'
            }
          });
        }
      }
    }
  }

  private clearTimer(timer: TimerState): void {
    if (timer.timerId !== null) {
      clearTimeout(timer.timerId);
      timer.timerId = null;
      timer.startTime = null;
      timer.isActive = false;
    }
  }

  private emitFocusEvent(event: FocusEvent): void {
    console.log('Focus event:', event);
    if (this.onFocusEvent) {
      this.onFocusEvent(event);
    }
  }

  public cleanup(): void {
    this.clearTimer(this.focusLossTimer);
    this.clearTimer(this.absenceTimer);
    
    if (this.model) {
      // BlazeFace models don't need explicit disposal
      this.model = null;
    }
    
    this.isInitialized = false;
    console.log('BlazeFace detection service cleaned up');
  }

  public getCurrentFocusStatus(): FocusStatus | null {
    return this.currentFocusStatus;
  }

  public getIsInitialized(): boolean {
    return this.isInitialized;
  }
}

// Export singleton instance
export const blazeFaceDetectionService = BlazeFaceDetectionService.getInstance();
