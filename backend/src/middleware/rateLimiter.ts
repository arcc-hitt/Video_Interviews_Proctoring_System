import { Request, Response, NextFunction } from 'express';
import { RateLimitError } from './errorHandler';
import { logger, securityLogger } from '../utils/logger';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
  firstRequest: number;
  blocked: boolean;
}

class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private config: RateLimitConfig;
  private cleanupInterval: NodeJS.Timeout;

  constructor(config: RateLimitConfig) {
    this.config = {
      message: 'Too many requests, please try again later.',
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      keyGenerator: (req: Request) => req.ip || 'unknown',
      skip: () => false,
      ...config
    };

    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  public middleware = (req: Request, res: Response, next: NextFunction): void => {
    // Skip if configured to do so
    if (this.config.skip && this.config.skip(req)) {
      return next();
    }

    const key = this.config.keyGenerator!(req);
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Clean up old entries for this key
    this.cleanupKey(key, windowStart);

    const entry = this.store.get(key);

    if (!entry) {
      // First request
      this.store.set(key, {
        count: 1,
        resetTime: now + this.config.windowMs,
        firstRequest: now,
        blocked: false
      });
      return next();
    }

    if (entry.resetTime < now) {
      // Window has expired, reset
      entry.count = 1;
      entry.resetTime = now + this.config.windowMs;
      entry.firstRequest = now;
      entry.blocked = false;
      return next();
    }

    if (entry.blocked) {
      // Key is blocked
      this.sendRateLimitResponse(req, res, entry);
      return;
    }

    if (entry.count >= this.config.maxRequests) {
      // Rate limit exceeded
      entry.blocked = true;
      
      securityLogger.rateLimitExceeded(
        req.ip || 'unknown',
        req.path,
        this.config.maxRequests
      );

      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        count: entry.count,
        maxRequests: this.config.maxRequests,
        windowMs: this.config.windowMs,
        userAgent: req.get('User-Agent'),
        userId: (req as any).user?.id
      });

      this.sendRateLimitResponse(req, res, entry);
      return;
    }

    // Increment counter
    entry.count++;
    next();
  };

  private sendRateLimitResponse(req: Request, res: Response, entry: RateLimitEntry): void {
    const retryAfter = Math.ceil((entry.resetTime - Date.now()) / 1000);
    
    res.set({
      'Retry-After': retryAfter.toString(),
      'X-RateLimit-Limit': this.config.maxRequests.toString(),
      'X-RateLimit-Remaining': Math.max(0, this.config.maxRequests - entry.count).toString(),
      'X-RateLimit-Reset': new Date(entry.resetTime).toISOString()
    });

    res.status(429).json({
      success: false,
      error: {
        message: this.config.message,
        code: 'RATE_LIMIT_EXCEEDED',
        statusCode: 429,
        retryAfter
      }
    });
  }

  private cleanupKey(key: string, windowStart: number): void {
    const entry = this.store.get(key);
    if (entry && entry.resetTime < windowStart) {
      this.store.delete(key);
    }
  }

  private cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    for (const [key, entry] of this.store.entries()) {
      if (entry.resetTime < windowStart) {
        this.store.delete(key);
      }
    }
  }

  public destroy(): void {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

// Predefined rate limiters
export const createRateLimiters = () => {
  // General API rate limiter
  const generalLimiter = new RateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100,
    message: 'Too many requests from this IP, please try again later.'
  });

  // Authentication rate limiter (stricter)
  const authLimiter = new RateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5,
    message: 'Too many authentication attempts, please try again later.',
    keyGenerator: (req: Request) => {
      const ip = req.ip || 'unknown';
      const email = req.body?.email || 'unknown';
      return `auth:${ip}:${email}`;
    }
  });

  // Session creation rate limiter
  const sessionLimiter = new RateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 10,
    message: 'Too many session creation attempts, please try again later.',
    keyGenerator: (req: Request) => {
      const userId = (req as any).user?.id || 'anonymous';
      return `session:${userId}`;
    }
  });

  // Event creation rate limiter (for detection events)
  const eventLimiter = new RateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
    message: 'Too many events, please slow down.',
    keyGenerator: (req: Request) => {
      const sessionId = req.body?.sessionId || req.params?.sessionId || 'unknown';
      return `events:${sessionId}`;
    }
  });

  // File upload rate limiter
  const uploadLimiter = new RateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 20,
    message: 'Too many file uploads, please try again later.',
    keyGenerator: (req: Request) => {
      const userId = (req as any).user?.id || req.ip || 'unknown';
      return `upload:${userId}`;
    }
  });

  return {
    general: generalLimiter.middleware,
    auth: authLimiter.middleware,
    session: sessionLimiter.middleware,
    event: eventLimiter.middleware,
    upload: uploadLimiter.middleware
  };
};

