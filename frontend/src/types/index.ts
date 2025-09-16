// Core types for the Video Proctoring System

export interface DetectionEvent {
  sessionId: string;
  candidateId: string;
  eventType: 'focus-loss' | 'absence' | 'face-visible' | 'multiple-faces' | 'unauthorized-item' | 'manual_flag' | 'inactivity' | 'long_session' | 'heartbeat' | 'drowsiness' | 'eye-closure' | 'excessive-blinking' | 'background-voice' | 'multiple-voices' | 'excessive-noise' | string;
  timestamp: Date;
  duration?: number;
  confidence: number;
  metadata: Record<string, any>;
}

export interface InterviewSession {
  sessionId: string;
  candidateId: string;
  candidateName: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  videoUrl?: string;
  status: 'active' | 'completed' | 'terminated';
}

export interface ProctoringReport {
  reportId: string;
  sessionId: string;
  candidateId: string;
  candidateName: string;
  interviewDuration: number;
  focusLossCount: number;
  suspiciousEvents: SuspiciousEvent[];
  integrityScore: number;
  generatedAt: Date;
}

export interface SuspiciousEvent {
  eventType: string;
  timestamp: Date;
  duration?: number;
  description: string;
}

export interface Alert {
  id?: string;
  type: 'focus-loss' | 'absence' | 'multiple-faces' | 'unauthorized-item' | 'manual_flag' | 'inactivity' | 'long_session' | 'heartbeat' | 'drowsiness' | 'eye-closure' | 'excessive-blinking' | 'background-voice' | 'multiple-voices' | 'excessive-noise' | string;
  message: string;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high';
  confidence?: number;
  metadata?: Record<string, any>;
  acknowledged?: boolean;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
}

// Video streaming related types
export interface VideoStreamProps {
  onFrameCapture?: (imageData: ImageData) => void;
  onStreamStart?: (stream: MediaStream) => void;
  onStreamStop?: () => void;
  onRecordingStart?: () => void;
  onRecordingStop?: () => void;
  onError?: (error: VideoStreamError) => void;
  showRecordingControls?: boolean; // Controls whether recording buttons are shown
  // Optional: receive lightweight results from the CV Web Worker (e.g., face landmarks)
  onWorkerResult?: (result: CVWorkerLightResult) => void;
}

export interface VideoStreamState {
  stream: MediaStream | null;
  isStreaming: boolean;
  isRecording: boolean;
  recordedChunks: Blob[];
  error: VideoStreamError | null;
}

export interface VideoStreamError {
  type: 'CAMERA_ACCESS_DENIED' | 'DEVICE_NOT_FOUND' | 'RECORDING_FAILED' | 'STREAM_FAILED' | 'PROCESSING_ERROR';
  message: string;
  originalError?: Error;
}

export interface MediaConstraints {
  video: {
    width: { ideal: number };
    height: { ideal: number };
    frameRate: { ideal: number };
    facingMode: string;
    deviceId?: { exact: string };
  };
  audio: boolean | { deviceId: { exact: string } };
}

// Lightweight CV worker result types to avoid tight coupling with hook implementation
export interface CVWorkerLightResult {
  faceDetection?: WorkerFaceDetection;
  objectDetection?: {
    // keep future extensibility minimal; add fields when needed
  };
  processingTime: number;
}

export interface WorkerFaceDetection {
  landmarks: FaceLandmarks[];
  confidence: number;
  timestamp: Date;
}

// Face detection related types
export interface FaceLandmarks {
  x: number;
  y: number;
  z?: number;
}

