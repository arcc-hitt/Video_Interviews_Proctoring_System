import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { connectToDatabase, performHealthCheck } from './utils/database';
import { ApiResponse } from './types';
import { WebSocketService } from './services/websocketService';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const dbHealth = await performHealthCheck();
    const response: ApiResponse = {
      success: true,
      data: {
        server: 'healthy',
        database: dbHealth,
        timestamp: new Date().toISOString()
      }
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: 'Health check failed',
      data: {
        server: 'healthy',
        database: { status: 'unhealthy', error: error instanceof Error ? error.message : 'Unknown error' },
        timestamp: new Date().toISOString()
      }
    };
    res.status(503).json(response);
  }
});

// Import routes
import videoRoutes from './routes/videoRoutes';
import authRoutes from './routes/authRoutes';
import eventRoutes from './routes/eventRoutes';
import reportRoutes from './routes/reportRoutes';
import sessionRoutes, { setWebSocketService } from './routes/sessionRoutes';

// API routes
app.use('/api/videos', videoRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/sessions', sessionRoutes);

// 404 handler - must come before error handling middleware
app.use((req, res, next) => {
  const response: ApiResponse = {
    success: false,
    error: 'Not found',
    message: `Route ${req.originalUrl} not found`
  };
  res.status(404).json(response);
});

// Error handling middleware - must be last
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  const response: ApiResponse = {
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong!'
  };
  res.status(500).json(response);
});

// Initialize database and start server
async function startServer() {
  try {
    // Connect to database
    console.log('Connecting to database...');
    await connectToDatabase();
    
    // Create HTTP server
    const server = createServer(app);
    
    // Initialize WebSocket service
    const wsService = new WebSocketService(server);
    setWebSocketService(wsService);
    
    // Start server
    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`Health check available at http://localhost:${PORT}/health`);
      console.log(`WebSocket server initialized`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

export default app;