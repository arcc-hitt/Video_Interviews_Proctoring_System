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
        // Allow candidates to log events if:
        // 1. Their userId matches the session's candidateId, OR
        // 2. Their email matches the session's candidateEmail, OR
        // 3. They are participating in the session via WebSocket (we can add this check later)
        const userIdMatches = session.candidateId === req.user!.userId;
        const emailMatches = session.candidateEmail && session.candidateEmail === req.user!.email;
        const eventCandidateMatches = eventData.candidateId === req.user!.userId;
        
        if (!userIdMatches && !emailMatches && !eventCandidateMatches) {
          console.log('Access denied for candidate - no matching credentials:', {
            sessionId: eventData.sessionId,
            userId: req.user!.userId,
            sessionCandidateId: session.candidateId,
            userEmail: req.user!.email,
            sessionEmail: session.candidateEmail
          });
          const response: ApiResponse = {
            success: false,
            error: 'Access denied. Cannot log events for this session.'
          };
          res.status(403).json(response);
          return;
        }
        
        // If the candidate is authorized but the event candidateId doesn't match,
        // update the event candidateId to match the authenticated user
        if (eventData.candidateId !== req.user!.userId) {
          console.log('Updating event candidateId from', eventData.candidateId, 'to', req.user!.userId);
          eventData.candidateId = req.user!.userId;
        }
      }

      // Create the detection event
      const detectionEvent = new DetectionEvent({
        ...eventData,
        timestamp
      });

      await detectionEvent.save();

      console.log('Detection event saved successfully:', {
        sessionId: eventData.sessionId,
        eventType: eventData.eventType,
        candidateId: eventData.candidateId
      });

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
      } = req.query as any;

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

      // Deduct points based on violations
      integrityScore -= focusLossCount * 2; // 2 points per focus loss
      integrityScore -= absenceCount * 5; // 5 points per absence
      integrityScore -= multipleFacesCount * 10; // 10 points per multiple faces
      integrityScore -= unauthorizedItemsCount * 15; // 15 points per unauthorized item

      integrityScore = Math.max(0, integrityScore); // Ensure score doesn't go below 0

      const summary = {
        sessionId,
        candidateId: session.candidateId,
        candidateName: session.candidateName,
        sessionDuration,
        totalEvents,
        integrityScore,
        eventsByType: summaryByType,
        counts: {
          focusLoss: focusLossCount,
          absence: absenceCount,
          multipleFaces: multipleFacesCount,
          unauthorizedItems: unauthorizedItemsCount
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
      } = req.query as any;

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