import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { InterviewSession } from '../models/InterviewSession';
import { ManualObservation } from '../models/ManualObservation';
import { authenticate } from '../middleware/auth';
import { 
  SessionCreationSchema, 
  SessionPairingSchema,
  CreateManualObservationSchema,
  ApiResponse,
  SessionStatus,
  UserRole,
  ObservationType,
  Severity
} from '../types';
import { WebSocketService } from '../services/websocketService';

const router = express.Router();

// WebSocket service instance (will be injected)
let wsService: WebSocketService;

export const setWebSocketService = (service: WebSocketService) => {
  wsService = service;
};

// Create a new interview session
router.post('/create', authenticate, async (req, res): Promise<void> => {
  try {
    const validatedData = SessionCreationSchema.parse(req.body);
    const { candidateName, candidateEmail, interviewerUserId } = validatedData;

    // Verify interviewer exists and has correct role
    if (req.user?.role !== UserRole.INTERVIEWER && req.user?.role !== UserRole.ADMIN) {
      const response: ApiResponse = {
        success: false,
        error: 'Unauthorized',
        message: 'Only interviewers can create sessions'
      };
      res.status(403).json(response);
      return;
    }

    // Generate unique session ID
    const sessionId = uuidv4();
    
    // Try to find existing candidate user by email, or generate a new candidateId
    let candidateId = uuidv4(); // Default to new UUID
    
    // Import User model to check for existing candidate
    const { User } = await import('../models');
    
    let candidateUser = null;
    if (candidateEmail) {
      candidateUser = await User.findOne({ 
        email: candidateEmail.toLowerCase(),
        role: UserRole.CANDIDATE 
      });
    }
    
    if (candidateUser) {
      candidateId = candidateUser.userId;
      console.log('Found existing candidate user:', candidateUser.email, 'with ID:', candidateId);
    } else {
      console.log('No existing candidate found for email:', candidateEmail, 'using generated ID:', candidateId);
    }

    // Create new session
    const session = new InterviewSession({
      sessionId,
      candidateId,
      candidateName,
      candidateEmail,
      startTime: new Date(),
      status: SessionStatus.ACTIVE
    });

    await session.save();
    
    console.log('Session created:', { 
      sessionId, 
      candidateId, 
      candidateName, 
      candidateEmail,
      hasExistingUser: !!candidateUser 
    });

    const response: ApiResponse = {
      success: true,
      data: {
        sessionId,
        candidateId,
        candidateName,
        candidateEmail,
        interviewerUserId,
        startTime: session.startTime,
        status: session.status
      },
      message: 'Session created successfully'
    };

    res.status(201).json(response);
  } catch (error) {
    console.error('Error creating session:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Internal server error',
      message: 'Failed to create session'
    };
    res.status(500).json(response);
  }
});