// Abuse detection middleware
export const abuseDetection = (req: Request, res: Response, next: NextFunction): void => {
  const suspiciousPatterns = [
    /\.\./, // Path traversal
    /<script/i, // XSS attempts
    /union.*select/i, // SQL injection
    /javascript:/i, // JavaScript injection
    /eval\(/i, // Code injection
    /exec\(/i, // Command injection
    /system\(/i, // System command injection
  ];

  const checkSuspiciousActivity = (input: any, path: string = ''): string[] => {
    const violations: string[] = [];

    if (typeof input === 'string') {
      for (const pattern of suspiciousPatterns) {
        if (pattern.test(input)) {
          violations.push(`Suspicious pattern detected in ${path}: ${pattern.source}`);
        }
      }
    } else if (Array.isArray(input)) {
      input.forEach((item, index) => {
        violations.push(...checkSuspiciousActivity(item, `${path}[${index}]`));
      });
    } else if (input && typeof input === 'object') {
      Object.keys(input).forEach(key => {
        violations.push(...checkSuspiciousActivity(input[key], path ? `${path}.${key}` : key));
      });
    }

    return violations;
  };

  const violations = [
    ...checkSuspiciousActivity(req.body, 'body'),
    ...checkSuspiciousActivity(req.query, 'query'),
    ...checkSuspiciousActivity(req.params, 'params'),
    ...checkSuspiciousActivity(req.headers, 'headers')
  ];

  if (violations.length > 0) {
    securityLogger.suspiciousActivity(
      req.ip || 'unknown',
      'Suspicious request patterns detected',
      {
        violations,
        url: req.url,
        method: req.method,
        userAgent: req.get('User-Agent'),
        userId: (req as any).user?.id
      }
    );

    logger.warn('Suspicious activity detected', {
      ip: req.ip,
      violations,
      url: req.url,
      method: req.method,
      userAgent: req.get('User-Agent'),
      userId: (req as any).user?.id
    });

    res.status(400).json({
      success: false,
      error: {
        message: 'Suspicious activity detected',
        code: 'SUSPICIOUS_ACTIVITY',
        statusCode: 400
      }
    });
    return;
  }

  next();
};

// IP whitelist/blacklist middleware
export const ipFilter = (options: {
  whitelist?: string[];
  blacklist?: string[];
  blockUnknownIPs?: boolean;
}) => {
  const { whitelist = [], blacklist = [], blockUnknownIPs = false } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || 'unknown';

    // Check blacklist first
    if (blacklist.includes(ip)) {
      securityLogger.suspiciousActivity(
        ip,
        'Blocked IP address',
        { url: req.url, method: req.method }
      );

      res.status(403).json({
        success: false,
        error: {
          message: 'Access denied',
          code: 'IP_BLOCKED',
          statusCode: 403
        }
      });
      return;
    }

    // Check whitelist if provided
    if (whitelist.length > 0 && !whitelist.includes(ip)) {
      if (blockUnknownIPs) {
        securityLogger.suspiciousActivity(
          ip,
          'Unknown IP address',
          { url: req.url, method: req.method }
        );

        res.status(403).json({
          success: false,
          error: {
            message: 'Access denied',
            code: 'IP_NOT_WHITELISTED',
            statusCode: 403
          }
        });
        return;
      }
    }

    next();
  };
};

// Request size limiter
export const requestSizeLimiter = (maxSize: number = 10 * 1024 * 1024) => { // 10MB default
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = parseInt(req.get('Content-Length') || '0');

    if (contentLength > maxSize) {
      logger.warn('Request too large', {
        ip: req.ip,
        contentLength,
        maxSize,
        url: req.url,
        method: req.method
      });

      res.status(413).json({
        success: false,
        error: {
          message: 'Request too large',
          code: 'REQUEST_TOO_LARGE',
          statusCode: 413
        }
      });
      return;
    }

    next();
  };
};

export default createRateLimiters;
