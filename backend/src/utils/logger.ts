import winston from 'winston';
import path from 'path';

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white'
};

// Tell winston that you want to link the colors
winston.addColors(colors);

// Define which level to log based on environment
const level = () => {
  const env = process.env.NODE_ENV || 'development';
  const isDevelopment = env === 'development';
  return isDevelopment ? 'debug' : 'warn';
};

// Define format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// Define format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Define transports
const transports = [
  // Console transport
  new winston.transports.Console({
    format: consoleFormat
  }),

  // Error log file
  new winston.transports.File({
    filename: path.join(process.cwd(), 'logs', 'error.log'),
    level: 'error',
    format: fileFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }),

  // Combined log file
  new winston.transports.File({
    filename: path.join(process.cwd(), 'logs', 'combined.log'),
    format: fileFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5
  })
];

// Create the logger
export const logger = winston.createLogger({
  level: level(),
  levels,
  transports,
  exitOnError: false
});

// Create a stream object for Morgan HTTP logging
export const morganStream = {
  write: (message: string) => {
    logger.http(message.trim());
  }
};

// Request logging middleware
export const requestLogger = (req: any, res: any, next: any) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id,
      sessionId: req.headers['x-session-id'],
      requestId: req.headers['x-request-id']
    };

    if (res.statusCode >= 400) {
      logger.warn('HTTP Request', logData);
    } else {
      logger.info('HTTP Request', logData);
    }
  });

  next();
};

// Performance monitoring
export const performanceLogger = {
  startTimer: (label: string) => {
    const start = process.hrtime.bigint();
    return {
      end: () => {
        const end = process.hrtime.bigint();
        const duration = Number(end - start) / 1000000; // Convert to milliseconds
        logger.info('Performance', {
          label,
          duration: `${duration.toFixed(2)}ms`
        });
        return duration;
      }
    };
  }
};

// Security event logging
export const securityLogger = {
  loginAttempt: (ip: string, email: string, success: boolean, reason?: string) => {
    logger.warn('Login Attempt', {
      ip,
      email,
      success,
      reason,
      timestamp: new Date().toISOString()
    });
  },

  suspiciousActivity: (ip: string, activity: string, details: any) => {
    logger.error('Suspicious Activity', {
      ip,
      activity,
      details,
      timestamp: new Date().toISOString()
    });
  },

  rateLimitExceeded: (ip: string, endpoint: string, limit: number) => {
    logger.warn('Rate Limit Exceeded', {
      ip,
      endpoint,
      limit,
      timestamp: new Date().toISOString()
    });
  }
};

// Database operation logging
export const dbLogger = {
  query: (operation: string, collection: string, duration: number, success: boolean) => {
    const level = success ? 'debug' : 'error';
    logger.log(level, 'Database Operation', {
      operation,
      collection,
      duration: `${duration}ms`,
      success
    });
  },

  connection: (status: 'connected' | 'disconnected' | 'error', details?: any) => {
    const level = status === 'error' ? 'error' : 'info';
    logger.log(level, 'Database Connection', {
      status,
      details,
      timestamp: new Date().toISOString()
    });
  }
};

// Application metrics logging
export const metricsLogger = {
  sessionStart: (sessionId: string, candidateId: string) => {
    logger.info('Session Started', {
      sessionId,
      candidateId,
      timestamp: new Date().toISOString()
    });
  },

  sessionEnd: (sessionId: string, candidateId: string, duration: number) => {
    logger.info('Session Ended', {
      sessionId,
      candidateId,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });
  },

  detectionEvent: (sessionId: string, eventType: string, confidence: number) => {
    logger.info('Detection Event', {
      sessionId,
      eventType,
      confidence,
      timestamp: new Date().toISOString()
    });
  }
};

export default logger;
