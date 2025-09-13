import { z } from 'zod';

// Core types for the Video Proctoring System Backend

// ============================================================================
// ENUMS
// ============================================================================

export enum EventType {
  FOCUS_LOSS = 'focus-loss',
  ABSENCE = 'absence',
  FACE_VISIBLE = 'face-visible',
  MULTIPLE_FACES = 'multiple-faces',
  UNAUTHORIZED_ITEM = 'unauthorized-item',
  DROWSINESS = 'drowsiness',
  EYE_CLOSURE = 'eye-closure',
  EXCESSIVE_BLINKING = 'excessive-blinking',
  BACKGROUND_VOICE = 'background-voice',
  MULTIPLE_VOICES = 'multiple-voices',
  EXCESSIVE_NOISE = 'excessive-noise'
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

export enum ObservationType {
  SUSPICIOUS_BEHAVIOR = 'suspicious_behavior',
  TECHNICAL_ISSUE = 'technical_issue',
  GENERAL_NOTE = 'general_note',
  VIOLATION = 'violation'
}

export enum Severity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

// ============================================================================
// ZOD VALIDATION SCHEMAS
// ============================================================================

// Bounding Box Schema
export const BoundingBoxSchema = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().positive(),
  height: z.number().positive()
});

// Gaze Direction Schema
export const GazeDirectionSchema = z.object({
  x: z.number().min(-1).max(1),
  y: z.number().min(-1).max(1)
});

// Eye Metrics Schema
export const EyeMetricsSchema = z.object({
  leftEyeAR: z.number().min(0).max(1),
  rightEyeAR: z.number().min(0).max(1),
  averageEyeAR: z.number().min(0).max(1),
  isEyesClosed: z.boolean(),
  blinkDuration: z.number().min(0)
});

// Drowsiness Metrics Schema
export const DrowsinessMetricsSchema = z.object({
  blinkRate: z.number().min(0),
  averageBlinkDuration: z.number().min(0),
  longBlinkCount: z.number().int().min(0),
  drowsinessScore: z.number().min(0).max(1),
  isAwake: z.boolean()
});

// Speech Segment Schema
export const SpeechSegmentSchema = z.object({
  startTime: z.number().min(0),
  endTime: z.number().min(0),
  confidence: z.number().min(0).max(1),
  isCandidateVoice: z.boolean()
});

// Audio Metrics Schema
export const AudioMetricsSchema = z.object({
  volume: z.number().min(0).max(1),
  frequency: z.number().min(0),
  voiceActivityProbability: z.number().min(0).max(1),
  backgroundNoiseLevel: z.number().min(0).max(1),
  speechSegments: z.array(SpeechSegmentSchema)
});

// Detection Event Metadata Schema
export const DetectionEventMetadataSchema = z.object({
  gazeDirection: GazeDirectionSchema.optional(),
  objectType: z.nativeEnum(UnauthorizedItemType).optional(),
  boundingBox: BoundingBoxSchema.optional(),
  faceCount: z.number().int().min(0).optional(),
  eyeMetrics: EyeMetricsSchema.optional(),
  drowsinessMetrics: DrowsinessMetricsSchema.optional(),
  audioMetrics: AudioMetricsSchema.optional(),
  description: z.string().optional()
}).passthrough(); // Allow additional fields

// Detection Event Schema
export const DetectionEventSchema = z.object({
  sessionId: z.string().uuid(),
  candidateId: z.string().uuid(),
  eventType: z.nativeEnum(EventType),
  timestamp: z.date(),
  duration: z.number().positive().optional(),
  confidence: z.number().min(0).max(1),
  metadata: DetectionEventMetadataSchema
});

// Interview Session Schema
export const InterviewSessionSchema = z.object({
  sessionId: z.string().uuid(),
  candidateId: z.string().uuid(),
  candidateName: z.string().min(1).max(100),
  startTime: z.date(),
  endTime: z.date().optional(),
  duration: z.number().positive().optional(),
  videoUrl: z.string().url().optional(),
  status: z.nativeEnum(SessionStatus)
});

// Suspicious Event Schema
export const SuspiciousEventSchema = z.object({
  eventType: z.nativeEnum(EventType),
  timestamp: z.date(),
  duration: z.number().positive().optional(),
  description: z.string().min(1).max(500)
});

// Manual Observation Schema
export const ManualObservationSchema = z.object({
  observationId: z.string().uuid(),
  sessionId: z.string().uuid(),
  interviewerId: z.string().uuid(),
  timestamp: z.date(),
  observationType: z.nativeEnum(ObservationType),
  description: z.string().min(1).max(1000),
  severity: z.nativeEnum(Severity),
  flagged: z.boolean()
});

// Proctoring Report Schema
export const ProctoringReportSchema = z.object({
  reportId: z.string().uuid(),
  sessionId: z.string().uuid(),
  candidateId: z.string().uuid(),
  candidateName: z.string().min(1).max(100),
  interviewDuration: z.number().positive(),
  focusLossCount: z.number().int().min(0),
  absenceCount: z.number().int().min(0),
  multipleFacesCount: z.number().int().min(0),
  unauthorizedItemsCount: z.number().int().min(0),
  integrityScore: z.number().min(0).max(100),
  suspiciousEvents: z.array(SuspiciousEventSchema),
  manualObservations: z.array(ManualObservationSchema).optional(),
  generatedAt: z.date(),
  metadata: z.record(z.string(), z.any()).optional()
});

