import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import { WebSocketService } from '../services/websocketService';
import { WebSocketEventType, WebSocketUserRole } from '../types/websocket';
import { UserRole } from '../types';

describe('WebSocket Service', () => {
  let httpServer: HTTPServer;
  let wsService: WebSocketService;
  let clientSocket: ClientSocket;
  let interviewerSocket: ClientSocket;
  let port: number;

  const mockJWTSecret = 'test-secret';
  const mockSessionId = '123e4567-e89b-12d3-a456-426614174000';
  const mockCandidateId = '123e4567-e89b-12d3-a456-426614174001';
  const mockInterviewerId = '123e4567-e89b-12d3-a456-426614174002';

  const createMockToken = (userId: string, role: UserRole) => {
    return jwt.sign(
      {
        userId,
        email: `${userId}@test.com`,
        role,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
      },
      mockJWTSecret
    );
  };

  beforeAll(() => {
    process.env.JWT_SECRET = mockJWTSecret;
  });

  beforeEach((done) => {
    // Create HTTP server
    httpServer = new HTTPServer();
    
    // Initialize WebSocket service
    wsService = new WebSocketService(httpServer);

    // Start server on random port
    httpServer.listen(() => {
      const address = httpServer.address();
      port = typeof address === 'object' && address ? address.port : 3001;
      done();
    });
  });

  afterEach((done) => {
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
    if (interviewerSocket && interviewerSocket.connected) {
      interviewerSocket.disconnect();
    }
    
    httpServer.close(() => {
      done();
    });
  });

  describe('Connection and Authentication', () => {
    it('should reject connection without token', (done) => {
      clientSocket = Client(`http://localhost:${port}`);
      
      clientSocket.on('connect_error', (error: any) => {
        expect(error.message).toContain('Authentication token required');
        done();
      });
    });

    it('should reject connection with invalid token', (done) => {
      clientSocket = Client(`http://localhost:${port}`, {
        auth: { token: 'invalid-token' }
      });
      
      clientSocket.on('connect_error', (error: any) => {
        expect(error.message).toContain('Invalid authentication token');
        done();
      });
    });

    it('should accept connection with valid token', (done) => {
      const token = createMockToken(mockCandidateId, UserRole.CANDIDATE);
      
      clientSocket = Client(`http://localhost:${port}`, {
        auth: { token }
      });
      
      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        done();
      });
    });
  });

  describe('Session Management', () => {
    beforeEach((done) => {
      const candidateToken = createMockToken(mockCandidateId, UserRole.CANDIDATE);
      const interviewerToken = createMockToken(mockInterviewerId, UserRole.INTERVIEWER);
      
      clientSocket = Client(`http://localhost:${port}`, {
        auth: { token: candidateToken }
      });
      
      interviewerSocket = Client(`http://localhost:${port}`, {
        auth: { token: interviewerToken }
      });

      let connectedCount = 0;
      const checkBothConnected = () => {
        connectedCount++;
        if (connectedCount === 2) done();
      };

      clientSocket.on('connect', checkBothConnected);
      interviewerSocket.on('connect', checkBothConnected);
    });

    it('should allow candidate to join session', (done) => {
      clientSocket.emit(WebSocketEventType.JOIN_SESSION, {
        sessionId: mockSessionId,
        role: WebSocketUserRole.CANDIDATE,
        userId: mockCandidateId
      });

      clientSocket.on(WebSocketEventType.SESSION_JOINED, (payload: any) => {
        expect(payload.sessionId).toBe(mockSessionId);
        expect(payload.role).toBe(WebSocketUserRole.CANDIDATE);
        expect(payload.userId).toBe(mockCandidateId);
        expect(payload.connectedUsers.candidates).toHaveLength(1);
        done();
      });
    });

    it('should allow interviewer to join session', (done) => {
      interviewerSocket.emit(WebSocketEventType.JOIN_SESSION, {
        sessionId: mockSessionId,
        role: WebSocketUserRole.INTERVIEWER,
        userId: mockInterviewerId
      });

      interviewerSocket.on(WebSocketEventType.SESSION_JOINED, (payload: any) => {
        expect(payload.sessionId).toBe(mockSessionId);
        expect(payload.role).toBe(WebSocketUserRole.INTERVIEWER);
        expect(payload.userId).toBe(mockInterviewerId);
        expect(payload.connectedUsers.interviewers).toHaveLength(1);
        done();
      });
    });

    it('should notify other users when someone joins', (done) => {
      // First, candidate joins
      clientSocket.emit(WebSocketEventType.JOIN_SESSION, {
        sessionId: mockSessionId,
        role: WebSocketUserRole.CANDIDATE,
        userId: mockCandidateId
      });

      // Set up listener for when interviewer joins
      clientSocket.on(WebSocketEventType.SESSION_JOINED, (payload: any) => {
        if (payload.userId === mockInterviewerId) {
          expect(payload.connectedUsers.candidates).toHaveLength(1);
          expect(payload.connectedUsers.interviewers).toHaveLength(1);
          done();
        }
      });

      // Wait a bit then have interviewer join
      setTimeout(() => {
        interviewerSocket.emit(WebSocketEventType.JOIN_SESSION, {
          sessionId: mockSessionId,
          role: WebSocketUserRole.INTERVIEWER,
          userId: mockInterviewerId
        });
      }, 100);
    });

    it('should handle session leaving', (done) => {
      // Both join first
      clientSocket.emit(WebSocketEventType.JOIN_SESSION, {
        sessionId: mockSessionId,
        role: WebSocketUserRole.CANDIDATE,
        userId: mockCandidateId
      });

      interviewerSocket.emit(WebSocketEventType.JOIN_SESSION, {
        sessionId: mockSessionId,
        role: WebSocketUserRole.INTERVIEWER,
        userId: mockInterviewerId
      });

      // Set up listener for leave event
      interviewerSocket.on(WebSocketEventType.SESSION_LEFT, (payload: any) => {
        expect(payload.sessionId).toBe(mockSessionId);
        expect(payload.userId).toBe(mockCandidateId);
        done();
      });

      // Wait then have candidate leave
      setTimeout(() => {
        clientSocket.emit(WebSocketEventType.LEAVE_SESSION, mockSessionId);
      }, 200);
    });
  });

  describe('Detection Events', () => {
    beforeEach((done) => {
      const candidateToken = createMockToken(mockCandidateId, UserRole.CANDIDATE);
      const interviewerToken = createMockToken(mockInterviewerId, UserRole.INTERVIEWER);
      
      clientSocket = Client(`http://localhost:${port}`, {
        auth: { token: candidateToken }
      });
      
      interviewerSocket = Client(`http://localhost:${port}`, {
        auth: { token: interviewerToken }
      });

      let joinedCount = 0;
      const checkBothJoined = () => {
        joinedCount++;
        if (joinedCount === 2) done();
      };

      clientSocket.on('connect', () => {
        clientSocket.emit(WebSocketEventType.JOIN_SESSION, {
          sessionId: mockSessionId,
          role: WebSocketUserRole.CANDIDATE,
          userId: mockCandidateId
        });
        clientSocket.on(WebSocketEventType.SESSION_JOINED, checkBothJoined);
      });

      interviewerSocket.on('connect', () => {
        interviewerSocket.emit(WebSocketEventType.JOIN_SESSION, {
          sessionId: mockSessionId,
          role: WebSocketUserRole.INTERVIEWER,
          userId: mockInterviewerId
        });
        interviewerSocket.on(WebSocketEventType.SESSION_JOINED, checkBothJoined);
      });
    });

    it('should broadcast detection events to interviewers', (done) => {
      const detectionEvent = {
        sessionId: mockSessionId,
        candidateId: mockCandidateId,
        eventType: 'focus-loss' as const,
        timestamp: new Date().toISOString(),
        duration: 5,
        confidence: 0.95,
        metadata: {
          gazeDirection: { x: 0.5, y: 0.3 }
        }
      };

      interviewerSocket.on(WebSocketEventType.DETECTION_EVENT_BROADCAST, (payload: any) => {
        expect(payload.sessionId).toBe(mockSessionId);
        expect(payload.eventType).toBe('focus-loss');
        expect(payload.confidence).toBe(0.95);
        done();
      });

      clientSocket.emit(WebSocketEventType.DETECTION_EVENT, detectionEvent);
    });
  });

  describe('Manual Flagging', () => {
    beforeEach((done) => {
      const interviewerToken = createMockToken(mockInterviewerId, UserRole.INTERVIEWER);
      
      interviewerSocket = Client(`http://localhost:${port}`, {
        auth: { token: interviewerToken }
      });

      interviewerSocket.on('connect', () => {
        interviewerSocket.emit(WebSocketEventType.JOIN_SESSION, {
          sessionId: mockSessionId,
          role: WebSocketUserRole.INTERVIEWER,
          userId: mockInterviewerId
        });
        interviewerSocket.on(WebSocketEventType.SESSION_JOINED, () => done());
      });
    });

    it('should allow interviewers to create manual flags', (done) => {
      const manualFlag = {
        sessionId: mockSessionId,
        interviewerId: mockInterviewerId,
        timestamp: new Date().toISOString(),
        flagType: 'suspicious_behavior' as const,
        description: 'Candidate looking at phone',
        severity: 'high' as const
      };

      interviewerSocket.on(WebSocketEventType.MANUAL_FLAG_BROADCAST, (payload: any) => {
        expect(payload.sessionId).toBe(mockSessionId);
        expect(payload.flagType).toBe('suspicious_behavior');
        expect(payload.description).toBe('Candidate looking at phone');
        done();
      });

      interviewerSocket.emit(WebSocketEventType.MANUAL_FLAG, manualFlag);
    });
  });

  describe('Video Streaming', () => {
    beforeEach((done) => {
      const candidateToken = createMockToken(mockCandidateId, UserRole.CANDIDATE);
      
      clientSocket = Client(`http://localhost:${port}`, {
        auth: { token: candidateToken }
      });

      clientSocket.on('connect', () => {
        clientSocket.emit(WebSocketEventType.JOIN_SESSION, {
          sessionId: mockSessionId,
          role: WebSocketUserRole.CANDIDATE,
          userId: mockCandidateId
        });
        clientSocket.on(WebSocketEventType.SESSION_JOINED, () => done());
      });
    });

    it('should handle video stream start events', (done) => {
      const streamPayload = {
        sessionId: mockSessionId,
        userId: mockCandidateId,
        streamId: 'stream-123'
      };

      clientSocket.on(WebSocketEventType.VIDEO_STREAM_START, (payload: any) => {
        expect(payload.sessionId).toBe(mockSessionId);
        expect(payload.streamId).toBe('stream-123');
        done();
      });

      clientSocket.emit(WebSocketEventType.VIDEO_STREAM_START, streamPayload);
    });

    it('should handle WebRTC signaling', (done) => {
      const candidateToken = createMockToken(mockCandidateId, UserRole.CANDIDATE);
      const interviewerToken = createMockToken(mockInterviewerId, UserRole.INTERVIEWER);
      
      const candidateSocket = Client(`http://localhost:${port}`, {
        auth: { token: candidateToken }
      });
      
      const interviewerSocket2 = Client(`http://localhost:${port}`, {
        auth: { token: interviewerToken }
      });

      const offer = {
        sessionId: mockSessionId,
        fromUserId: mockCandidateId,
        toUserId: mockInterviewerId,
        offer: { type: 'offer' as const, sdp: 'mock-sdp' }
      };

      interviewerSocket2.on(WebSocketEventType.VIDEO_STREAM_OFFER, (payload: any) => {
        expect(payload.fromUserId).toBe(mockCandidateId);
        expect(payload.toUserId).toBe(mockInterviewerId);
        expect(payload.offer.type).toBe('offer');
        candidateSocket.disconnect();
        interviewerSocket2.disconnect();
        done();
      });

      candidateSocket.on('connect', () => {
        candidateSocket.emit(WebSocketEventType.VIDEO_STREAM_OFFER, offer);
      });
    });
  });

  describe('Service Statistics', () => {
    it('should track connection statistics', () => {
      const stats = wsService.getStats();
      expect(stats).toHaveProperty('totalConnections');
      expect(stats).toHaveProperty('activeSessions');
      expect(stats).toHaveProperty('connectedCandidates');
      expect(stats).toHaveProperty('connectedInterviewers');
      expect(stats).toHaveProperty('uptime');
      expect(typeof stats.uptime).toBe('number');
    });

    it('should track active sessions count', () => {
      expect(wsService.getActiveSessionsCount()).toBe(0);
    });

    it('should track connected users count', () => {
      expect(wsService.getConnectedUsersCount()).toBe(0);
    });
  });

  describe('Error Handling', () => {
    beforeEach((done) => {
      const candidateToken = createMockToken(mockCandidateId, UserRole.CANDIDATE);
      
      clientSocket = Client(`http://localhost:${port}`, {
        auth: { token: candidateToken }
      });

      clientSocket.on('connect', done);
    });

    it('should handle invalid session join attempts', (done) => {
      clientSocket.on(WebSocketEventType.ERROR, (error: any) => {
        expect(error.code).toBe('SESSION_NOT_FOUND');
        done();
      });

      clientSocket.emit(WebSocketEventType.JOIN_SESSION, {
        sessionId: 'invalid-session-id',
        role: WebSocketUserRole.CANDIDATE,
        userId: mockCandidateId
      });
    });

    it('should handle unauthorized manual flag attempts', (done) => {
      const candidateToken = createMockToken(mockCandidateId, UserRole.CANDIDATE);
      
      const candidateSocket = Client(`http://localhost:${port}`, {
        auth: { token: candidateToken }
      });

      candidateSocket.on('connect', () => {
        candidateSocket.emit(WebSocketEventType.JOIN_SESSION, {
          sessionId: mockSessionId,
          role: WebSocketUserRole.CANDIDATE,
          userId: mockCandidateId
        });

        candidateSocket.on(WebSocketEventType.ERROR, (error: any) => {
          expect(error.code).toBe('UNAUTHORIZED');
          candidateSocket.disconnect();
          done();
        });

        candidateSocket.emit(WebSocketEventType.MANUAL_FLAG, {
          sessionId: mockSessionId,
          interviewerId: mockCandidateId,
          timestamp: new Date().toISOString(),
          flagType: 'suspicious_behavior',
          description: 'Test flag',
          severity: 'low'
        });
      });
    });
  });
});