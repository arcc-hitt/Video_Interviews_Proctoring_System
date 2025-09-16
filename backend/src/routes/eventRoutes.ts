import express, { Request, Response } from 'express';
import { DetectionEvent } from '../models/DetectionEvent';
import { InterviewSession } from '../models/InterviewSession';
import { authenticate, authorize } from '../middleware/auth';
import { validateRequest, validateParams, validateQuery } from '../middleware/validation';
import {
  CreateDetectionEventSchema,
  EventQuerySchema,
  SessionParamsSchema,
  UserRole,
  EventType,
  ApiResponse,
  PaginatedDetectionEvents,
  Pagination
} from '../types';

const router = express.Router();

/**
 * POST /api/events
 * Create a new detection event (real-time event logging)
 */
router.post('/',
  authenticate,
  validateRequest(CreateDetectionEventSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const eventData = req.body;
      
      // Convert timestamp string to Date if provided, otherwise use current time
      const timestamp = eventData.timestamp ? new Date(eventData.timestamp) : new Date();
      
      // Verify session exists and is active
      const session = await InterviewSession.findOne({ 
        sessionId: eventData.sessionId 
      });
      
      if (!session) {
        const response: ApiResponse = {
          success: false,
          error: 'Session not found'
        };
        res.status(404).json(response);
        return;
      }

      // Check if user has permission to log events for this session
      if (req.user!.role === UserRole.CANDIDATE) {
        // Strict rule: candidate can only log events for themselves in their own session
        const isSessionCandidate = session.candidateId === req.user!.userId;
        const isEventForSelf = eventData.candidateId === req.user!.userId;

        if (!isSessionCandidate || !isEventForSelf) {
          const response: ApiResponse = {
            success: false,
            error: 'Access denied. Cannot log events for this session.'
          };
          res.status(403).json(response);
          return;
        }
      }

      // Create the detection event
      const detectionEvent = new DetectionEvent({
        ...eventData,
        timestamp
      });

      await detectionEvent.save();

      const response: ApiResponse<any> = {
        success: true,
        data: detectionEvent.toJSON(),
        message: 'Detection event logged successfully'
      };

      res.status(201).json(response);
    } catch (error) {
      console.error('Event logging error:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to log detection event'
      };
      res.status(500).json(response);
    }
  }
);

/**
 * GET /api/events/:sessionId
 * Retrieve all events for a specific session with filtering and pagination
 */
router.get('/:sessionId',
  authenticate,
  validateParams(SessionParamsSchema),
  validateQuery(EventQuerySchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;
      const { 
        page = 1, 
        limit = 50, 
        eventType, 
        startDate, 
        endDate 
      } = (req as any).validatedQuery;

      // Verify session exists
      const session = await InterviewSession.findOne({ sessionId });
      if (!session) {
        const response: ApiResponse = {
          success: false,
          error: 'Session not found'
        };
        res.status(404).json(response);
        return;
      }

      // Check access permissions
      if (req.user!.role === UserRole.CANDIDATE && session.candidateId !== req.user!.userId) {
        const response: ApiResponse = {
          success: false,
          error: 'Access denied. Cannot access events for this session.'
        };
        res.status(403).json(response);
        return;
      }

      // Build query filters
      const filters: any = { sessionId };
      
      if (eventType) {
        filters.eventType = eventType;
      }
      
      if (startDate || endDate) {
        filters.timestamp = {};
        if (startDate) {
          filters.timestamp.$gte = new Date(startDate);
        }
        if (endDate) {
          filters.timestamp.$lte = new Date(endDate);
        }
      }

      // Calculate pagination
      const skip = (page - 1) * limit;
      
      // Get total count for pagination
      const total = await DetectionEvent.countDocuments(filters);
      const totalPages = Math.ceil(total / limit);

      // Fetch events with pagination and sorting
      const events = await DetectionEvent.find(filters)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const pagination: Pagination = {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages
      };

      const response: ApiResponse<PaginatedDetectionEvents> = {
        success: true,
        data: {
          items: events,
          pagination
        },
        message: 'Events retrieved successfully'
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Event retrieval error:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to retrieve events'
      };
      res.status(500).json(response);
    }
  }
);

