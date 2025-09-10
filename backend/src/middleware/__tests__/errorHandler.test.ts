import { Request, Response, NextFunction } from 'express';
import { errorHandler, CustomError, ValidationError, AuthenticationError, NotFoundError } from '../errorHandler';

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn()
  }
}));

describe('Error Handler Middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {
      url: '/test',
      method: 'GET',
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('test-user-agent'),
      headers: {
        'x-session-id': 'test-session',
        'x-request-id': 'test-request'
      }
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    next = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('CustomError', () => {
    it('should create error with status code and operational flag', () => {
      const error = new CustomError('Test error', 400, true);
      
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(400);
      expect(error.isOperational).toBe(true);
      expect(error.name).toBe('CustomError');
    });

    it('should create error with default values', () => {
      const error = new CustomError('Test error');
      
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(true);
    });
  });

  describe('Specific Error Types', () => {
    it('should create ValidationError with correct properties', () => {
      const error = new ValidationError('Invalid input', 'field');
      
      expect(error.message).toBe('Invalid input');
      expect(error.statusCode).toBe(400);
      expect(error.name).toBe('ValidationError');
      expect(error.code).toBe('VALIDATION_ERROR');
    });

    it('should create AuthenticationError with correct properties', () => {
      const error = new AuthenticationError('Invalid credentials');
      
      expect(error.message).toBe('Invalid credentials');
      expect(error.statusCode).toBe(401);
      expect(error.name).toBe('AuthenticationError');
      expect(error.code).toBe('AUTH_ERROR');
    });

    it('should create NotFoundError with correct properties', () => {
      const error = new NotFoundError('User');
      
      expect(error.message).toBe('User not found');
      expect(error.statusCode).toBe(404);
      expect(error.name).toBe('NotFoundError');
      expect(error.code).toBe('NOT_FOUND');
    });
  });

  describe('Error Handler Middleware', () => {
    it('should handle CustomError correctly', () => {
      const error = new CustomError('Test error', 400);
      
      errorHandler(error, req as Request, res as Response, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Test error',
          code: 'INTERNAL_ERROR',
          statusCode: 400
        }
      });
    });

    it('should handle ValidationError correctly', () => {
      const error = new ValidationError('Invalid input');
      
      errorHandler(error, req as Request, res as Response, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Invalid input',
          code: 'VALIDATION_ERROR',
          statusCode: 400
        }
      });
    });

    it('should handle Mongoose CastError', () => {
      const error = new Error('Cast to ObjectId failed');
      error.name = 'CastError';
      
      errorHandler(error, req as Request, res as Response, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Invalid ID format',
          code: 'INVALID_ID',
          statusCode: 400
        }
      });
    });

    it('should handle JWT errors', () => {
      const error = new Error('Invalid token');
      error.name = 'JsonWebTokenError';
      
      errorHandler(error, req as Request, res as Response, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Invalid token',
          code: 'INVALID_TOKEN',
          statusCode: 401
        }
      });
    });

    it('should handle TokenExpiredError', () => {
      const error = new Error('Token expired');
      error.name = 'TokenExpiredError';
      
      errorHandler(error, req as Request, res as Response, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Token expired',
          code: 'TOKEN_EXPIRED',
          statusCode: 401
        }
      });
    });

    it('should handle MulterError', () => {
      const error = new Error('File too large');
      error.name = 'MulterError';
      
      errorHandler(error, req as Request, res as Response, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'File upload error',
          code: 'UPLOAD_ERROR',
          statusCode: 400
        }
      });
    });

    it('should include validation errors when available', () => {
      const error = new ValidationError('Validation failed');
      (error as any).errors = { field: 'Field is required' };
      
      errorHandler(error, req as Request, res as Response, next);
      
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          validation: { field: 'Field is required' }
        }
      });
    });

    it('should include stack trace in development mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      const error = new CustomError('Test error', 500);
      
      errorHandler(error, req as Request, res as Response, next);
      
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Test error',
          code: 'INTERNAL_ERROR',
          statusCode: 500,
          stack: expect.any(String),
          details: {
            name: 'CustomError',
            originalError: error
          }
        }
      });
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should not include stack trace in production mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const error = new CustomError('Test error', 500);
      
      errorHandler(error, req as Request, res as Response, next);
      
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Test error',
          code: 'INTERNAL_ERROR',
          statusCode: 500
        }
      });
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should handle unknown errors with default values', () => {
      const error = new Error('Unknown error');
      
      errorHandler(error, req as Request, res as Response, next);
      
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Unknown error',
          code: 'INTERNAL_ERROR',
          statusCode: 500
        }
      });
    });
  });
});
