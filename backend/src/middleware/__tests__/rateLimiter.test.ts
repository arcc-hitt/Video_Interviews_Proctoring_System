import { Request, Response, NextFunction } from 'express';
import { createRateLimiters, abuseDetection, ipFilter, requestSizeLimiter } from '../rateLimiter';

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn()
  },
  securityLogger: {
    rateLimitExceeded: jest.fn(),
    suspiciousActivity: jest.fn()
  }
}));

describe('Rate Limiter', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {
      ip: '127.0.0.1',
      path: '/test',
      method: 'GET',
      get: jest.fn().mockReturnValue('test-user-agent'),
      body: {},
      query: {},
      params: {}
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis()
    };

    next = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('General Rate Limiter', () => {
    it('should allow requests within limit', () => {
      const rateLimiters = createRateLimiters();
      
      // Make requests within limit
      for (let i = 0; i < 5; i++) {
        rateLimiters.general(req as Request, res as Response, next);
      }
      
      expect(next).toHaveBeenCalledTimes(5);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should block requests exceeding limit', () => {
      const rateLimiters = createRateLimiters();
      
      // Make requests exceeding limit
      for (let i = 0; i < 101; i++) {
        rateLimiters.general(req as Request, res as Response, next);
      }
      
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Too many requests from this IP, please try again later.',
          code: 'RATE_LIMIT_EXCEEDED',
          statusCode: 429,
          retryAfter: expect.any(Number)
        }
      });
    });

    it('should set rate limit headers', () => {
      const rateLimiters = createRateLimiters();
      
      // Make requests to trigger rate limiting
      for (let i = 0; i < 101; i++) {
        rateLimiters.general(req as Request, res as Response, next);
      }
      
      expect(res.set).toHaveBeenCalledWith({
        'Retry-After': expect.any(String),
        'X-RateLimit-Limit': '100',
        'X-RateLimit-Remaining': expect.any(String),
        'X-RateLimit-Reset': expect.any(String)
      });
    });
  });

  describe('Auth Rate Limiter', () => {
    it('should use email-based key generation', () => {
      const rateLimiters = createRateLimiters();
      req.body = { email: 'test@example.com' };
      
      rateLimiters.auth(req as Request, res as Response, next);
      
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should have stricter limits for auth', () => {
      const rateLimiters = createRateLimiters();
      req.body = { email: 'test@example.com' };
      
      // Make requests exceeding auth limit (5)
      for (let i = 0; i < 6; i++) {
        rateLimiters.auth(req as Request, res as Response, next);
      }
      
      expect(res.status).toHaveBeenCalledWith(429);
    });
  });

  describe('Event Rate Limiter', () => {
    it('should use session-based key generation', () => {
      const rateLimiters = createRateLimiters();
      req.body = { sessionId: 'test-session-123' };
      
      rateLimiters.event(req as Request, res as Response, next);
      
      expect(next).toHaveBeenCalledTimes(1);
    });
  });
});

describe('Abuse Detection', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {
      ip: '127.0.0.1',
      url: '/test',
      method: 'GET',
      get: jest.fn().mockReturnValue('test-user-agent'),
      body: {},
      query: {},
      params: {},
      headers: {}
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

  it('should allow normal requests', () => {
    req.body = { name: 'John Doe', email: 'john@example.com' };
    
    abuseDetection(req as Request, res as Response, next);
    
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should detect XSS attempts in body', () => {
    req.body = { name: '<script>alert("xss")</script>' };
    
    abuseDetection(req as Request, res as Response, next);
    
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        message: 'Suspicious activity detected',
        code: 'SUSPICIOUS_ACTIVITY',
        statusCode: 400
      }
    });
  });

  it('should detect SQL injection attempts in query', () => {
    req.query = { search: "1' UNION SELECT * FROM users --" };
    
    abuseDetection(req as Request, res as Response, next);
    
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        message: 'Suspicious activity detected',
        code: 'SUSPICIOUS_ACTIVITY',
        statusCode: 400
      }
    });
  });

  it('should detect path traversal attempts in params', () => {
    req.params = { file: '../../../etc/passwd' };
    
    abuseDetection(req as Request, res as Response, next);
    
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should detect JavaScript injection in headers', () => {
    req.headers = { 'x-custom': 'javascript:alert("xss")' };
    
    abuseDetection(req as Request, res as Response, next);
    
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should detect eval attempts', () => {
    req.body = { code: 'eval("malicious code")' };
    
    abuseDetection(req as Request, res as Response, next);
    
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('IP Filter', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {
      ip: '127.0.0.1',
      url: '/test',
      method: 'GET'
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

  it('should allow whitelisted IPs', () => {
    const filter = ipFilter({ whitelist: ['127.0.0.1', '192.168.1.1'] });
    
    filter(req as Request, res as Response, next);
    
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should block non-whitelisted IPs when whitelist is provided', () => {
    const filter = ipFilter({ 
      whitelist: ['192.168.1.1'], 
      blockUnknownIPs: true 
    });
    
    filter(req as Request, res as Response, next);
    
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        message: 'Access denied',
        code: 'IP_NOT_WHITELISTED',
        statusCode: 403
      }
    });
  });

  it('should block blacklisted IPs', () => {
    const filter = ipFilter({ blacklist: ['127.0.0.1'] });
    
    filter(req as Request, res as Response, next);
    
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        message: 'Access denied',
        code: 'IP_BLOCKED',
        statusCode: 403
      }
    });
  });

  it('should allow non-blacklisted IPs when only blacklist is provided', () => {
    const filter = ipFilter({ blacklist: ['192.168.1.1'] });
    
    filter(req as Request, res as Response, next);
    
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('Request Size Limiter', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {
      ip: '127.0.0.1',
      url: '/test',
      method: 'POST',
      get: jest.fn()
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

  it('should allow requests within size limit', () => {
    const limiter = requestSizeLimiter(1024); // 1KB
    req.get = jest.fn().mockReturnValue('500'); // 500 bytes
    
    limiter(req as Request, res as Response, next);
    
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should block requests exceeding size limit', () => {
    const limiter = requestSizeLimiter(1024); // 1KB
    req.get = jest.fn().mockReturnValue('2048'); // 2KB
    
    limiter(req as Request, res as Response, next);
    
    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        message: 'Request too large',
        code: 'REQUEST_TOO_LARGE',
        statusCode: 413
      }
    });
  });

  it('should handle missing Content-Length header', () => {
    const limiter = requestSizeLimiter(1024);
    req.get = jest.fn().mockReturnValue(undefined);
    
    limiter(req as Request, res as Response, next);
    
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
