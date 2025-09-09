// Shared types between frontend and backend
// This file contains types that are used by both client and server

// ============================================================================
// ENUMS (shared between frontend and backend)
// ============================================================================

export enum EventType {
  FOCUS_LOSS = 'focus-loss',
  ABSENCE = 'absence',
  MULTIPLE_FACES = 'multiple-faces',
  UNAUTHORIZED_ITEM = 'unauthorized-item'
}

export enum SessionStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  TERMINATED = 'terminated'
}

export enum UserRole {
  CANDIDATE = 'candidate',
  INTERVIEWER = 'interviewer',
  ADMIN = 'admin'
}

export enum UnauthorizedItemType {
  PHONE = 'phone',
  BOOK = 'book',
  NOTES = 'notes',
  ELECTRONIC_DEVICE = 'electronic-device'
}

// ============================================================================
// SHARED INTERFACES
// ============================================================================

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GazeDirection {
  x: number;
  y: number;
}

export interface DetectionEventMetadata {
  gazeDirection?: GazeDirection;
  objectType?: UnauthorizedItemType;
  boundingBox?: BoundingBox;
  faceCount?: number;
}

export interface DetectionEvent {
  sessionId: string;
  candidateId: string;
  eventType: EventType;
  timestamp: Date;
  duration?: number;
  confidence: number;
  metadata: DetectionEventMetadata;
}

export interface InterviewSession {
  sessionId: string;
  candidateId: string;
  candidateName: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  videoUrl?: string;
  status: SessionStatus;
}

export interface SuspiciousEvent {
  eventType: EventType;
  timestamp: Date;
  duration?: number;
  description: string;
}

export interface ProctoringReport {
  reportId: string;
  sessionId: string;
  candidateId: string;
  candidateName: string;
  interviewDuration: number;
  focusLossCount: number;
  absenceCount: number;
  multipleFacesCount: number;
  unauthorizedItemsCount: number;
  integrityScore: number;
  suspiciousEvents: SuspiciousEvent[];
  generatedAt: Date;
}

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// ============================================================================
// FRONTEND-SPECIFIC TYPES
// ============================================================================

export interface VideoStreamState {
  isStreaming: boolean;
  isRecording: boolean;
  stream: MediaStream | null;
  recordedChunks: Blob[];
}

export interface AlertState {
  id: string;
  type: EventType;
  message: string;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high';
  acknowledged: boolean;
}

export interface DetectionServiceConfig {
  faceDetectionEnabled: boolean;
  objectDetectionEnabled: boolean;
  focusLossThreshold: number; // seconds
  absenceThreshold: number; // seconds
  confidenceThreshold: number; // 0-1
}

export interface CameraPermissionState {
  granted: boolean;
  denied: boolean;
  prompt: boolean;
  error?: string;
}

// ============================================================================
// REAL-TIME COMMUNICATION TYPES
// ============================================================================

export enum WebSocketEventType {
  DETECTION_EVENT = 'detection_event',
  SESSION_UPDATE = 'session_update',
  ALERT = 'alert',
  CONNECTION_STATUS = 'connection_status',
  ERROR = 'error'
}

export interface WebSocketMessage {
  type: WebSocketEventType;
  payload: any;
  timestamp: Date;
  sessionId?: string;
}

export interface ConnectionStatus {
  connected: boolean;
  lastPing?: Date;
  reconnectAttempts: number;
}