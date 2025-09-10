import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import { User, UserDocument } from '../models';
import { ApiResponse, UserRole, JWTPayload } from '../types';

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: UserDocument;
    }
  }
}

// JWT secret from environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/**
 * Generate JWT token for user
 */
export const generateToken = (user: UserDocument): string => {
  const payload = {
    userId: user.userId,
    email: user.email,
    role: user.role
  };

  const options: jwt.SignOptions = {
    expiresIn: '24h'
  };

  return jwt.sign(payload, JWT_SECRET as string, options);
};

/**
 * Verify JWT token and extract user information
 */
export const verifyToken = (token: string): JWTPayload => {
  try {
    return jwt.verify(token, JWT_SECRET as string) as JWTPayload;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};

/**
 * Authentication middleware - verifies JWT token and attaches user to request
 */
export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const response: ApiResponse = {
        success: false,
        error: 'Access denied. No token provided.'
      };
      res.status(401).json(response);
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = verifyToken(token);

    // Find user in database
    const user = await User.findOne({ 
      userId: decoded.userId, 
      isActive: true 
    }).select('+password');

    if (!user) {
      const response: ApiResponse = {
        success: false,
        error: 'User not found or inactive.'
      };
      res.status(401).json(response);
      return;
    }

    // Attach user to request object
    req.user = user;
    next();
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Authentication failed'
    };
    res.status(401).json(response);
  }
};

/**
 * Authorization middleware - checks if user has required role(s)
 */
export const authorize = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      const response: ApiResponse = {
        success: false,
        error: 'Access denied. User not authenticated.'
      };
      res.status(401).json(response);
      return;
    }

    if (!roles.includes(req.user.role)) {
      const response: ApiResponse = {
        success: false,
        error: 'Access denied. Insufficient permissions.'
      };
      res.status(403).json(response);
      return;
    }

    next();
  };
};

/**
 * Optional authentication middleware - attaches user if token is valid, but doesn't require it
 */
export const optionalAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = verifyToken(token);
      
      const user = await User.findOne({ 
        userId: decoded.userId, 
        isActive: true 
      });

      if (user) {
        req.user = user;
      }
    }
    next();
  } catch (error) {
    // Continue without authentication if token is invalid
    next();
  }
};

/**
 * Middleware to check if user can access specific session
 */
export const canAccessSession = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    const response: ApiResponse = {
      success: false,
      error: 'Authentication required.'
    };
    res.status(401).json(response);
    return;
  }

  const { sessionId } = req.params;
  const { candidateId } = req.query;

  // Admins can access any session
  if (req.user.role === UserRole.ADMIN) {
    next();
    return;
  }

  // Interviewers can access sessions they're assigned to (this will be checked in the route handler)
  if (req.user.role === UserRole.INTERVIEWER) {
    next();
    return;
  }

  // Candidates can only access their own sessions
  if (req.user.role === UserRole.CANDIDATE) {
    if (candidateId && req.user.userId === candidateId) {
      next();
      return;
    }
  }

  const response: ApiResponse = {
    success: false,
    error: 'Access denied. Cannot access this session.'
  };
  res.status(403).json(response);
};

/**
 * Rate limiting middleware for authentication endpoints
 */
export const authRateLimit = (maxAttempts: number = 5, windowMs: number = 15 * 60 * 1000) => {
  const attempts = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const clientId = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();

    // Clean up expired entries
    for (const [key, value] of attempts.entries()) {
      if (now > value.resetTime) {
        attempts.delete(key);
      }
    }

    const clientAttempts = attempts.get(clientId);

    if (!clientAttempts) {
      attempts.set(clientId, { count: 1, resetTime: now + windowMs });
      next();
      return;
    }

    if (clientAttempts.count >= maxAttempts) {
      const response: ApiResponse = {
        success: false,
        error: 'Too many authentication attempts. Please try again later.'
      };
      res.status(429).json(response);
      return;
    }

    clientAttempts.count++;
    next();
  };
};