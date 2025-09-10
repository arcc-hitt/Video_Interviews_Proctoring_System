import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { WebSocketService } from '../services/websocketService';
import { User } from '../models/User';
import { InterviewSession } from '../models/InterviewSession';
import { UserRole, SessionStatus } from '../types';

describe('WebSocket Integration', () => {
    let mongoServer: MongoMemoryServer;
    let httpServer: any;
    let wsService: WebSocketService;
    let clientSocket: ClientSocket;
    let port: number;
    let interviewerToken: string;
    let candidateToken: string;
    let testSessionId: string;

    beforeAll(async () => {
        // Start in-memory MongoDB
        mongoServer = await MongoMemoryServer.create();
        const mongoUri = mongoServer.getUri();
        await mongoose.connect(mongoUri);

        // Create test users
        const interviewerUserId = '123e4567-e89b-12d3-a456-426614174001';
        const candidateUserId = '123e4567-e89b-12d3-a456-426614174002';

        const interviewer = new User({
            userId: interviewerUserId,
            email: 'interviewer@test.com',
            name: 'Test Interviewer',
            role: UserRole.INTERVIEWER,
            password: 'hashedpassword',
            isActive: true
        });

        const candidate = new User({
            userId: candidateUserId,
            email: 'candidate@test.com',
            name: 'Test Candidate',
            role: UserRole.CANDIDATE,
            password: 'hashedpassword',
            isActive: true
        });

        await Promise.all([interviewer.save(), candidate.save()]);

        // Create test session
        testSessionId = '123e4567-e89b-12d3-a456-426614174000';
        const session = new InterviewSession({
            sessionId: testSessionId,
            candidateId: candidateUserId,
            candidateName: 'Test Candidate',
            startTime: new Date(),
            status: SessionStatus.ACTIVE
        });
        await session.save();

        // Generate JWT tokens
        const jwtSecret = process.env.JWT_SECRET || 'test-secret';

        interviewerToken = jwt.sign(
            { userId: interviewerUserId, email: 'interviewer@test.com', role: UserRole.INTERVIEWER },
            jwtSecret,
            { expiresIn: '1h' }
        );

        candidateToken = jwt.sign(
            { userId: candidateUserId, email: 'candidate@test.com', role: UserRole.CANDIDATE },
            jwtSecret,
            { expiresIn: '1h' }
        );

        // Create HTTP server and WebSocket service
        httpServer = createServer();
        wsService = new WebSocketService(httpServer);

        // Start server on random port
        await new Promise<void>((resolve) => {
            httpServer.listen(() => {
                const address = httpServer.address();
                port = typeof address === 'object' && address ? address.port : 3001;
                resolve();
            });
        });
    });

    afterAll(async () => {
        if (clientSocket && clientSocket.connected) {
            clientSocket.disconnect();
        }

        httpServer.close();
        await mongoose.connection.dropDatabase();
        await mongoose.connection.close();
        await mongoServer.stop();
    });

    afterEach(() => {
        if (clientSocket && clientSocket.connected) {
            clientSocket.disconnect();
        }
    });

    describe('Basic WebSocket Connection', () => {
        it('should connect with valid token', (done) => {
            clientSocket = Client(`http://localhost:${port}`, {
                auth: { token: candidateToken }
            });

            clientSocket.on('connect', () => {
                expect(clientSocket.connected).toBe(true);
                done();
            });

            clientSocket.on('connect_error', (error: any) => {
                done(error);
            });
        });

        it('should reject connection without token', (done) => {
            clientSocket = Client(`http://localhost:${port}`);

            clientSocket.on('connect_error', (error: any) => {
                expect(error.message).toContain('Authentication token required');
                done();
            });

            clientSocket.on('connect', () => {
                done(new Error('Should not connect without token'));
            });
        });
    });

    describe('WebSocket Service Statistics', () => {
        it('should track basic statistics', () => {
            const stats = wsService.getStats();
            expect(stats).toHaveProperty('totalConnections');
            expect(stats).toHaveProperty('activeSessions');
            expect(stats).toHaveProperty('connectedCandidates');
            expect(stats).toHaveProperty('connectedInterviewers');
            expect(stats).toHaveProperty('uptime');
            expect(typeof stats.uptime).toBe('number');
            expect(stats.uptime).toBeGreaterThan(0);
        });

        it('should return correct session count', () => {
            expect(wsService.getActiveSessionsCount()).toBe(0);
        });

        it('should return correct user count', () => {
            expect(wsService.getConnectedUsersCount()).toBe(0);
        });
    });

    describe('WebSocket Service Methods', () => {
        it('should check user connection status', () => {
            const userId = '123e4567-e89b-12d3-a456-426614174001';
            expect(wsService.isUserConnected(userId)).toBe(false);
        });

        it('should return null for non-existent session users', () => {
            const sessionUsers = wsService.getSessionUsers('non-existent-session');
            expect(sessionUsers).toBeNull();
        });

        it('should handle broadcast to non-existent session gracefully', () => {
            // This should not throw an error
            expect(() => {
                wsService.broadcastToSession('non-existent-session', 'test_event', { data: 'test' });
            }).not.toThrow();
        });

        it('should handle send to non-existent user gracefully', () => {
            // This should not throw an error
            expect(() => {
                wsService.sendToUser('non-existent-user', 'test_event', { data: 'test' });
            }).not.toThrow();
        });
    });
});