import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

/**
 * Middleware to validate request data against a Zod schema
 */
export const validateRequest = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const validation = schema.safeParse(req.body);

      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: validation.error.issues
        });
        return;
      }

      // Replace req.body with validated data
      req.body = validation.data;
      next();
    } catch (error) {
      console.error('Validation middleware error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error during validation'
      });
    }
  };
};

/**
 * Middleware to validate request parameters against a Zod schema
 */
export const validateParams = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const validation = schema.safeParse(req.params);

      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid parameters',
          details: validation.error.issues
        });
        return;
      }

      req.params = validation.data as any;
      next();
    } catch (error) {
      console.error('Parameter validation middleware error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error during parameter validation'
      });
    }
  };
};

/**
 * Middleware to validate request query parameters against a Zod schema
 */
export const validateQuery = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const validation = schema.safeParse(req.query);

      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid query parameters',
          details: validation.error.issues
        });
        return;
      }

      // Merge validated data into req.query
      Object.assign(req.query, validation.data);
      next();
    } catch (error) {
      console.error('Query validation middleware error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error during query validation'
      });
    }
  };
};