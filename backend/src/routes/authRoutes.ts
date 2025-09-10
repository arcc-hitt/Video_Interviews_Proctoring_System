import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { User, UserDocument } from '../models';
import { InterviewSession } from '../models/InterviewSession';
import { 
  generateToken, 
  authenticate, 
  authorize, 
  authRateLimit 
} from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import {
  UserRegistrationSchema,
  UserLoginSchema,
  SessionCreationSchema,
  SessionPairingSchema,
  UserRole,
  SessionStatus,
  ApiResponse
} from '../types';

const router = express.Router();

/**
 * POST /api/auth/register
 * Register a new user (candidate or interviewer)
 */
router.post('/register', 
  authRateLimit(10, 15 * 60 * 1000), // 10 attempts per 15 minutes
  validateRequest(UserRegistrationSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password, name, role } = req.body;

      // Check if user already exists
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        const response: ApiResponse = {
          success: false,
          error: 'User with this email already exists'
        };
        res.status(400).json(response);
        return;
      }

      // Create new user
      const userId = uuidv4();
      const user = new User({
        userId,
        email: email.toLowerCase(),
        password,
        name,
        role
      });

      await user.save();

      // Generate JWT token
      const token = generateToken(user);

      // Update last login
      await user.updateLastLogin();

      const response: ApiResponse<{
        user: Omit<UserDocument, 'password'>;
        token: string;
      }> = {
        success: true,
        data: {
          user: user.toJSON(),
          token
        },
        message: 'User registered successfully'
      };

      res.status(201).json(response);
    } catch (error) {
      console.error('Registration error:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Registration failed. Please try again.'
      };
      res.status(500).json(response);
    }
  }
);

/**
 * POST /api/auth/login
 * Authenticate user and return JWT token
 */
router.post('/login',
  authRateLimit(5, 15 * 60 * 1000), // 5 attempts per 15 minutes
  validateRequest(UserLoginSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password } = req.body;

      // Find user by email (include password for comparison)
      const user = await User.findOne({ 
        email: email.toLowerCase(), 
        isActive: true 
      }).select('+password');

      if (!user) {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid email or password'
        };
        res.status(401).json(response);
        return;
      }

      // Check password
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid email or password'
        };
        res.status(401).json(response);
        return;
      }

      // Generate JWT token
      const token = generateToken(user);

      // Update last login
      await user.updateLastLogin();

      const response: ApiResponse<{
        user: Omit<UserDocument, 'password'>;
        token: string;
      }> = {
        success: true,
        data: {
          user: user.toJSON(),
          token
        },
        message: 'Login successful'
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Login error:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Login failed. Please try again.'
      };
      res.status(500).json(response);
    }
  }
);

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get('/me',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const response: ApiResponse<any> = {
        success: true,
        data: req.user!.toJSON(),
        message: 'User profile retrieved successfully'
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Profile retrieval error:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to retrieve user profile'
      };
      res.status(500).json(response);
    }
  }
);

/**
 * POST /api/auth/logout
 * Logout user (client-side token removal, server-side logging)
 */
router.post('/logout',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      // In a more sophisticated implementation, you might maintain a blacklist of tokens
      // For now, we'll just log the logout event
      console.log(`User ${req.user!.email} logged out at ${new Date().toISOString()}`);

      const response: ApiResponse = {
        success: true,
        message: 'Logout successful'
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Logout error:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Logout failed'
      };
      res.status(500).json(response);
    }
  }
);

/**
 * POST /api/auth/sessions/create
 * Create a new interview session (interviewer only)
 */
router.post('/sessions/create',
  authenticate,
  authorize(UserRole.INTERVIEWER, UserRole.ADMIN),
  validateRequest(SessionCreationSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { candidateName, candidateEmail, interviewerUserId } = req.body;

      // Verify interviewer exists and is active
      const interviewer = await User.findOne({ 
        userId: interviewerUserId, 
        role: UserRole.INTERVIEWER,
        isActive: true 
      });

      if (!interviewer) {
        const response: ApiResponse = {
          success: false,
          error: 'Interviewer not found or inactive'
        };
        res.status(404).json(response);
        return;
      }

      // Create candidate user if email is provided and doesn't exist
      let candidateId = uuidv4();
      if (candidateEmail) {
        let candidate = await User.findOne({ email: candidateEmail.toLowerCase() });
        
        if (!candidate) {
          // Create temporary candidate account
          candidate = new User({
            userId: candidateId,
            email: candidateEmail.toLowerCase(),
            password: uuidv4(), // Temporary password
            name: candidateName,
            role: UserRole.CANDIDATE,
            isActive: true
          });
          await candidate.save();
        } else {
          candidateId = candidate.userId;
        }
      }

      // Check if candidate already has an active session
      const existingSession = await InterviewSession.findOne({ 
        candidateId, 
        status: SessionStatus.ACTIVE 
      });
      if (existingSession) {
        const response: ApiResponse = {
          success: false,
          error: 'Candidate already has an active interview session'
        };
        res.status(400).json(response);
        return;
      }

      // Create new interview session
      const sessionId = uuidv4();
      const session = new InterviewSession({
        sessionId,
        candidateId,
        candidateName,
        startTime: new Date(),
        status: SessionStatus.ACTIVE
      });

      await session.save();

      const response: ApiResponse<{
        session: any;
        candidateId: string;
      }> = {
        success: true,
        data: {
          session: session.toJSON(),
          candidateId
        },
        message: 'Interview session created successfully'
      };

      res.status(201).json(response);
    } catch (error) {
      console.error('Session creation error:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to create interview session'
      };
      res.status(500).json(response);
    }
  }
);

