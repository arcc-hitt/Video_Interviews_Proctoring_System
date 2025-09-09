// Core types for the Video Proctoring System Backend

export interface DetectionEvent {
  sessionId: string;
  candidateId: string;
  eventType: 'focus-loss' | 'absence' | 'multiple-faces' | 'unauthorized-item';
  timestamp: Date;
  duration?: number;
  confidence: number;
  metadata: {
    gazeDirection?: { x: number; y: number };
    objectType?: string;
    boundingBox?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    faceCount?: number;
  };
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
  absenceCount: number;
  multipleFacesCount: number;
  unauthorizedItemsCount: number;
  integrityScore: number;
  suspiciousEvents: SuspiciousEvent[];
  generatedAt: Date;
}

export interface SuspiciousEvent {
  eventType: string;
  timestamp: Date;
  duration?: number;
  description: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  role: 'candidate' | 'interviewer' | 'admin';
}