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

//New state for smoothing detection results
interface DetectionState {
  frameCount: number;
  triggered: boolean;
}

// Enhanced state for better detection stability
interface FaceDetectionHistory {
  recentFaceCounts: number[]; // Last few face counts
  stableFaceCount: number;    // Most consistent face count
  confidenceSum: number;      // Sum of recent confidences
  frameBuffer: number;        // Number of frames to buffer
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
  
  // Enhanced detection history for stability
  private detectionHistory: FaceDetectionHistory = {
    recentFaceCounts: [],
    stableFaceCount: 0,
    confidenceSum: 0,
    frameBuffer: 5 // Consider last 5 frames
  };

  // Warmup and stability tracking
  private isWarmingUp = true;
  private warmupFrameCount = 0;
  private readonly WARMUP_FRAMES = 30; // Wait 30 frames before triggering alerts (~1 second at 30fps)

  // Configuration constants
  private readonly FOCUS_LOSS_THRESHOLD = 5000; // 5 seconds
  private readonly ABSENCE_THRESHOLD = 8; // 8 consecutive frames (more lenient)
  private readonly MULTIPLE_FACES_THRESHOLD = 10; // 10 consecutive frames (more stable)
  private readonly GAZE_THRESHOLD = 0.4; // Threshold for determining if looking at screen (more lenient)
  private readonly MIN_FACE_CONFIDENCE = 0.75; // Increased confidence for better detection
  private readonly MIN_FACE_SIZE = 0.04; // Minimum face size as percentage of image (5%)

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
      // Set TensorFlow.js backend
      await tf.setBackend('webgl');
      await tf.ready();
      
      // Load BlazeFace model
      this.model = await blazeface.load();
      
      this.isInitialized = true;
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
      
      // Detect faces with higher tolerance during warmup
      const returnTensors = false;
      const flipHorizontal = false;
      const predictions = await this.model.estimateFaces(tensor, returnTensors, flipHorizontal);
      
      // Clean up tensor
      tensor.dispose();

      const faces: Face[] = [];
      let allLandmarks: FaceLandmarks[] = [];
      let overallConfidence = 0;

