import { DetectionEvent, ManualObservation } from './index';

// WebSocket Event Types
export enum WebSocketEventType {
  // Connection events
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  
  // Session management
  JOIN_SESSION = 'join_session',
  LEAVE_SESSION = 'leave_session',
  SESSION_JOINED = 'session_joined',
  SESSION_LEFT = 'session_left',
  
  // Real-time detection events
  DETECTION_EVENT = 'detection_event',
  DETECTION_EVENT_BROADCAST = 'detection_event_broadcast',
  
  // Video streaming
  VIDEO_STREAM_START = 'video_stream_start',
  VIDEO_STREAM_STOP = 'video_stream_stop',
  VIDEO_STREAM_DATA = 'video_stream_data',
  VIDEO_STREAM_OFFER = 'video_stream_offer',
  VIDEO_STREAM_ANSWER = 'video_stream_answer',
  VIDEO_STREAM_ICE_CANDIDATE = 'video_stream_ice_candidate',
  
  // Manual flagging
  MANUAL_FLAG = 'manual_flag',
  MANUAL_FLAG_BROADCAST = 'manual_flag_broadcast',
  
  // Session status updates
  SESSION_STATUS_UPDATE = 'session_status_update',
  
  // Interviewer session control
  INTERVIEWER_SESSION_CONTROL = 'interviewer_session_control',
  INTERVIEWER_RECORDING_CONTROL = 'interviewer_recording_control',
  SESSION_CONTROL_UPDATE = 'session_control_update',
  
  // Error handling
  ERROR = 'error',
  
  // Heartbeat
  PING = 'ping',
  PONG = 'pong'
}

// User roles for WebSocket connections
export enum WebSocketUserRole {
  CANDIDATE = 'candidate',
  INTERVIEWER = 'interviewer'
}

// WebSocket connection data
export interface WebSocketConnectionData {
  userId: string;
  sessionId: string;
  role: WebSocketUserRole;
  email?: string;
  name?: string;
  connectedAt: Date;
}

// Session join payload
export interface JoinSessionPayload {
  sessionId: string;
  role: WebSocketUserRole;
  userId: string;
  token?: string; // JWT token for authentication
}

// Session joined response
export interface SessionJoinedPayload {
  sessionId: string;
  role: WebSocketUserRole;
  userId: string;
  connectedUsers: {
    candidates: WebSocketConnectionData[];
    interviewers: WebSocketConnectionData[];
  };
}

// Detection event payload for WebSocket
export interface DetectionEventPayload extends Omit<DetectionEvent, 'timestamp'> {
  timestamp: string; // ISO string for WebSocket transmission
}

// Manual flag payload
export interface ManualFlagPayload {
  sessionId: string;
  interviewerId: string;
  timestamp: string;
  flagType: 'suspicious_behavior' | 'technical_issue' | 'violation' | 'general_note';
  description: string;
  severity: 'low' | 'medium' | 'high';
  targetTimestamp?: string; // Timestamp of the event being flagged
}

// Video stream payloads
export interface VideoStreamStartPayload {
  sessionId: string;
  userId: string;
  streamId: string;
}

export interface VideoStreamDataPayload {
  sessionId: string;
  userId: string;
  streamId: string;
  data: string; // Base64 encoded video chunk
  timestamp: string;
  sequenceNumber: number;
}

export interface VideoStreamOfferPayload {
  sessionId: string;
  fromUserId: string;
  toUserId: string;
  offer: {
    type: 'offer';
    sdp: string;
  };
}

export interface VideoStreamAnswerPayload {
  sessionId: string;
  fromUserId: string;
  toUserId: string;
  answer: {
    type: 'answer';
    sdp: string;
  };
}

export interface VideoStreamIceCandidatePayload {
  sessionId: string;
  fromUserId: string;
  toUserId: string;
  candidate: {
    candidate: string;
    sdpMLineIndex?: number | null;
    sdpMid?: string | null;
  };
}

// Session status update payload
export interface SessionStatusUpdatePayload {
  sessionId: string;
  status: 'active' | 'completed' | 'terminated';
  updatedBy: string;
  timestamp: string;
}

// Interviewer session control payload
export interface InterviewerSessionControlPayload {
  sessionId: string;
  action: 'start' | 'pause' | 'resume' | 'end' | 'terminate';
  timestamp: string;
}

// Interviewer recording control payload
export interface InterviewerRecordingControlPayload {
  sessionId: string;
  action: 'start_recording' | 'stop_recording';
  timestamp: string;
}

// Session control update payload (broadcast to candidates)
export interface SessionControlUpdatePayload {
  sessionId: string;
  type: 'session_started' | 'session_paused' | 'session_resumed' | 'session_ended' | 'session_terminated' | 'recording_started' | 'recording_stopped';
  timestamp: string;
}

// Error payload
export interface WebSocketErrorPayload {
  code: string;
  message: string;
  details?: any;
}

// Active session data
export interface ActiveSession {
  sessionId: string;
  candidates: Map<string, WebSocketConnectionData>;
  interviewers: Map<string, WebSocketConnectionData>;
  createdAt: Date;
  lastActivity: Date;
}

// WebSocket server statistics
export interface WebSocketStats {
  totalConnections: number;
  activeSessions: number;
  connectedCandidates: number;
  connectedInterviewers: number;
  uptime: number;
}