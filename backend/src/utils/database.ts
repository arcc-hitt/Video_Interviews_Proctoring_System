import mongoose from 'mongoose';

// Database connection configuration
interface DatabaseConfig {
  uri: string;
  options?: mongoose.ConnectOptions;
}

// Connection state management
class DatabaseConnection {
  private static instance: DatabaseConnection;
  private isConnected: boolean = false;
  private connectionAttempts: number = 0;
  private maxRetries: number = 5;
  private retryDelay: number = 5000; // 5 seconds

  private constructor() {}

  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  /**
   * Connect to MongoDB with retry logic and error handling
   */
  public async connect(config: DatabaseConfig): Promise<void> {
    if (this.isConnected) {
      return;
    }

    const defaultOptions: mongoose.ConnectOptions = {
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      bufferCommands: false, // Disable mongoose buffering
      ...config.options
    };

    while (this.connectionAttempts < this.maxRetries && !this.isConnected) {
      try {
        await mongoose.connect(config.uri, defaultOptions);
        
        this.isConnected = true;
        this.connectionAttempts = 0;
        
        // Set up connection event listeners
        this.setupEventListeners();
        
        return;
      } catch (error) {
        this.connectionAttempts++;
        console.error(`MongoDB connection attempt ${this.connectionAttempts} failed:`, error);
        
        if (this.connectionAttempts >= this.maxRetries) {
          throw new Error(`Failed to connect to MongoDB after ${this.maxRetries} attempts: ${error}`);
        }
        
        // Wait before retrying with exponential backoff
        const delay = this.retryDelay * Math.pow(2, this.connectionAttempts - 1);
        await this.sleep(delay);
      }
    }
  }

  /**
   * Disconnect from MongoDB
   */
  public async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await mongoose.disconnect();
      this.isConnected = false;
    } catch (error) {
      console.error('Error disconnecting from MongoDB:', error);
      throw error;
    }
  }

  /**
   * Check if database is connected
   */
  public isDbConnected(): boolean {
    return this.isConnected && mongoose.connection.readyState === 1;
  }

  /**
   * Get connection status
   */
  public getConnectionStatus(): string {
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    return states[mongoose.connection.readyState as keyof typeof states] || 'unknown';
  }

  /**
   * Setup event listeners for connection monitoring
   */
  private setupEventListeners(): void {
    mongoose.connection.on('connected', () => {
      this.isConnected = true;
    });

    mongoose.connection.on('error', (error) => {
      console.error('MongoDB connection error:', error);
      this.isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      this.isConnected = false;
    });

    mongoose.connection.on('reconnected', () => {
      this.isConnected = true;
    });

    // Handle application termination
    process.on('SIGINT', async () => {
      await this.disconnect();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await this.disconnect();
      process.exit(0);
    });
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Health check for database connection
   */
  public async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      const adminDb = mongoose.connection.db?.admin();
      const result = await adminDb?.ping();
      
      return {
        status: 'healthy',
        details: {
          connected: this.isConnected,
          readyState: this.getConnectionStatus(),
          host: mongoose.connection.host,
          port: mongoose.connection.port,
          name: mongoose.connection.name,
          ping: result
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          connected: this.isConnected,
          readyState: this.getConnectionStatus(),
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }
}

// Export singleton instance
export const dbConnection = DatabaseConnection.getInstance();

// Utility functions
export const connectToDatabase = async (uri?: string): Promise<void> => {
  const mongoUri = uri || process.env.MONGODB_URI || 'mongodb://localhost:27017/video-proctoring';
  
  await dbConnection.connect({
    uri: mongoUri,
    options: {
      dbName: process.env.DB_NAME || 'video-proctoring'
    }
  });
};

export const disconnectFromDatabase = async (): Promise<void> => {
  await dbConnection.disconnect();
};

export const isDatabaseConnected = (): boolean => {
  return dbConnection.isDbConnected();
};

export const getDatabaseStatus = (): string => {
  return dbConnection.getConnectionStatus();
};

export const performHealthCheck = async () => {
  return await dbConnection.healthCheck();
};