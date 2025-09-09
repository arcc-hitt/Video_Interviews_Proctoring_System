import { z } from 'zod';
import { DetectionEvent, InterviewSession, ProctoringReport } from './index';

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

// Authentication Types
export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export const RegisterRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1).max(100),
  role: z.enum(['candidate', 'interviewer'])
});

export const AuthResponseSchema = z.object({
  token: z.string(),
  user: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    role: z.string()
  })
});

// Session Management Types
export const SessionParamsSchema = z.object({
  sessionId: z.string().uuid()
});

export const CandidateParamsSchema = z.object({
  candidateId: z.string().uuid()
});

// Event Query Types
export const EventQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  eventType: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional()
});

// Report Export Types
export const ReportExportQuerySchema = z.object({
  format: z.enum(['pdf', 'csv']),
  includeMetadata: z.string().transform(val => val === 'true').optional()
});

// Real-time Event Types
export const RealTimeEventSchema = z.object({
  sessionId: z.string().uuid(),
  eventType: z.string(),
  data: z.any(),
  timestamp: z.date()
});

// Video Upload Types
export const VideoUploadMetadataSchema = z.object({
  sessionId: z.string().uuid(),
  candidateId: z.string().uuid(),
  duration: z.number().positive(),
  fileSize: z.number().positive(),
  mimeType: z.string().regex(/^video\//)
});

// Pagination Types
export const PaginationSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive().max(100),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0)
});

export const PaginatedResponseSchema = <T>(itemSchema: z.ZodSchema<T>) => z.object({
  items: z.array(itemSchema),
  pagination: PaginationSchema
});

// ============================================================================
// INFERRED TYPES
// ============================================================================

export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
export type SessionParams = z.infer<typeof SessionParamsSchema>;
export type CandidateParams = z.infer<typeof CandidateParamsSchema>;
export type EventQuery = z.infer<typeof EventQuerySchema>;
export type ReportExportQuery = z.infer<typeof ReportExportQuerySchema>;
export type RealTimeEvent = z.infer<typeof RealTimeEventSchema>;
export type VideoUploadMetadata = z.infer<typeof VideoUploadMetadataSchema>;
export type Pagination = z.infer<typeof PaginationSchema>;

// Paginated Response Types
export type PaginatedDetectionEvents = {
  items: DetectionEvent[];
  pagination: Pagination;
};

export type PaginatedInterviewSessions = {
  items: InterviewSession[];
  pagination: Pagination;
};

export type PaginatedProctoringReports = {
  items: ProctoringReport[];
  pagination: Pagination;
};

// ============================================================================
// ERROR TYPES
// ============================================================================

export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  DUPLICATE_RESOURCE = 'DUPLICATE_RESOURCE',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  FILE_UPLOAD_ERROR = 'FILE_UPLOAD_ERROR',
  PROCESSING_ERROR = 'PROCESSING_ERROR'
}

export const ApiErrorSchema = z.object({
  code: z.nativeEnum(ErrorCode),
  message: z.string(),
  details: z.any().optional(),
  timestamp: z.date()
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

// ============================================================================
// WEBSOCKET MESSAGE TYPES
// ============================================================================

export enum WebSocketMessageType {
  DETECTION_EVENT = 'detection_event',
  SESSION_UPDATE = 'session_update',
  ALERT = 'alert',
  CONNECTION_STATUS = 'connection_status',
  ERROR = 'error'
}

export const WebSocketMessageSchema = z.object({
  type: z.nativeEnum(WebSocketMessageType),
  payload: z.any(),
  timestamp: z.date(),
  sessionId: z.string().uuid().optional()
});

export type WebSocketMessage = z.infer<typeof WebSocketMessageSchema>;