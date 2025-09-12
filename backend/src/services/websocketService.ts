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
  InterviewerSessionControlPayload,
  InterviewerRecordingControlPayload,
  SessionControlUpdatePayload,
  WebSocketErrorPayload,
  ActiveSession,
  WebSocketStats
} from '../types/websocket';
import { JWTPayload, UserRole } from '../types';
import { InterviewSession } from '../models/InterviewSession';

export class WebSocketService {
  private io: SocketIOServer;
  private activeSessions: Map<string, ActiveSession> = new Map();
  private userSockets: Map<string, Socket> = new Map();
  private startTime: Date = new Date();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(server: HTTPServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
      upgradeTimeout: 30000,
      allowEIO3: true
    });

    this.setupMiddleware();
    this.setupEventHandlers();
    this.startHeartbeat();
  }

  private startHeartbeat(): void {
    // Send heartbeat to all connected clients every 30 seconds
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    this.heartbeatInterval = setInterval(() => {
      this.io.emit('heartbeat', { timestamp: new Date(), serverUptime: Date.now() - this.startTime.getTime() });
    }, 30000);
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

      // Handle interviewer session control
      socket.on(WebSocketEventType.INTERVIEWER_SESSION_CONTROL, (payload: InterviewerSessionControlPayload) => {
        this.handleInterviewerSessionControl(socket, payload);
      });

      // Handle interviewer recording control
      socket.on(WebSocketEventType.INTERVIEWER_RECORDING_CONTROL, (payload: InterviewerRecordingControlPayload) => {
        this.handleInterviewerRecordingControl(socket, payload);
      });

      // Handle heartbeat
      socket.on(WebSocketEventType.PING, () => {
        socket.emit(WebSocketEventType.PONG);
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
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
      if (role === WebSocketUserRole.CANDIDATE) {
        // For candidates, check if they have the candidate role
        // We allow any candidate to join since sessions are created with generated candidateIds
        if (socket.data.user.role !== UserRole.CANDIDATE) {
          this.emitError(socket, 'UNAUTHORIZED', 'Not authorized to join as candidate');
          return;
        }
      } else if (role === WebSocketUserRole.INTERVIEWER) {
        // For interviewers, check if they have the interviewer role
        if (socket.data.user.role !== UserRole.INTERVIEWER && socket.data.user.role !== UserRole.ADMIN) {
          this.emitError(socket, 'UNAUTHORIZED', 'Not authorized to join as interviewer');
          return;
        }
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

  private async handleDetectionEvent(socket: Socket, payload: DetectionEventPayload): Promise<void> {
    try {
      const { sessionId, eventType, candidateId, timestamp, confidence, metadata } = payload;
      
      console.log(`[WebSocket] Detection event received from ${socket.data.user.userId}:`, {
        sessionId,
        eventType,
        candidateId,
        confidence
      });
      
      // Validate session exists
      const activeSession = this.activeSessions.get(sessionId);
      if (!activeSession) {
        console.error(`[WebSocket] Session ${sessionId} not found in active sessions`);
        this.emitError(socket, 'SESSION_NOT_FOUND', 'Session not found');
        return;
      }

      console.log(`[WebSocket] Session ${sessionId} has ${activeSession.interviewers.size} interviewers connected`);

      // Create enhanced alert payload for interviewers
      const alertPayload = {
        id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        sessionId,
        candidateId,
        eventType,
        timestamp: typeof timestamp === 'string' ? new Date(timestamp) : timestamp,
        confidence: confidence || 0.8,
        metadata: {
          ...metadata,
          source: 'real-time-detection',
          sessionActive: true
        },
        message: this.getEventMessage(eventType, metadata),
        severity: this.getEventSeverity(eventType),
        type: eventType
      };

      console.log(`[WebSocket] Created alert payload:`, alertPayload);

      // Broadcast detection event to all users in session
      socket.to(sessionId).emit(WebSocketEventType.DETECTION_EVENT_BROADCAST, payload);
      
      // Send formatted alert specifically to interviewers
      let alertsSent = 0;
      activeSession.interviewers.forEach((interviewer, interviewerId) => {
        const interviewerSocket = this.userSockets.get(interviewerId);
        if (interviewerSocket) {
          console.log(`[WebSocket] Sending alert to interviewer ${interviewerId}`);
          interviewerSocket.emit('alert', alertPayload);
          alertsSent++;
        } else {
          console.warn(`[WebSocket] Interviewer ${interviewerId} socket not found`);
        }
      });
      
      console.log(`[WebSocket] Sent alerts to ${alertsSent} interviewers for session ${sessionId}`);
      
      // Update session activity
      activeSession.lastActivity = new Date();
      
      console.log(`[WebSocket] Detection event processed successfully for session ${sessionId}:`, eventType);
    } catch (error) {
      console.error('[WebSocket] Error handling detection event:', error);
      this.emitError(socket, 'DETECTION_EVENT_ERROR', 'Failed to process detection event');
    }
  }

  private getEventMessage(eventType: string, metadata?: any): string {
    switch (eventType) {
      case 'focus-loss':
        if (metadata?.gazeDirection) {
          const { x, y } = metadata.gazeDirection;
          const direction = Math.abs(x) > Math.abs(y) ? 
            (x > 0 ? 'right' : 'left') : 
            (y > 0 ? 'down' : 'up');
          return `Candidate looked away (${direction})`;
        }
        return 'Candidate looked away from screen';
      case 'absence':
        return 'No face detected - candidate may have left';
      case 'multiple-faces':
        const faceCount = metadata?.faceCount || 'multiple';
        return `Multiple faces detected (${faceCount} faces)`;
      case 'unauthorized-item':
        const itemType = metadata?.itemType || 'unknown item';
        return `Unauthorized item detected: ${itemType}`;
      default:
        return `Detection event: ${eventType}`;
    }
  }

  private getEventSeverity(eventType: string): 'low' | 'medium' | 'high' {
    switch (eventType) {
      case 'focus-loss':
        return 'medium';
      case 'absence':
      case 'multiple-faces':
      case 'unauthorized-item':
        return 'high';
      default:
        return 'low';
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
      const { sessionId, toUserId } = payload;
      
      // If toUserId is 'interviewer', broadcast to all interviewers in the session
      if (toUserId === 'interviewer') {
        const activeSession = this.activeSessions.get(sessionId);
        if (activeSession) {
          activeSession.interviewers.forEach((interviewer) => {
            const interviewerSocket = this.userSockets.get(interviewer.userId);
            if (interviewerSocket) {
              interviewerSocket.emit(WebSocketEventType.VIDEO_STREAM_OFFER, {
                ...payload,
                fromUserId: socket.data.user.userId
              });
            }
          });
        }
      } else {
        // Direct message to specific user
        const targetSocket = this.userSockets.get(toUserId);
        if (targetSocket) {
          targetSocket.emit(WebSocketEventType.VIDEO_STREAM_OFFER, {
            ...payload,
            fromUserId: socket.data.user.userId
          });
        }
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
        targetSocket.emit(WebSocketEventType.VIDEO_STREAM_ANSWER, {
          ...payload,
          fromUserId: socket.data.user.userId
        });
      }
    } catch (error) {
      console.error('Error handling video stream answer:', error);
    }
  }

  private handleVideoStreamIceCandidate(socket: Socket, payload: VideoStreamIceCandidatePayload): void {
    try {
      const { sessionId, toUserId } = payload;
      
      // If toUserId is 'interviewer', broadcast to all interviewers in the session
      if (toUserId === 'interviewer') {
        const activeSession = this.activeSessions.get(sessionId);
        if (activeSession) {
          activeSession.interviewers.forEach((interviewer) => {
            const interviewerSocket = this.userSockets.get(interviewer.userId);
            if (interviewerSocket) {
              interviewerSocket.emit(WebSocketEventType.VIDEO_STREAM_ICE_CANDIDATE, {
                ...payload,
                fromUserId: socket.data.user.userId
              });
            }
          });
        }
      } else {
        // Direct message to specific user
        const targetSocket = this.userSockets.get(toUserId);
        if (targetSocket) {
          targetSocket.emit(WebSocketEventType.VIDEO_STREAM_ICE_CANDIDATE, {
            ...payload,
            fromUserId: socket.data.user.userId
          });
        }
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

  private handleInterviewerSessionControl(socket: Socket, payload: InterviewerSessionControlPayload): void {
    try {
      const { sessionId, action } = payload;
      const userId = socket.data.user.userId;
      
      // Verify the user is an interviewer in this session
      const sessionData = this.activeSessions.get(sessionId);
      if (!sessionData || !sessionData.interviewers.has(userId)) {
        this.emitError(socket, 'UNAUTHORIZED', 'Only interviewers can control sessions');
        return;
      }

      // Map actions to control types
      let controlType: string;
      switch (action) {
        case 'start':
          controlType = 'session_started';
          break;
        case 'pause':
          controlType = 'session_paused';
          break;
        case 'resume':
          controlType = 'session_resumed';
          break;
        case 'end':
          controlType = 'session_ended';
          break;
        case 'terminate':
          controlType = 'session_terminated';
          break;
        default:
          this.emitError(socket, 'INVALID_ACTION', 'Invalid session control action');
          return;
      }

      // Broadcast control update to all session participants
      const controlUpdate: SessionControlUpdatePayload = {
        sessionId,
        type: controlType as any,
        timestamp: new Date().toISOString()
      };

      this.io.to(sessionId).emit(WebSocketEventType.SESSION_CONTROL_UPDATE, controlUpdate);
      
      console.log(`Session control: ${action} for session ${sessionId} by interviewer ${userId}`);

    } catch (error) {
      console.error('Error handling interviewer session control:', error);
      this.emitError(socket, 'INTERNAL_ERROR', 'Failed to process session control');
    }
  }

  private handleInterviewerRecordingControl(socket: Socket, payload: InterviewerRecordingControlPayload): void {
    try {
      const { sessionId, action } = payload;
      const userId = socket.data.user.userId;
      
      // Verify the user is an interviewer in this session
      const sessionData = this.activeSessions.get(sessionId);
      if (!sessionData || !sessionData.interviewers.has(userId)) {
        this.emitError(socket, 'UNAUTHORIZED', 'Only interviewers can control recording');
        return;
      }

      // Map actions to control types
      let controlType: string;
      switch (action) {
        case 'start_recording':
          controlType = 'recording_started';
          break;
        case 'stop_recording':
          controlType = 'recording_stopped';
          break;
        default:
          this.emitError(socket, 'INVALID_ACTION', 'Invalid recording control action');
          return;
      }

      // Broadcast recording control update to all session participants
      const controlUpdate: SessionControlUpdatePayload = {
        sessionId,
        type: controlType as any,
        timestamp: new Date().toISOString()
      };

      this.io.to(sessionId).emit(WebSocketEventType.SESSION_CONTROL_UPDATE, controlUpdate);
      
      console.log(`Recording control: ${action} for session ${sessionId} by interviewer ${userId}`);

    } catch (error) {
      console.error('Error handling interviewer recording control:', error);
      this.emitError(socket, 'INTERNAL_ERROR', 'Failed to process recording control');
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