      if (predictions && predictions.length > 0) {
        predictions.forEach((prediction: any) => {
          const confidence = prediction.probability || 0.8; // BlazeFace provides probability
          
          // Use more lenient confidence during warmup to help with initialization
          const effectiveMinConfidence = this.isWarmingUp ? 0.5 : this.MIN_FACE_CONFIDENCE;
          
          // Filter out low-confidence detections
          if (confidence < effectiveMinConfidence) {
            return; // Skip this detection
          }

          const boundingBox: BoundingBox = {
            x: prediction.topLeft[0],
            y: prediction.topLeft[1],
            width: prediction.bottomRight[0] - prediction.topLeft[0],
            height: prediction.bottomRight[1] - prediction.topLeft[1]
          };

          // Calculate face size as percentage of image area
          const faceArea = (boundingBox.width * boundingBox.height) / (imageData.width * imageData.height);
          
          // Use more lenient size filtering during warmup
          const effectiveMinSize = this.isWarmingUp ? 0.02 : this.MIN_FACE_SIZE;
          
          // Filter out very small detections (likely false positives)
          if (faceArea < effectiveMinSize) {
            return; // Skip this detection
          }

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

  private updateDetectionHistory(faceCount: number, confidence: number): number {
    // Add current detection to history
    this.detectionHistory.recentFaceCounts.push(faceCount);
    this.detectionHistory.confidenceSum += confidence;
    
    // Keep only the last N frames
    if (this.detectionHistory.recentFaceCounts.length > this.detectionHistory.frameBuffer) {
      this.detectionHistory.recentFaceCounts.shift();
    }
    
    // Calculate the most stable face count from recent history
    const counts = this.detectionHistory.recentFaceCounts;
    const countFrequency: { [key: number]: number } = {};
    
    // Count frequency of each face count
    counts.forEach(count => {
      countFrequency[count] = (countFrequency[count] || 0) + 1;
    });
    
    // Find the most frequent count (mode)
    let maxFreq = 0;
    let stableCount = faceCount; // Default to current if no clear mode
    
    Object.entries(countFrequency).forEach(([count, freq]) => {
      if (freq > maxFreq) {
        maxFreq = freq;
        stableCount = parseInt(count);
      }
    });
    
    this.detectionHistory.stableFaceCount = stableCount;
    return stableCount;
  }

  private processFocusTracking(result: FaceDetectionResult): void {
    const rawFaceCount = result.faces.length;
    const currentTime = new Date();
    
    // Handle warmup period - don't trigger alerts during initial frames
    this.warmupFrameCount++;
    if (this.warmupFrameCount <= this.WARMUP_FRAMES) {
      this.isWarmingUp = true;
      // Still update detection history during warmup for smoother transition
      this.updateDetectionHistory(rawFaceCount, result.confidence);
      
      // Log warmup progress every 10 frames
      if (this.warmupFrameCount % 10 === 0) {
        console.log(`Face detection warmup: ${this.warmupFrameCount}/${this.WARMUP_FRAMES} frames (${Math.round((this.warmupFrameCount / this.WARMUP_FRAMES) * 100)}%)`);
      }
      
      return; // Skip alert triggering during warmup
    } else if (this.isWarmingUp) {
      // Just finished warmup
      this.isWarmingUp = false;
      console.log('Face detection warmup completed - alerts now active');
    }
    
    // Use detection history for more stable face counting
    const stableFaceCount = this.updateDetectionHistory(rawFaceCount, result.confidence);
    
    if (stableFaceCount === 0) {
      // No face detected (stable)
      this.multipleFacesState = { frameCount: 0, triggered: false }; // Reset multiple faces
      this.absenceState.frameCount++;

      // Use more lenient thresholds shortly after warmup
      const isRecentlyWarmedUp = this.warmupFrameCount <= (this.WARMUP_FRAMES + 60); // First 3 seconds after warmup
      const effectiveAbsenceThreshold = isRecentlyWarmedUp ? this.ABSENCE_THRESHOLD * 2 : this.ABSENCE_THRESHOLD;

      if (this.absenceState.frameCount >= effectiveAbsenceThreshold && !this.absenceState.triggered) {
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
      
    } else if (stableFaceCount > 1) {
      // Multiple faces detected (stable)
      this.absenceState = { frameCount: 0, triggered: false }; // Reset absence
      this.multipleFacesState.frameCount++;

      if (this.multipleFacesState.frameCount >= this.MULTIPLE_FACES_THRESHOLD && !this.multipleFacesState.triggered) {
        this.multipleFacesState.triggered = true;
        this.emitFocusEvent({
          type: 'multiple-faces',
          timestamp: currentTime,
          confidence: result.confidence,
          metadata: {
            faceCount: stableFaceCount,
            previousState: this.currentFocusStatus ? (this.currentFocusStatus.isFocused ? 'focused' : 'unfocused') : 'unknown'
          }
        });
      }
      
      this.stopFocusTimer('looking-away');
      this.stopFocusTimer('absent');
      
    } else {
      // Single face detected (stable)
      // Reset both absence and multiple faces state
      if (this.absenceState.triggered) {
        // If absence was triggered, emit face-visible event to notify interviewer
        this.emitFocusEvent({
          type: 'face-visible',
          timestamp: currentTime,
          confidence: result.faces[0]?.confidence || 0.8,
          metadata: {
            faceCount: 1,
            previousState: 'absent'
          }
        });
      }
      
      if (this.multipleFacesState.triggered) {
        // If multiple faces was triggered, also emit face-visible for clarity
        this.emitFocusEvent({
          type: 'face-visible',
          timestamp: currentTime,
          confidence: result.faces[0]?.confidence || 0.8,
          metadata: {
            faceCount: 1,
            previousState: 'multiple-faces'
          }
        });
      }
      
      this.absenceState = { frameCount: 0, triggered: false };
      this.multipleFacesState = { frameCount: 0, triggered: false };

      // Only process gaze tracking if we have actual face data
      if (result.faces.length > 0) {
        const face = result.faces[0];
        const gazeDirection = this.trackGazeDirection(face.landmarks);
        const focusStatus = this.checkFocusStatus(gazeDirection, 1); // Use actual count of 1
        
        // Check if focus state changed
        const wasFocused = this.currentFocusStatus?.isFocused || false;
        const isNowFocused = focusStatus.isFocused;
        
        this.currentFocusStatus = focusStatus;
        
        if (isNowFocused) {
          // Currently focused - stop all timers
          this.stopFocusTimer('looking-away');
          this.stopFocusTimer('absent');
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
    if (this.onFocusEvent) {
      this.onFocusEvent(event);
    }
  }

  public cleanup(): void {
    this.clearTimer(this.focusLossTimer);
    this.clearTimer(this.absenceTimer);
    
    // Reset detection history
    this.detectionHistory = {
      recentFaceCounts: [],
      stableFaceCount: 0,
      confidenceSum: 0,
      frameBuffer: 5
    };
    
    // Reset warmup state
    this.isWarmingUp = true;
    this.warmupFrameCount = 0;
    
    // Reset detection states
    this.absenceState = { frameCount: 0, triggered: false };
    this.multipleFacesState = { frameCount: 0, triggered: false };
    
    if (this.model) {
      // BlazeFace models don't need explicit disposal
      this.model = null;
    }
    
    this.isInitialized = false;
  }

  public getCurrentFocusStatus(): FocusStatus | null {
    return this.currentFocusStatus;
  }

  public getIsInitialized(): boolean {
    return this.isInitialized;
  }

  public getIsWarmingUp(): boolean {
    return this.isWarmingUp;
  }

  public getWarmupProgress(): { current: number; total: number; percentage: number } {
    return {
      current: this.warmupFrameCount,
      total: this.WARMUP_FRAMES,
      percentage: Math.min(100, (this.warmupFrameCount / this.WARMUP_FRAMES) * 100)
    };
  }
}

// Export singleton instance
export const blazeFaceDetectionService = BlazeFaceDetectionService.getInstance();
