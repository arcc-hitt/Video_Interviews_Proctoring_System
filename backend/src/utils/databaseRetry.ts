import mongoose from 'mongoose';
import { logger, dbLogger } from './logger';

interface RetryConfig {
  maxRetries: number;
  baseDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  backoffMultiplier: number;
  jitter: boolean;
}

interface RetryStats {
  attempts: number;
  totalTime: number;
  lastError?: Error;
  success: boolean;
}

export class DatabaseRetryManager {
  private config: RetryConfig;
  private isConnected = false;
  private connectionPromise: Promise<void> | null = null;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = {
      maxRetries: 5,
      baseDelay: 1000, // 1 second
      maxDelay: 30000, // 30 seconds
      backoffMultiplier: 2,
      jitter: true,
      ...config
    };
  }

  /**
   * Connect to MongoDB with retry logic
   */
  public async connect(uri: string): Promise<void> {
    if (this.isConnected) {
      return;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this.connectWithRetry(uri);
    return this.connectionPromise;
  }

  private async connectWithRetry(uri: string): Promise<void> {
    const stats: RetryStats = {
      attempts: 0,
      totalTime: 0,
      success: false
    };

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      stats.attempts = attempt;
      const startTime = Date.now();

      try {
        await this.attemptConnection(uri);
        stats.success = true;
        stats.totalTime = Date.now() - startTime;
        
        this.isConnected = true;
        dbLogger.connection('connected', { attempts: attempt, totalTime: stats.totalTime });
        
        logger.info('Database connected successfully', {
          attempts: attempt,
          totalTime: stats.totalTime,
          uri: this.sanitizeUri(uri)
        });

        return;
      } catch (error) {
        stats.lastError = error as Error;
        const attemptTime = Date.now() - startTime;
        stats.totalTime += attemptTime;

        dbLogger.connection('error', {
          attempt,
          error: error.message,
          attemptTime
        });

        logger.warn('Database connection attempt failed', {
          attempt,
          error: error.message,
          attemptTime,
          uri: this.sanitizeUri(uri)
        });

        if (attempt === this.config.maxRetries) {
          logger.error('Database connection failed after all retries', {
            attempts: attempt,
            totalTime: stats.totalTime,
            lastError: error.message,
            uri: this.sanitizeUri(uri)
          });

          throw new Error(`Database connection failed after ${attempt} attempts: ${error.message}`);
        }

        // Calculate delay for next attempt
        const delay = this.calculateDelay(attempt);
        logger.info(`Retrying database connection in ${delay}ms`, {
          attempt,
          nextAttempt: attempt + 1,
          delay
        });

        await this.sleep(delay);
      }
    }
  }

  private async attemptConnection(uri: string): Promise<void> {
    const options = {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      bufferMaxEntries: 0,
      bufferCommands: false,
      retryWrites: true,
      retryReads: true
    };

    await mongoose.connect(uri, options);
  }

  private calculateDelay(attempt: number): number {
    let delay = this.config.baseDelay * Math.pow(this.config.backoffMultiplier, attempt - 1);
    
    // Cap at max delay
    delay = Math.min(delay, this.config.maxDelay);
    
    // Add jitter to prevent thundering herd
    if (this.config.jitter) {
      const jitterAmount = delay * 0.1; // 10% jitter
      delay += (Math.random() - 0.5) * 2 * jitterAmount;
    }
    
    return Math.max(0, Math.floor(delay));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private sanitizeUri(uri: string): string {
    // Remove password from URI for logging
    return uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
  }

  /**
   * Execute a database operation with retry logic
   */
  public async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    context?: any
  ): Promise<T> {
    const stats: RetryStats = {
      attempts: 0,
      totalTime: 0,
      success: false
    };

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      stats.attempts = attempt;
      const startTime = Date.now();

      try {
        const result = await operation();
        stats.success = true;
        stats.totalTime = Date.now() - startTime;
        
        dbLogger.query(operationName, 'unknown', stats.totalTime, true);
        
        return result;
      } catch (error) {
        stats.lastError = error as Error;
        const attemptTime = Date.now() - startTime;
        stats.totalTime += attemptTime;

        // Check if error is retryable
        if (!this.isRetryableError(error as Error)) {
          logger.error('Non-retryable database error', {
            operation: operationName,
            error: error.message,
            context
          });
          throw error;
        }

        dbLogger.query(operationName, 'unknown', attemptTime, false);

        logger.warn('Database operation failed, retrying', {
          operation: operationName,
          attempt,
          error: error.message,
          attemptTime,
          context
        });

        if (attempt === this.config.maxRetries) {
          logger.error('Database operation failed after all retries', {
            operation: operationName,
            attempts: attempt,
            totalTime: stats.totalTime,
            lastError: error.message,
            context
          });

          throw new Error(`${operationName} failed after ${attempt} attempts: ${error.message}`);
        }

        // Calculate delay for next attempt
        const delay = this.calculateDelay(attempt);
        await this.sleep(delay);
      }
    }

    throw new Error(`${operationName} failed after ${this.config.maxRetries} attempts`);
  }

  private isRetryableError(error: Error): boolean {
    const retryableErrors = [
      'MongoNetworkError',
      'MongoTimeoutError',
      'MongoServerSelectionError',
      'MongoWriteConcernError',
      'MongoCursorExhaustedError',
      'MongoCursorInUseError',
      'MongoInvalidOperationError',
      'MongoConnectionPoolClosedError',
      'MongoConnectionClosedError',
      'MongoConnectionPoolExhaustedError'
    ];

    return retryableErrors.some(errorType => error.name === errorType);
  }

  /**
   * Disconnect from database
   */
  public async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await mongoose.disconnect();
      this.isConnected = false;
      this.connectionPromise = null;
      
      dbLogger.connection('disconnected');
      logger.info('Database disconnected successfully');
    } catch (error) {
      logger.error('Error disconnecting from database', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get connection status
   */
  public getConnectionStatus(): {
    isConnected: boolean;
    readyState: number;
    host: string;
    port: number;
    name: string;
  } {
    const connection = mongoose.connection;
    
    return {
      isConnected: this.isConnected && connection.readyState === 1,
      readyState: connection.readyState,
      host: connection.host,
      port: connection.port,
      name: connection.name
    };
  }

  /**
   * Health check for database connection
   */
  public async healthCheck(): Promise<{
    healthy: boolean;
    latency: number;
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      // Simple ping to check connection
      await mongoose.connection.db.admin().ping();
      const latency = Date.now() - startTime;
      
      return {
        healthy: true,
        latency
      };
    } catch (error) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        error: error.message
      };
    }
  }
}

// Singleton instance
export const dbRetryManager = new DatabaseRetryManager();

// Graceful shutdown handler
export const setupDatabaseGracefulShutdown = () => {
  const gracefulShutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Closing database connection...`);
    
    try {
      await dbRetryManager.disconnect();
      logger.info('Database connection closed gracefully');
    } catch (error) {
      logger.error('Error closing database connection', {
        error: error.message
      });
    }
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // For nodemon
};

export default DatabaseRetryManager;