// Get session details
router.get('/:sessionId', authenticate, async (req, res): Promise<void> => {
  try {
    const { sessionId } = req.params;

    const session = await InterviewSession.findOne({ sessionId });
    if (!session) {
      const response: ApiResponse = {
        success: false,
        error: 'Not found',
        message: 'Session not found'
      };
      res.status(404).json(response);
      return;
    }

    // Get connected users if WebSocket service is available
    let connectedUsers = null;
    if (wsService && sessionId) {
      connectedUsers = wsService.getSessionUsers(sessionId);
    }

    const response: ApiResponse = {
      success: true,
      data: {
        ...session.toJSON(),
        connectedUsers
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching session:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Internal server error',
      message: 'Failed to fetch session'
    };
    res.status(500).json(response);
  }
});

// Join session as candidate
router.post('/:sessionId/join', authenticate, async (req, res): Promise<void> => {
  try {
    const { sessionId } = req.params;
    
    // Only candidates can join sessions
    if (req.user?.role !== UserRole.CANDIDATE) {
      const response: ApiResponse = {
        success: false,
        error: 'Forbidden',
        message: 'Only candidates can join sessions'
      };
      res.status(403).json(response);
      return;
    }

    const session = await InterviewSession.findOne({ sessionId });
    if (!session) {
      const response: ApiResponse = {
        success: false,
        error: 'Not found',
        message: 'Session not found'
      };
      res.status(404).json(response);
      return;
    }

    // Check if session is active
    if (session.status !== SessionStatus.ACTIVE) {
      const response: ApiResponse = {
        success: false,
        error: 'Session not active',
        message: 'Session is not active'
      };
      res.status(400).json(response);
      return;
    }

    // Update candidateId to match the authenticated user
    // This ensures that the user can post events to this session
    const previousCandidateId = session.candidateId;
    session.candidateId = req.user.userId;
    await session.save();
    
    console.log('Candidate joined session:', {
      sessionId,
      previousCandidateId,
      newCandidateId: req.user.userId,
      candidateEmail: req.user.email
    });

    // Broadcast that candidate joined via WebSocket
    if (wsService && sessionId) {
      wsService.broadcastToSession(sessionId, 'candidate_joined', {
        sessionId,
        candidateId: req.user.userId,
        candidateName: req.user.name,
        candidateEmail: req.user.email,
        timestamp: new Date().toISOString()
      });
    }

    const response: ApiResponse = {
      success: true,
      data: {
        ...session.toJSON(),
        message: 'Successfully joined session'
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error joining session:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Internal server error',
      message: 'Failed to join session'
    };
    res.status(500).json(response);
  }
});

// Update session status
router.patch('/:sessionId/status', authenticate, async (req, res): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const { status } = req.body;

    if (!Object.values(SessionStatus).includes(status)) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid status',
        message: 'Status must be active, completed, or terminated'
      };
      res.status(400).json(response);
      return;
    }

    const session = await InterviewSession.findOne({ sessionId });
    if (!session) {
      const response: ApiResponse = {
        success: false,
        error: 'Not found',
        message: 'Session not found'
      };
      res.status(404).json(response);
      return;
    }

    // Update session
    session.status = status;
    if (status !== SessionStatus.ACTIVE) {
      session.endTime = new Date();
      const startTime = session.startTime.getTime();
      const endTime = session.endTime.getTime();
      session.duration = Math.floor((endTime - startTime) / 1000);
    }

    await session.save();

    // Broadcast status update via WebSocket
    if (wsService && sessionId) {
      wsService.broadcastToSession(sessionId, 'session_status_update', {
        sessionId,
        status,
        updatedBy: req.user?.userId,
        timestamp: new Date().toISOString()
      });
    }

    const response: ApiResponse = {
      success: true,
      data: session.toJSON(),
      message: 'Session status updated successfully'
    };

    res.json(response);
  } catch (error) {
    console.error('Error updating session status:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Internal server error',
      message: 'Failed to update session status'
    };
    res.status(500).json(response);
  }
});

// End session
router.post('/:sessionId/end', authenticate, async (req, res): Promise<void> => {
  try {
    const { sessionId } = req.params;

    const session = await InterviewSession.findOne({ sessionId });
    if (!session) {
      const response: ApiResponse = {
        success: false,
        error: 'Not found',
        message: 'Session not found'
      };
      res.status(404).json(response);
      return;
    }

    // End the session
    session.endTime = new Date();
    session.status = SessionStatus.COMPLETED;
    const startTime = session.startTime.getTime();
    const endTime = session.endTime.getTime();
    session.duration = Math.floor((endTime - startTime) / 1000);
    await session.save();

    // Broadcast session end via WebSocket
    if (wsService && sessionId) {
      wsService.broadcastToSession(sessionId, 'session_status_update', {
        sessionId,
        status: SessionStatus.COMPLETED,
        updatedBy: req.user?.userId,
        timestamp: new Date().toISOString()
      });
    }

    const response: ApiResponse = {
      success: true,
      data: session.toJSON(),
      message: 'Session ended successfully'
    };

    res.json(response);
  } catch (error) {
    console.error('Error ending session:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Internal server error',
      message: 'Failed to end session'
    };
    res.status(500).json(response);
  }
});

// Terminate session
router.post('/:sessionId/terminate', authenticate, async (req, res): Promise<void> => {
  try {
    const { sessionId } = req.params;

    const session = await InterviewSession.findOne({ sessionId });
    if (!session) {
      const response: ApiResponse = {
        success: false,
        error: 'Not found',
        message: 'Session not found'
      };
      res.status(404).json(response);
      return;
    }

    // Terminate the session
    session.endTime = new Date();
    session.status = SessionStatus.TERMINATED;
    const startTime = session.startTime.getTime();
    const endTime = session.endTime.getTime();
    session.duration = Math.floor((endTime - startTime) / 1000);
    await session.save();

    // Broadcast session termination via WebSocket
    if (wsService && sessionId) {
      wsService.broadcastToSession(sessionId, 'session_status_update', {
        sessionId,
        status: SessionStatus.TERMINATED,
        updatedBy: req.user?.userId,
        timestamp: new Date().toISOString()
      });
    }

    const response: ApiResponse = {
      success: true,
      data: session.toJSON(),
      message: 'Session terminated successfully'
    };

    res.json(response);
  } catch (error) {
    console.error('Error terminating session:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Internal server error',
      message: 'Failed to terminate session'
    };
    res.status(500).json(response);
  }
});

