import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import {
  WebSocketEventType,
  WebSocketUserRole,
  WebSocketConnectionData,
  JoinSessionPayload,
  SessionJoinedPayload,
  DetectionEventPayload,
  ManualFlagPayload,
  VideoStreamStartPayload,
  VideoStreamDataPayload,
  VideoStreamOfferPayload,
  VideoStreamAnswerPayload,
  VideoStreamIceCandidatePayload,
  SessionStatusUpdatePayload,
  WebSocketErrorPayload,
  ActiveSession,
  WebSocketStats
} from '../types/websocket';
import { JWTPayload } from '../types';
import { InterviewSession } from '../models/InterviewSession';

export class WebSocketService {
  private io: SocketIOServer;
  private activeSessions: Map<string, ActiveSession> = new Map();
  private userSockets: Map<string, Socket> = new Map();
  private startTime: Date = new Date();

  constructor(server: HTTPServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  private setupMiddleware(): void {
    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
        socket.data.user = decoded;
        next();
      } catch (error) {
        next(new Error('Invalid authentication token'));
      }
    });
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      console.log(`User connected: ${socket.data.user.userId}`);
      this.userSockets.set(socket.data.user.userId, socket);

      // Handle session joining
      socket.on(WebSocketEventType.JOIN_SESSION, (payload: JoinSessionPayload) => {
        this.handleJoinSession(socket, payload);
      });

      // Handle session leaving
      socket.on(WebSocketEventType.LEAVE_SESSION, (sessionId: string) => {
        this.handleLeaveSession(socket, sessionId);
      });

      // Handle detection events
      socket.on(WebSocketEventType.DETECTION_EVENT, (payload: DetectionEventPayload) => {
        this.handleDetectionEvent(socket, payload);
      });

      // Handle manual flagging
      socket.on(WebSocketEventType.MANUAL_FLAG, (payload: ManualFlagPayload) => {
        this.handleManualFlag(socket, payload);
      });

      // Handle video streaming events
      socket.on(WebSocketEventType.VIDEO_STREAM_START, (payload: VideoStreamStartPayload) => {
        this.handleVideoStreamStart(socket, payload);
      });

      socket.on(WebSocketEventType.VIDEO_STREAM_STOP, (sessionId: string) => {
        this.handleVideoStreamStop(socket, sessionId);
      });

      socket.on(WebSocketEventType.VIDEO_STREAM_DATA, (payload: VideoStreamDataPayload) => {
        this.handleVideoStreamData(socket, payload);
      });

      // Handle WebRTC signaling
      socket.on(WebSocketEventType.VIDEO_STREAM_OFFER, (payload: VideoStreamOfferPayload) => {
        this.handleVideoStreamOffer(socket, payload);
      });

      socket.on(WebSocketEventType.VIDEO_STREAM_ANSWER, (payload: VideoStreamAnswerPayload) => {
        this.handleVideoStreamAnswer(socket, payload);
      });

      socket.on(WebSocketEventType.VIDEO_STREAM_ICE_CANDIDATE, (payload: VideoStreamIceCandidatePayload) => {
        this.handleVideoStreamIceCandidate(socket, payload);
      });

      // Handle session status updates
      socket.on(WebSocketEventType.SESSION_STATUS_UPDATE, (payload: SessionStatusUpdatePayload) => {
        this.handleSessionStatusUpdate(socket, payload);
      });

      // Handle heartbeat
      socket.on(WebSocketEventType.PING, () => {
        socket.emit(WebSocketEventType.PONG);
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });
    });
  }

  private async handleJoinSession(socket: Socket, payload: JoinSessionPayload): Promise<void> {
    try {
      const { sessionId, role } = payload;
      const userId = socket.data.user.userId;

      // Validate session exists
      const session = await InterviewSession.findOne({ sessionId });
      if (!session) {
        this.emitError(socket, 'SESSION_NOT_FOUND', 'Session not found');
        return;
      }

      // Validate user role and permissions
      if (role === WebSocketUserRole.CANDIDATE && session.candidateId !== userId) {
        this.emitError(socket, 'UNAUTHORIZED', 'Not authorized to join as candidate');
        return;
      }

      // Join socket room
      socket.join(sessionId);

      // Create or get active session
      let activeSession = this.activeSessions.get(sessionId);
      if (!activeSession) {
        activeSession = {
          sessionId,
          candidates: new Map(),
          interviewers: new Map(),
          createdAt: new Date(),
          lastActivity: new Date()
        };
        this.activeSessions.set(sessionId, activeSession);
      }

      // Add user to active session
      const connectionData: WebSocketConnectionData = {
        userId,
        sessionId,
        role,
        email: socket.data.user.email,
        name: socket.data.user.name,
        connectedAt: new Date()
      };

      if (role === WebSocketUserRole.CANDIDATE) {
        activeSession.candidates.set(userId, connectionData);
      } else {
        activeSession.interviewers.set(userId, connectionData);
      }

      activeSession.lastActivity = new Date();

      // Emit session joined event
      const joinedPayload: SessionJoinedPayload = {
        sessionId,
        role,
        userId,
        connectedUsers: {
          candidates: Array.from(activeSession.candidates.values()),
          interviewers: Array.from(activeSession.interviewers.values())
        }
      };

      socket.emit(WebSocketEventType.SESSION_JOINED, joinedPayload);

      // Notify other users in the session
      socket.to(sessionId).emit(WebSocketEventType.SESSION_JOINED, joinedPayload);

      console.log(`User ${userId} joined session ${sessionId} as ${role}`);
    } catch (error) {
      console.error('Error joining session:', error);
      this.emitError(socket, 'JOIN_SESSION_ERROR', 'Failed to join session');
    }
  }

  private handleLeaveSession(socket: Socket, sessionId: string): void {
    try {
      const userId = socket.data.user.userId;
      
      // Leave socket room
      socket.leave(sessionId);

      // Remove from active session
      const activeSession = this.activeSessions.get(sessionId);
      if (activeSession) {
        activeSession.candidates.delete(userId);
        activeSession.interviewers.delete(userId);
        activeSession.lastActivity = new Date();

        // If no users left, remove the session
        if (activeSession.candidates.size === 0 && activeSession.interviewers.size === 0) {
          this.activeSessions.delete(sessionId);
        }

        // Notify other users
        socket.to(sessionId).emit(WebSocketEventType.SESSION_LEFT, {
          sessionId,
          userId,
          connectedUsers: {
            candidates: Array.from(activeSession.candidates.values()),
            interviewers: Array.from(activeSession.interviewers.values())
          }
        });
      }

      console.log(`User ${userId} left session ${sessionId}`);
    } catch (error) {
      console.error('Error leaving session:', error);
    }
  }

  private handleDetectionEvent(socket: Socket, payload: DetectionEventPayload): void {
    try {
      const { sessionId } = payload;
      
      // Broadcast to interviewers in the session
      socket.to(sessionId).emit(WebSocketEventType.DETECTION_EVENT_BROADCAST, payload);
      
      console.log(`Detection event broadcasted for session ${sessionId}:`, payload.eventType);
    } catch (error) {
      console.error('Error handling detection event:', error);
      this.emitError(socket, 'DETECTION_EVENT_ERROR', 'Failed to broadcast detection event');
    }
  }

  private handleManualFlag(socket: Socket, payload: ManualFlagPayload): void {
    try {
      const { sessionId } = payload;
      const userId = socket.data.user.userId;

      // Validate that user is an interviewer
      const activeSession = this.activeSessions.get(sessionId);
      if (!activeSession || !activeSession.interviewers.has(userId)) {
        this.emitError(socket, 'UNAUTHORIZED', 'Only interviewers can create manual flags');
        return;
      }

      // Broadcast to all users in the session
      this.io.to(sessionId).emit(WebSocketEventType.MANUAL_FLAG_BROADCAST, payload);
      
      console.log(`Manual flag created by ${userId} for session ${sessionId}`);
    } catch (error) {
      console.error('Error handling manual flag:', error);
      this.emitError(socket, 'MANUAL_FLAG_ERROR', 'Failed to create manual flag');
    }
  }

  private handleVideoStreamStart(socket: Socket, payload: VideoStreamStartPayload): void {
    try {
      const { sessionId } = payload;
      
      // Broadcast to other users in the session
      socket.to(sessionId).emit(WebSocketEventType.VIDEO_STREAM_START, payload);
      
      console.log(`Video stream started for session ${sessionId}`);
    } catch (error) {
      console.error('Error handling video stream start:', error);
    }
  }

  private handleVideoStreamStop(socket: Socket, sessionId: string): void {
    try {
      const userId = socket.data.user.userId;
      
      // Broadcast to other users in the session
      socket.to(sessionId).emit(WebSocketEventType.VIDEO_STREAM_STOP, { sessionId, userId });
      
      console.log(`Video stream stopped for session ${sessionId}`);
    } catch (error) {
      console.error('Error handling video stream stop:', error);
    }
  }

  private handleVideoStreamData(socket: Socket, payload: VideoStreamDataPayload): void {
    try {
      const { sessionId } = payload;
      
      // Broadcast to interviewers in the session (candidates don't need to see other candidate streams)
      const activeSession = this.activeSessions.get(sessionId);
      if (activeSession) {
        activeSession.interviewers.forEach((interviewer) => {
          const interviewerSocket = this.userSockets.get(interviewer.userId);
          if (interviewerSocket) {
            interviewerSocket.emit(WebSocketEventType.VIDEO_STREAM_DATA, payload);
          }
        });
      }
    } catch (error) {
      console.error('Error handling video stream data:', error);
    }
  }

  private handleVideoStreamOffer(socket: Socket, payload: VideoStreamOfferPayload): void {
    try {
      const { toUserId } = payload;
      const targetSocket = this.userSockets.get(toUserId);
      
      if (targetSocket) {
        targetSocket.emit(WebSocketEventType.VIDEO_STREAM_OFFER, payload);
      }
    } catch (error) {
      console.error('Error handling video stream offer:', error);
    }
  }

  private handleVideoStreamAnswer(socket: Socket, payload: VideoStreamAnswerPayload): void {
    try {
      const { toUserId } = payload;
      const targetSocket = this.userSockets.get(toUserId);
      
      if (targetSocket) {
        targetSocket.emit(WebSocketEventType.VIDEO_STREAM_ANSWER, payload);
      }
    } catch (error) {
      console.error('Error handling video stream answer:', error);
    }
  }

  private handleVideoStreamIceCandidate(socket: Socket, payload: VideoStreamIceCandidatePayload): void {
    try {
      const { toUserId } = payload;
      const targetSocket = this.userSockets.get(toUserId);
      
      if (targetSocket) {
        targetSocket.emit(WebSocketEventType.VIDEO_STREAM_ICE_CANDIDATE, payload);
      }
    } catch (error) {
      console.error('Error handling video stream ICE candidate:', error);
    }
  }

  private async handleSessionStatusUpdate(socket: Socket, payload: SessionStatusUpdatePayload): Promise<void> {
    try {
      const { sessionId, status } = payload;
      const userId = socket.data.user.userId;

      // Update session status in database
      await InterviewSession.findOneAndUpdate(
        { sessionId },
        { 
          status,
          ...(status !== 'active' ? { endTime: new Date() } : {})
        }
      );

      // Broadcast to all users in the session
      this.io.to(sessionId).emit(WebSocketEventType.SESSION_STATUS_UPDATE, payload);
      
      console.log(`Session ${sessionId} status updated to ${status} by ${userId}`);
    } catch (error) {
      console.error('Error handling session status update:', error);
      this.emitError(socket, 'SESSION_UPDATE_ERROR', 'Failed to update session status');
    }
  }

  private handleDisconnect(socket: Socket): void {
    try {
      const userId = socket.data.user?.userId;
      if (!userId) return;

      console.log(`User disconnected: ${userId}`);
      
      // Remove from user sockets map
      this.userSockets.delete(userId);

      // Remove from all active sessions
      this.activeSessions.forEach((session, sessionId) => {
        if (session.candidates.has(userId) || session.interviewers.has(userId)) {
          session.candidates.delete(userId);
          session.interviewers.delete(userId);
          session.lastActivity = new Date();

          // Notify other users in the session
          socket.to(sessionId).emit(WebSocketEventType.SESSION_LEFT, {
            sessionId,
            userId,
            connectedUsers: {
              candidates: Array.from(session.candidates.values()),
              interviewers: Array.from(session.interviewers.values())
            }
          });

          // Remove empty sessions
          if (session.candidates.size === 0 && session.interviewers.size === 0) {
            this.activeSessions.delete(sessionId);
          }
        }
      });
    } catch (error) {
      console.error('Error handling disconnect:', error);
    }
  }

  private emitError(socket: Socket, code: string, message: string, details?: any): void {
    const errorPayload: WebSocketErrorPayload = {
      code,
      message,
      details
    };
    socket.emit(WebSocketEventType.ERROR, errorPayload);
  }

  // Public methods for external use
  public broadcastToSession(sessionId: string, event: string, data: any): void {
    this.io.to(sessionId).emit(event, data);
  }

  public sendToUser(userId: string, event: string, data: any): void {
    const socket = this.userSockets.get(userId);
    if (socket) {
      socket.emit(event, data);
    }
  }

  public getActiveSessionsCount(): number {
    return this.activeSessions.size;
  }

  public getConnectedUsersCount(): number {
    return this.userSockets.size;
  }

  public getSessionUsers(sessionId: string): { candidates: WebSocketConnectionData[], interviewers: WebSocketConnectionData[] } | null {
    const session = this.activeSessions.get(sessionId);
    if (!session) return null;

    return {
      candidates: Array.from(session.candidates.values()),
      interviewers: Array.from(session.interviewers.values())
    };
  }

  public getStats(): WebSocketStats {
    let candidateCount = 0;
    let interviewerCount = 0;

    this.activeSessions.forEach(session => {
      candidateCount += session.candidates.size;
      interviewerCount += session.interviewers.size;
    });

    return {
      totalConnections: this.userSockets.size,
      activeSessions: this.activeSessions.size,
      connectedCandidates: candidateCount,
      connectedInterviewers: interviewerCount,
      uptime: Date.now() - this.startTime.getTime()
    };
  }

  public isUserConnected(userId: string): boolean {
    return this.userSockets.has(userId);
  }

  public disconnectUser(userId: string): void {
    const socket = this.userSockets.get(userId);
    if (socket) {
      socket.disconnect();
    }
  }
}