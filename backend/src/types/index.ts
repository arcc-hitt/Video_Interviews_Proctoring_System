import { z } from 'zod';

// Core types for the Video Proctoring System Backend

// ============================================================================
// ENUMS
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

// Detection Event Metadata Schema
export const DetectionEventMetadataSchema = z.object({
  gazeDirection: GazeDirectionSchema.optional(),
  objectType: z.nativeEnum(UnauthorizedItemType).optional(),
  boundingBox: BoundingBoxSchema.optional(),
  faceCount: z.number().int().min(0).optional()
});

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
  generatedAt: z.date()
});

// Auth User Schema
export const AuthUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.nativeEnum(UserRole)
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
export type ProctoringReport = z.infer<typeof ProctoringReportSchema>;
export type AuthUser = z.infer<typeof AuthUserSchema>;
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
  sessionId: z.string().uuid()
});

// Export Input Types
export type CreateDetectionEventInput = z.infer<typeof CreateDetectionEventSchema>;
export type CreateInterviewSessionInput = z.infer<typeof CreateInterviewSessionSchema>;
export type UpdateInterviewSessionInput = z.infer<typeof UpdateInterviewSessionSchema>;
export type GenerateReportInput = z.infer<typeof GenerateReportSchema>;

// ============================================================================
// RE-EXPORTS
// ============================================================================

// Export validation utilities
export * from './validation';

// Export API types
export * from './api';