// Create manual observation/flag
router.post('/:sessionId/observations', authenticate, async (req, res): Promise<void> => {
  try {
    const { sessionId } = req.params;
    
    // Verify user is an interviewer
    if (req.user?.role !== UserRole.INTERVIEWER && req.user?.role !== UserRole.ADMIN) {
      const response: ApiResponse = {
        success: false,
        error: 'Unauthorized',
        message: 'Only interviewers can create observations'
      };
      res.status(403).json(response);
      return;
    }

    // Validate session exists
    const session = await InterviewSession.findOne({ sessionId });
    if (!session) {
      const response: ApiResponse = {
        success: false,
        error: 'Not found',
        message: 'Session not found'
      };
      res.status(404).json(response);
      return;
    }

    const validatedData = CreateManualObservationSchema.parse({
      ...req.body,
      sessionId,
      interviewerId: req.user.userId
    });

    // Create manual observation
    const observation = new ManualObservation({
      observationId: uuidv4(),
      sessionId: validatedData.sessionId,
      interviewerId: validatedData.interviewerId,
      timestamp: validatedData.timestamp ? new Date(validatedData.timestamp) : new Date(),
      observationType: validatedData.observationType,
      description: validatedData.description,
      severity: validatedData.severity,
      flagged: validatedData.flagged
    });

    await observation.save();

    // Broadcast manual flag via WebSocket
    if (wsService && sessionId) {
      wsService.broadcastToSession(sessionId, 'manual_flag_broadcast', {
        sessionId,
        interviewerId: req.user.userId,
        timestamp: observation.timestamp.toISOString(),
        flagType: observation.observationType,
        description: observation.description,
        severity: observation.severity
      });
    }

    const response: ApiResponse = {
      success: true,
      data: observation.toJSON(),
      message: 'Manual observation created successfully'
    };

    res.status(201).json(response);
  } catch (error) {
    console.error('Error creating manual observation:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Internal server error',
      message: 'Failed to create manual observation'
    };
    res.status(500).json(response);
  }
});

// Get session observations
router.get('/:sessionId/observations', authenticate, async (req, res): Promise<void> => {
  try {
    const { sessionId } = req.params;

    // Validate session exists
    const session = await InterviewSession.findOne({ sessionId });
    if (!session) {
      const response: ApiResponse = {
        success: false,
        error: 'Not found',
        message: 'Session not found'
      };
      res.status(404).json(response);
      return;
    }

    const observations = await ManualObservation.find({ sessionId }).sort({ timestamp: -1 });

    const response: ApiResponse = {
      success: true,
      data: observations.map(obs => obs.toJSON())
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching observations:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Internal server error',
      message: 'Failed to fetch observations'
    };
    res.status(500).json(response);
  }
});

// Get active sessions
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    const query: any = {};
    if (status && Object.values(SessionStatus).includes(status as SessionStatus)) {
      query.status = status;
    }

    const sessions = await InterviewSession.find(query)
      .sort({ startTime: -1 })
      .limit(Number(limit))
      .skip(Number(offset));

    const total = await InterviewSession.countDocuments(query);

    // Add connected users info if WebSocket service is available
    const sessionsWithUsers = sessions.map(session => {
      const sessionData = session.toJSON() as any;
      if (wsService) {
        sessionData.connectedUsers = wsService.getSessionUsers(session.sessionId);
      }
      return sessionData;
    });

    const response: ApiResponse = {
      success: true,
      data: {
        sessions: sessionsWithUsers,
        pagination: {
          total,
          limit: Number(limit),
          offset: Number(offset),
          hasMore: Number(offset) + sessions.length < total
        }
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Internal server error',
      message: 'Failed to fetch sessions'
    };
    res.status(500).json(response);
  }
});

// Get WebSocket statistics
router.get('/stats/websocket', authenticate, async (req, res): Promise<void> => {
  try {
    if (!wsService) {
      const response: ApiResponse = {
        success: false,
        error: 'Service unavailable',
        message: 'WebSocket service not available'
      };
      res.status(503).json(response);
      return;
    }

    const stats = wsService.getStats();

    const response: ApiResponse = {
      success: true,
      data: stats
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching WebSocket stats:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Internal server error',
      message: 'Failed to fetch WebSocket statistics'
    };
    res.status(500).json(response);
  }
});

export default router;