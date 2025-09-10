// Core types for the Video Proctoring System

export interface DetectionEvent {
  sessionId: string;
  candidateId: string;
  eventType: 'focus-loss' | 'absence' | 'multiple-faces' | 'unauthorized-item';
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
  type: 'focus-loss' | 'absence' | 'multiple-faces' | 'unauthorized-item';
  message: string;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high';
}

// Video streaming related types
export interface VideoStreamProps {
  onFrameCapture?: (imageData: ImageData) => void;
  onRecordingStart?: () => void;
  onRecordingStop?: () => void;
  onError?: (error: VideoStreamError) => void;
}

export interface VideoStreamState {
  stream: MediaStream | null;
  isStreaming: boolean;
  isRecording: boolean;
  recordedChunks: Blob[];
  error: VideoStreamError | null;
}

export interface VideoStreamError {
  type: 'CAMERA_ACCESS_DENIED' | 'DEVICE_NOT_FOUND' | 'RECORDING_FAILED' | 'STREAM_FAILED';
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