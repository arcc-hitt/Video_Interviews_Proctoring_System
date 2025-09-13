import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { z } from 'zod';
import { ValidationError } from './errorHandler';
import { logger } from '../utils/logger';

// Common validation schemas
export const commonSchemas = {
  objectId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/).required(),
  sessionId: Joi.string().uuid().required(),
  timestamp: Joi.date().iso().required(),
  confidence: Joi.number().min(0).max(1).required(),
  eventType: Joi.string().valid(
    'focus-loss',
    'absence',
    'face-visible',
    'multiple-faces',
    'unauthorized-item',
    'drowsiness',
    'eye-closure',
    'excessive-blinking',
    'background-voice',
    'multiple-voices',
    'excessive-noise',
    'face_detection',
    'object_detection',
    'inactivity',
    'manual_flag',
    'session_start',
    'session_end',
    'heartbeat'
  ).required()
};

// Validation middleware factory
export const validate = (schema: Joi.ObjectSchema, property: 'body' | 'query' | 'params' = 'body') => {
  return (req: Request, res: Response, next: NextFunction) => {
    const data = req[property];
    
    const { error, value } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const validationErrors = error.details.map((detail: any) => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      logger.warn('Validation Error', {
        errors: validationErrors,
        url: req.url,
        method: req.method,
        ip: req.ip
      });

      throw new ValidationError('Validation failed', JSON.stringify(validationErrors));
    }

    // Replace the original data with sanitized data
    req[property] = value;
    next();
  };
};

// Sanitization middleware
export const sanitize = (req: Request, res: Response, next: NextFunction) => {
  const sanitizeObject = (obj: any): any => {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      // Remove potentially dangerous characters
      return obj
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<[^>]*>/g, '')
        .trim();
    }

    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }

    if (typeof obj === 'object') {
      const sanitized: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          // Sanitize the key as well
          const sanitizedKey = key.replace(/[^a-zA-Z0-9_]/g, '');
          sanitized[sanitizedKey] = sanitizeObject(obj[key]);
        }
      }
      return sanitized;
    }

    return obj;
  };

  // Sanitize request body, query, and params
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }

  next();
};

// Input length validation
export const validateInputLength = (maxLength: number = 1000) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const checkLength = (obj: any, path: string = ''): void => {
      if (typeof obj === 'string' && obj.length > maxLength) {
        throw new ValidationError(`Input too long: ${path} exceeds ${maxLength} characters`);
      }
      
      if (Array.isArray(obj)) {
        obj.forEach((item, index) => checkLength(item, `${path}[${index}]`));
      }
      
      if (obj && typeof obj === 'object') {
        Object.keys(obj).forEach(key => checkLength(obj[key], path ? `${path}.${key}` : key));
      }
    };

    checkLength(req.body, 'body');
    checkLength(req.query, 'query');
    checkLength(req.params, 'params');

      next();
  };
};

// File upload validation
export const validateFileUpload = (options: {
  maxSize?: number;
  allowedTypes?: string[];
  maxFiles?: number;
} = {}) => {
  const { maxSize = 10 * 1024 * 1024, allowedTypes = ['image/jpeg', 'image/png', 'video/mp4'], maxFiles = 1 } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.files || (Array.isArray(req.files) && req.files.length === 0)) {
      return next();
    }

    const files = Array.isArray(req.files) ? req.files : Object.values(req.files).flat();

    if (files.length > maxFiles) {
      throw new ValidationError(`Too many files. Maximum allowed: ${maxFiles}`);
    }

    for (const file of files) {
      if (file.size > maxSize) {
        throw new ValidationError(`File too large. Maximum size: ${maxSize / (1024 * 1024)}MB`);
      }

      if (!allowedTypes.includes(file.mimetype)) {
        throw new ValidationError(`Invalid file type. Allowed types: ${allowedTypes.join(', ')}`);
      }
    }

    next();
  };
};

// Rate limiting validation
export const validateRateLimit = (windowMs: number = 15 * 60 * 1000, maxRequests: number = 100) => {
  const requests = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean up old entries
    for (const [ip, data] of requests.entries()) {
      if (data.resetTime < windowStart) {
        requests.delete(ip);
      }
    }

    const current = requests.get(key);
    
    if (!current) {
      requests.set(key, { count: 1, resetTime: now });
      return next();
    }

    if (current.resetTime < windowStart) {
      requests.set(key, { count: 1, resetTime: now });
      return next();
    }

    if (current.count >= maxRequests) {
      logger.warn('Rate limit exceeded', {
        ip: key,
        count: current.count,
        maxRequests,
        windowMs
      });
      
      throw new ValidationError('Too many requests. Please try again later.');
    }

    current.count++;
    next();
  };
};