/**
 * POST /api/auth/sessions/pair
 * Pair interviewer with candidate session
 */
router.post('/sessions/pair',
  authenticate,
  authorize(UserRole.INTERVIEWER, UserRole.ADMIN),
  validateRequest(SessionPairingSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId, interviewerUserId } = req.body;

      // Verify interviewer exists and is active
      const interviewer = await User.findOne({ 
        userId: interviewerUserId, 
        role: UserRole.INTERVIEWER,
        isActive: true 
      });

      if (!interviewer) {
        const response: ApiResponse = {
          success: false,
          error: 'Interviewer not found or inactive'
        };
        res.status(404).json(response);
        return;
      }

      // Find the session
      const session = await InterviewSession.findOne({ 
        sessionId,
        status: SessionStatus.ACTIVE 
      });

      if (!session) {
        const response: ApiResponse = {
          success: false,
          error: 'Session not found or not active'
        };
        res.status(404).json(response);
        return;
      }

      // In a more complex implementation, you might store interviewer-session relationships
      // For now, we'll just verify the pairing is valid
      const response: ApiResponse<{
        session: any;
        interviewer: any;
        paired: boolean;
      }> = {
        success: true,
        data: {
          session: session.toJSON(),
          interviewer: interviewer.toJSON(),
          paired: true
        },
        message: 'Session paired successfully'
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Session pairing error:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to pair session'
      };
      res.status(500).json(response);
    }
  }
);

/**
 * GET /api/auth/sessions
 * Get sessions for current user
 */
router.get('/sessions',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      let sessions: any[] = [];

      if (req.user!.role === UserRole.CANDIDATE) {
        // Candidates can only see their own sessions
        sessions = await InterviewSession.find({ candidateId: req.user!.userId }).sort({ startTime: -1 });
      } else if (req.user!.role === UserRole.INTERVIEWER) {
        // Interviewers can see all active sessions (in a real app, this would be filtered by assignment)
        sessions = await InterviewSession.find({ status: SessionStatus.ACTIVE }).sort({ startTime: -1 });
      } else if (req.user!.role === UserRole.ADMIN) {
        // Admins can see all sessions
        sessions = await InterviewSession.find().sort({ startTime: -1 });
      }

      const response: ApiResponse<any> = {
        success: true,
        data: sessions,
        message: 'Sessions retrieved successfully'
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Sessions retrieval error:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to retrieve sessions'
      };
      res.status(500).json(response);
    }
  }
);

/**
 * GET /api/auth/sessions/:sessionId
 * Get specific session details
 */
router.get('/sessions/:sessionId',
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;
      
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
          error: 'Access denied. Cannot access this session.'
        };
        res.status(403).json(response);
        return;
      }

      const response: ApiResponse<any> = {
        success: true,
        data: session.toJSON(),
        message: 'Session retrieved successfully'
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Session retrieval error:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to retrieve session'
      };
      res.status(500).json(response);
    }
  }
);

/**
 * PUT /api/auth/sessions/:sessionId/end
 * End an interview session
 */
router.put('/sessions/:sessionId/end',
  authenticate,
  authorize(UserRole.INTERVIEWER, UserRole.ADMIN),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;
      
      const session = await InterviewSession.findOne({ 
        sessionId,
        status: SessionStatus.ACTIVE 
      });

      if (!session) {
        const response: ApiResponse = {
          success: false,
          error: 'Active session not found'
        };
        res.status(404).json(response);
        return;
      }

      // End the session
      session.endTime = new Date();
      session.status = SessionStatus.COMPLETED;
      if (session.endTime && session.startTime) {
        session.duration = Math.floor((session.endTime.getTime() - session.startTime.getTime()) / 1000);
      }
      await session.save();

      const response: ApiResponse<any> = {
        success: true,
        data: session.toJSON(),
        message: 'Session ended successfully'
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Session end error:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to end session'
      };
      res.status(500).json(response);
    }
  }
);

export default router;