export interface Face {
  landmarks: FaceLandmarks[];
  boundingBox: BoundingBox;
  confidence: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FaceDetectionResult {
  faces: Face[];
  landmarks: FaceLandmarks[];
  confidence: number;
  timestamp: Date;
}

export interface GazeDirection {
  x: number;
  y: number;
  isLookingAtScreen: boolean;
  confidence: number;
}

export interface FocusStatus {
  isFocused: boolean;
  gazeDirection: GazeDirection;
  faceCount: number;
  isPresent: boolean;
  confidence: number;
}

export interface FocusEvent {
  type: 'focus-loss' | 'absence' | 'face-visible' | 'multiple-faces';
  timestamp: Date;
  duration?: number;
  confidence: number;
  metadata: {
    faceCount?: number;
    gazeDirection?: GazeDirection;
    previousState?: string;
  };
}

export interface FocusDetectionService {
  detectFace(imageData: ImageData): Promise<FaceDetectionResult>;
  trackGazeDirection(landmarks: FaceLandmarks[]): GazeDirection;
  checkFocusStatus(gazeDirection: GazeDirection, faceCount: number): FocusStatus;
  startFocusTimer(eventType: 'looking-away' | 'absent'): void;
  stopFocusTimer(eventType: 'looking-away' | 'absent'): void;
  onFocusEvent?: (event: FocusEvent) => void;
}

// Object detection related types
export interface DetectedObject {
  class: string;
  confidence: number;
  boundingBox: BoundingBox;
  timestamp: Date;
}

export interface UnauthorizedItem {
  type: 'phone' | 'book' | 'notes' | 'electronic-device' | 'laptop' | 'tablet';
  confidence: number;
  position: BoundingBox;
  firstDetected: Date;
  lastSeen: Date;
  persistenceDuration: number; // in milliseconds
}

export interface ObjectDetectionResult {
  objects: DetectedObject[];
  unauthorizedItems: UnauthorizedItem[];
  timestamp: Date;
  frameConfidence: number;
}

export interface ObjectDetectionService {
  detectObjects(imageData: ImageData): Promise<DetectedObject[]>;
  classifyUnauthorizedItems(objects: DetectedObject[]): UnauthorizedItem[];
  trackObjectPresence(item: UnauthorizedItem): void;
  getUnauthorizedItems(): UnauthorizedItem[];
  clearExpiredItems(): void;
  onUnauthorizedItemDetected?: (item: UnauthorizedItem) => void;
}

export interface ObjectEvent {
  type: 'unauthorized-item-detected' | 'unauthorized-item-removed';
  item: UnauthorizedItem;
  timestamp: Date;
  confidence: number;
}

// Event processing and aggregation types
export interface ProcessedEvent {
  id: string;
  sessionId: string;
  candidateId: string;
  eventType: DetectionEvent['eventType'];
  timestamp: Date;
  duration?: number;
  confidence: number;
  metadata: Record<string, any>;
  isProcessed: boolean;
  isDuplicate: boolean;
}

export interface EventAggregation {
  eventType: DetectionEvent['eventType'];
  count: number;
  totalDuration: number;
  averageConfidence: number;
  firstOccurrence: Date;
  lastOccurrence: Date;
  events: ProcessedEvent[];
}

export interface EventProcessingService {
  processEvent(event: DetectionEvent): ProcessedEvent;
  aggregateEvents(events: ProcessedEvent[]): Map<string, EventAggregation>;
  deduplicateEvents(events: ProcessedEvent[]): ProcessedEvent[];
  streamEventToBackend(event: ProcessedEvent): Promise<void>;
  getEventQueue(): ProcessedEvent[];
  clearProcessedEvents(): void;
  onEventProcessed?: (event: ProcessedEvent) => void;
}

export interface EventStreamConfig {
  batchSize: number;
  flushInterval: number; // milliseconds
  retryAttempts: number;
  retryDelay: number; // milliseconds
}

// Authentication related types
export interface User {
  userId: string;
  email: string;
  name: string;
  role: 'candidate' | 'interviewer';
  createdAt: Date;
  isActive: boolean;
  lastLogin?: Date;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignupData {
  email: string;
  password: string;
  name: string;
  role: 'candidate' | 'interviewer';
}

export interface AuthResponse {
  user: User;
  token: string;
  message: string;
}

export interface AuthError {
  message: string;
  field?: string;
}

export interface AuthContextType {
  authState: AuthState;
  login: (credentials: LoginCredentials) => Promise<void>;
  signup: (data: SignupData) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}