// Specific validation schemas for different endpoints
export const authSchemas = {
  login: Joi.object({
    email: commonSchemas.email,
    password: Joi.string().required()
  }),

  register: Joi.object({
    name: Joi.string().min(2).max(50).required(),
    email: commonSchemas.email,
    password: commonSchemas.password,
    role: Joi.string().valid('candidate', 'interviewer', 'admin').default('candidate')
  }),

  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: commonSchemas.password
  })
};

export const sessionSchemas = {
  create: Joi.object({
    candidateId: commonSchemas.objectId,
    interviewerId: commonSchemas.objectId,
    scheduledAt: Joi.date().iso().min('now').required(),
    duration: Joi.number().min(15).max(480).default(60), // 15 minutes to 8 hours
    title: Joi.string().min(5).max(100).required(),
    description: Joi.string().max(500).optional()
  }),

  update: Joi.object({
    status: Joi.string().valid('scheduled', 'active', 'paused', 'completed', 'cancelled').optional(),
    scheduledAt: Joi.date().iso().optional(),
    duration: Joi.number().min(15).max(480).optional(),
    title: Joi.string().min(5).max(100).optional(),
    description: Joi.string().max(500).optional()
  })
};

export const eventSchemas = {
  create: Joi.object({
    sessionId: commonSchemas.sessionId,
    candidateId: commonSchemas.objectId,
    eventType: commonSchemas.eventType,
    timestamp: commonSchemas.timestamp,
    duration: Joi.number().min(0).required(),
    confidence: commonSchemas.confidence,
    metadata: Joi.object().optional()
  }),

  batch: Joi.object({
    events: Joi.array().items(
      Joi.object({
        sessionId: commonSchemas.sessionId,
        candidateId: commonSchemas.objectId,
        eventType: commonSchemas.eventType,
        timestamp: commonSchemas.timestamp,
        duration: Joi.number().min(0).required(),
        confidence: commonSchemas.confidence,
        metadata: Joi.object().optional()
      })
    ).min(1).max(100).required()
  })
};

export const reportSchemas = {
  generate: Joi.object({
    sessionId: commonSchemas.sessionId,
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')).optional(),
    includeDetails: Joi.boolean().default(true)
  })
};

// Validation error formatter
export const formatValidationError = (error: Joi.ValidationError) => {
  return error.details.map((detail: any) => ({
    field: detail.path.join('.'),
    message: detail.message,
    value: detail.context?.value
  }));
};

// Zod validation middleware
export const validateZod = (schema: z.ZodTypeAny, property: 'body' | 'query' | 'params' = 'body') => {
  return (req: Request, res: Response, next: NextFunction) => {
    const data = req[property];
    
    try {
      const validatedData = schema.parse(data);
      
      // Handle different property types appropriately
      if (property === 'query') {
        // Create validated query object and extend req with it
        (req as any).validatedQuery = validatedData;
      } else if (property === 'params') {
        // Create validated params object and extend req with it
        (req as any).validatedParams = validatedData;
      } else {
        // Body can be directly assigned
        req[property] = validatedData;
      }
      
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationErrors = error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
          value: issue.path.reduce((obj, key) => obj?.[key], data),
          code: issue.code
        }));

        logger.warn('Validation Error (Zod)', {
          errors: validationErrors,
          url: req.url,
          method: req.method,
          ip: req.ip,
          body: JSON.stringify(data, null, 2)
        });

        throw new ValidationError('Validation failed');
      }
      throw error;
    }
  };
};

// Helper functions for common validation patterns (Joi)
export const validateRequest = (schema: Joi.ObjectSchema | z.ZodTypeAny) => {
  if ((schema as any)._def) {
    return validateZod(schema as z.ZodTypeAny, 'body');
  }
  return validate(schema as Joi.ObjectSchema, 'body');
};

export const validateParams = (schema: Joi.ObjectSchema | z.ZodTypeAny) => {
  if ((schema as any)._def) {
    return validateZod(schema as z.ZodTypeAny, 'params');
  }
  return validate(schema as Joi.ObjectSchema, 'params');
};

export const validateQuery = (schema: Joi.ObjectSchema | z.ZodTypeAny) => {
  if ((schema as any)._def) {
    return validateZod(schema as z.ZodTypeAny, 'query');
  }
  return validate(schema as Joi.ObjectSchema, 'query');
};

export default {
  validate,
  validateZod,
  validateRequest,
  validateParams,
  validateQuery,
  sanitize,
  validateInputLength,
  validateFileUpload,
  validateRateLimit,
  commonSchemas,
  authSchemas,
  sessionSchemas,
  eventSchemas,
  reportSchemas,
  formatValidationError
};