// Auth User Schema
export const AuthUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.nativeEnum(UserRole)
});

// User Registration Schema
export const UserRegistrationSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(100),
  name: z.string().min(1).max(100),
  role: z.nativeEnum(UserRole)
});

// User Login Schema
export const UserLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

// Session Creation Schema
export const SessionCreationSchema = z.object({
  candidateName: z.string().min(1).max(100),
  candidateEmail: z.string().email().optional(),
  interviewerUserId: z.string().uuid()
});

// Session Pairing Schema
export const SessionPairingSchema = z.object({
  sessionId: z.string().uuid(),
  interviewerUserId: z.string().uuid()
});

// JWT Payload Schema
export const JWTPayloadSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  role: z.nativeEnum(UserRole),
  iat: z.number(),
  exp: z.number()
});

// API Response Schema
export const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  message: z.string().optional(),
  error: z.string().optional()
});

// ============================================================================
// TYPESCRIPT INTERFACES (Inferred from Zod schemas)
// ============================================================================

export type BoundingBox = z.infer<typeof BoundingBoxSchema>;
export type GazeDirection = z.infer<typeof GazeDirectionSchema>;
export type DetectionEventMetadata = z.infer<typeof DetectionEventMetadataSchema>;
export type DetectionEvent = z.infer<typeof DetectionEventSchema>;
export type InterviewSession = z.infer<typeof InterviewSessionSchema>;
export type SuspiciousEvent = z.infer<typeof SuspiciousEventSchema>;
export type ManualObservation = z.infer<typeof ManualObservationSchema>;
export type ProctoringReport = z.infer<typeof ProctoringReportSchema>;
export type AuthUser = z.infer<typeof AuthUserSchema>;
export type UserRegistrationInput = z.infer<typeof UserRegistrationSchema>;
export type UserLoginInput = z.infer<typeof UserLoginSchema>;
export type SessionCreationInput = z.infer<typeof SessionCreationSchema>;
export type SessionPairingInput = z.infer<typeof SessionPairingSchema>;
export type JWTPayload = z.infer<typeof JWTPayloadSchema>;
export type ApiResponse<T = any> = {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
};

// ============================================================================
// INPUT VALIDATION SCHEMAS (for API endpoints)
// ============================================================================

// Create Detection Event Input Schema
export const CreateDetectionEventSchema = DetectionEventSchema.omit({
  timestamp: true
}).extend({
  timestamp: z.string().datetime().optional() // Allow string input, will be converted to Date
});

// Create Interview Session Input Schema
export const CreateInterviewSessionSchema = InterviewSessionSchema.omit({
  sessionId: true,
  startTime: true,
  status: true
}).extend({
  startTime: z.string().datetime().optional(),
  status: z.nativeEnum(SessionStatus).optional()
});

// Update Interview Session Input Schema
export const UpdateInterviewSessionSchema = InterviewSessionSchema.partial().omit({
  sessionId: true,
  candidateId: true
});

// Generate Report Input Schema
export const GenerateReportSchema = z.object({
  sessionId: z.string().uuid(),
  includeManualObservations: z.boolean().optional().default(true)
});

// Create Manual Observation Input Schema
export const CreateManualObservationSchema = ManualObservationSchema.omit({
  observationId: true,
  timestamp: true
}).extend({
  timestamp: z.string().datetime().optional()
});

// Report Export Schema
export const ReportExportSchema = z.object({
  reportId: z.string().uuid(),
  format: z.enum(['pdf', 'csv']),
  includeManualObservations: z.boolean().optional().default(true)
});

// Video Upload Schema
export const VideoUploadSchema = z.object({
  sessionId: z.string().uuid(),
  candidateId: z.string().uuid(),
  chunkIndex: z.number().int().min(0),
  totalChunks: z.number().int().positive(),
  filename: z.string().min(1),
  mimeType: z.string().min(1)
});

// Video Metadata Schema
export const VideoMetadataSchema = z.object({
  videoId: z.string().uuid(),
  sessionId: z.string().uuid(),
  candidateId: z.string().uuid(),
  filename: z.string().min(1),
  originalName: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().positive(),
  duration: z.number().positive().optional(),
  resolution: z.object({
    width: z.number().positive(),
    height: z.number().positive()
  }).optional(),
  uploadedAt: z.date(),
  processedAt: z.date().optional(),
  storageUrl: z.string().url(),
  thumbnailUrl: z.string().url().optional()
});

// Export Input Types
export type CreateDetectionEventInput = z.infer<typeof CreateDetectionEventSchema>;
export type CreateInterviewSessionInput = z.infer<typeof CreateInterviewSessionSchema>;
export type UpdateInterviewSessionInput = z.infer<typeof UpdateInterviewSessionSchema>;
export type GenerateReportInput = z.infer<typeof GenerateReportSchema>;
export type CreateManualObservationInput = z.infer<typeof CreateManualObservationSchema>;
export type ReportExportInput = z.infer<typeof ReportExportSchema>;
export type VideoUploadInput = z.infer<typeof VideoUploadSchema>;
export type VideoMetadata = z.infer<typeof VideoMetadataSchema>;

// ============================================================================
// RE-EXPORTS
// ============================================================================

// Export validation utilities
export * from './validation';

// Export API types
export * from './api';

// Export WebSocket types
export * from './websocket';