/**
 * GET /api/events/:sessionId/summary
 * Get aggregated event summary for a session
 */
router.get('/:sessionId/summary',
  authenticate,
  validateParams(SessionParamsSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        const response: ApiResponse = {
          success: false,
          error: 'Session ID is required'
        };
        res.status(400).json(response);
        return;
      }

      // Verify session exists
      const session = await InterviewSession.findOne({ sessionId });
      if (!session) {
        const response: ApiResponse = {
          success: false,
          error: 'Session not found'
        };
        res.status(404).json(response);
        return;
      }

      // Check access permissions
      if (req.user!.role === UserRole.CANDIDATE && session.candidateId !== req.user!.userId) {
        const response: ApiResponse = {
          success: false,
          error: 'Access denied. Cannot access events for this session.'
        };
        res.status(403).json(response);
        return;
      }

      // Get event summary using the model's static method
      const eventSummary = await DetectionEvent.getEventSummary(sessionId);

      // Get total event count
      const totalEvents = await DetectionEvent.countDocuments({ sessionId });

      // Calculate session duration
      const sessionDuration = session.duration || 
        (session.endTime && session.startTime ? 
          Math.floor((session.endTime.getTime() - session.startTime.getTime()) / 1000) : 
          Math.floor((new Date().getTime() - session.startTime.getTime()) / 1000));

      // Transform aggregation results into a more readable format
      const summaryByType: Record<string, any> = {};
      eventSummary.forEach((item: any) => {
        summaryByType[item._id] = {
          eventType: item._id,
          count: item.count,
          totalDuration: item.totalDuration || 0,
          averageConfidence: Math.round(item.avgConfidence * 100) / 100,
          firstOccurrence: item.firstOccurrence,
          lastOccurrence: item.lastOccurrence
        };
      });

      // Calculate integrity score (basic implementation)
      let integrityScore = 100;
  const focusLossCount = summaryByType[EventType.FOCUS_LOSS]?.count || 0;
      const absenceCount = summaryByType[EventType.ABSENCE]?.count || 0;
      const multipleFacesCount = summaryByType[EventType.MULTIPLE_FACES]?.count || 0;
      const unauthorizedItemsCount = summaryByType[EventType.UNAUTHORIZED_ITEM]?.count || 0;
  const drowsinessCount = summaryByType[EventType.DROWSINESS]?.count || 0;
  const eyeClosureCount = summaryByType[EventType.EYE_CLOSURE]?.count || 0;
  const excessiveBlinkingCount = summaryByType[EventType.EXCESSIVE_BLINKING]?.count || 0;
  const backgroundVoiceCount = summaryByType[EventType.BACKGROUND_VOICE]?.count || 0;
  const multipleVoicesCount = summaryByType[EventType.MULTIPLE_VOICES]?.count || 0;
  const excessiveNoiseCount = summaryByType[EventType.EXCESSIVE_NOISE]?.count || 0;

      // Calculate individual deductions
      const focusLossDeduction = focusLossCount * 2;
      const absenceDeduction = absenceCount * 5;
      const multipleFacesDeduction = multipleFacesCount * 10;
      const unauthorizedItemsDeduction = unauthorizedItemsCount * 15;

      // Deduct points based on violations
      integrityScore -= focusLossDeduction; // 2 points per focus loss
      integrityScore -= absenceDeduction; // 5 points per absence
      integrityScore -= multipleFacesDeduction; // 10 points per multiple faces
      integrityScore -= unauthorizedItemsDeduction; // 15 points per unauthorized item

      integrityScore = Math.max(0, integrityScore); // Ensure score doesn't go below 0

      // Calculate detailed breakdown
      const totalDeductions = focusLossDeduction + absenceDeduction + multipleFacesDeduction + unauthorizedItemsDeduction;
      
      // Create readable formula
      const deductionParts = [];
      if (focusLossDeduction > 0) deductionParts.push(`${focusLossCount} focus loss (${focusLossDeduction})`);
      if (absenceDeduction > 0) deductionParts.push(`${absenceCount} absence (${absenceDeduction})`);
      if (multipleFacesDeduction > 0) deductionParts.push(`${multipleFacesCount} multiple faces (${multipleFacesDeduction})`);
      if (unauthorizedItemsDeduction > 0) deductionParts.push(`${unauthorizedItemsCount} unauthorized items (${unauthorizedItemsDeduction})`);
      
      const formula = deductionParts.length > 0 
        ? `100 - [${deductionParts.join(' + ')}] = ${integrityScore}`
        : `100 - 0 = ${integrityScore}`;

      const integrityBreakdown = {
        baseScore: 100,
        deductions: {
          focusLoss: focusLossDeduction,
          absence: absenceDeduction,
          multipleFaces: multipleFacesDeduction,
          unauthorizedItems: unauthorizedItemsDeduction,
          manualObservations: 0, // Not calculated in real-time summary
          total: totalDeductions
        },
        finalScore: integrityScore,
        formula
      };

      const summary = {
        sessionId,
        candidateId: session.candidateId,
        candidateName: session.candidateName,
        sessionDuration,
        totalEvents,
        integrityScore,
        integrityBreakdown,
        eventsByType: summaryByType,
        counts: {
          focusLoss: focusLossCount,
          absence: absenceCount,
          multipleFaces: multipleFacesCount,
          unauthorizedItems: unauthorizedItemsCount,
          drowsiness: drowsinessCount,
          eyeClosure: eyeClosureCount,
          excessiveBlinking: excessiveBlinkingCount,
          backgroundVoice: backgroundVoiceCount,
          multipleVoices: multipleVoicesCount,
          excessiveNoise: excessiveNoiseCount
        }
      };

      const response: ApiResponse<any> = {
        success: true,
        data: summary,
        message: 'Event summary retrieved successfully'
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Event summary error:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to retrieve event summary'
      };
      res.status(500).json(response);
    }
  }
);

