import { z } from 'zod';
import { ApiResponse } from './index';

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Validates data against a Zod schema and returns a standardized response
 */
export function validateData<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  try {
    const validatedData = schema.parse(data);
    return { success: true, data: validatedData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.issues.map((err: any) => 
        `${err.path.join('.')}: ${err.message}`
      ).join(', ');
      return { success: false, error: `Validation failed: ${errorMessages}` };
    }
    return { success: false, error: 'Unknown validation error' };
  }
}

/**
 * Validates data and throws an error if validation fails
 */
export function validateDataStrict<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

/**
 * Creates a standardized API error response for validation failures
 */
export function createValidationErrorResponse(error: string): ApiResponse {
  return {
    success: false,
    error: `Validation Error: ${error}`
  };
}

/**
 * Creates a standardized API success response
 */
export function createSuccessResponse<T>(data: T, message?: string): ApiResponse<T> {
  const response: ApiResponse<T> = {
    success: true,
    data
  };
  if (message) {
    response.message = message;
  }
  return response;
}

/**
 * Middleware helper to validate request body against a schema
 */
export function createValidationMiddleware<T>(schema: z.ZodSchema<T>) {
  return (req: any, res: any, next: any) => {
    const validation = validateData(schema, req.body);
    if (!validation.success) {
      return res.status(400).json(createValidationErrorResponse(validation.error));
    }
    req.validatedBody = validation.data;
    next();
  };
}

/**
 * Middleware helper to validate request params against a schema
 */
export function createParamsValidationMiddleware<T>(schema: z.ZodSchema<T>) {
  return (req: any, res: any, next: any) => {
    const validation = validateData(schema, req.params);
    if (!validation.success) {
      return res.status(400).json(createValidationErrorResponse(validation.error));
    }
    req.validatedParams = validation.data;
    next();
  };
}

/**
 * Middleware helper to validate request query against a schema
 */
export function createQueryValidationMiddleware<T>(schema: z.ZodSchema<T>) {
  return (req: any, res: any, next: any) => {
    const validation = validateData(schema, req.query);
    if (!validation.success) {
      return res.status(400).json(createValidationErrorResponse(validation.error));
    }
    req.validatedQuery = validation.data;
    next();
  };
}