/**
 * GET /api/events/candidate/:candidateId
 * Get all events for a specific candidate across all sessions
 */
router.get('/candidate/:candidateId',
  authenticate,
  authorize(UserRole.INTERVIEWER, UserRole.ADMIN),
  validateQuery(EventQuerySchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { candidateId } = req.params;
      const { 
        page = 1, 
        limit = 50, 
        eventType, 
        startDate, 
        endDate 
      } = (req as any).validatedQuery;

      // Build query filters
      const filters: any = { candidateId };
      
      if (eventType) {
        filters.eventType = eventType;
      }
      
      if (startDate || endDate) {
        filters.timestamp = {};
        if (startDate) {
          filters.timestamp.$gte = new Date(startDate);
        }
        if (endDate) {
          filters.timestamp.$lte = new Date(endDate);
        }
      }

      // Calculate pagination
      const skip = (page - 1) * limit;
      
      // Get total count for pagination
      const total = await DetectionEvent.countDocuments(filters);
      const totalPages = Math.ceil(total / limit);

      // Fetch events with pagination and sorting
      const events = await DetectionEvent.find(filters)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const pagination: Pagination = {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages
      };

      const response: ApiResponse<PaginatedDetectionEvents> = {
        success: true,
        data: {
          items: events,
          pagination
        },
        message: 'Candidate events retrieved successfully'
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Candidate events retrieval error:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to retrieve candidate events'
      };
      res.status(500).json(response);
    }
  }
);

/**
 * DELETE /api/events/:sessionId
 * Delete all events for a session (admin only)
 */
router.delete('/:sessionId',
  authenticate,
  authorize(UserRole.ADMIN),
  validateParams(SessionParamsSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;

      // Verify session exists
      const session = await InterviewSession.findOne({ sessionId });
      if (!session) {
        const response: ApiResponse = {
          success: false,
          error: 'Session not found'
        };
        res.status(404).json(response);
        return;
      }

      // Delete all events for the session
      const deleteResult = await DetectionEvent.deleteMany({ sessionId });

      const response: ApiResponse<any> = {
        success: true,
        data: {
          deletedCount: deleteResult.deletedCount,
          sessionId
        },
        message: `Successfully deleted ${deleteResult.deletedCount} events for session`
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Event deletion error:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to delete events'
      };
      res.status(500).json(response);
    }
  }
);

export default router;