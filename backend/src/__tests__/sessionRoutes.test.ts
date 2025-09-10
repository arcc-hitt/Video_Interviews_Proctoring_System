import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import app from '../index';
import { User } from '../models/User';
import { InterviewSession } from '../models/InterviewSession';
import { ManualObservation } from '../models/ManualObservation';
import { UserRole, SessionStatus, ObservationType, Severity } from '../types';

describe('Session Routes', () => {
  let mongoServer: MongoMemoryServer;
  let interviewerToken: string;
  let candidateToken: string;
  let adminToken: string;
  let interviewerUserId: string;
  let candidateUserId: string;
  let adminUserId: string;
  let testSessionId: string;

  beforeAll(async () => {
    // Start in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Create test users
    interviewerUserId = '123e4567-e89b-12d3-a456-426614174001';
    candidateUserId = '123e4567-e89b-12d3-a456-426614174002';
    adminUserId = '123e4567-e89b-12d3-a456-426614174003';

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

    const admin = new User({
      userId: adminUserId,
      email: 'admin@test.com',
      name: 'Test Admin',
      role: UserRole.ADMIN,
      password: 'hashedpassword',
      isActive: true
    });

    await Promise.all([interviewer.save(), candidate.save(), admin.save()]);

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

    adminToken = jwt.sign(
      { userId: adminUserId, email: 'admin@test.com', role: UserRole.ADMIN },
      jwtSecret,
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clean up collections before each test
    await InterviewSession.deleteMany({});
    await ManualObservation.deleteMany({});
  });

  describe('POST /api/sessions/create', () => {
    it('should create a new session with valid interviewer token', async () => {
      const sessionData = {
        candidateName: 'John Doe',
        candidateEmail: 'john@test.com',
        interviewerUserId
      };

      const response = await request(app)
        .post('/api/sessions/create')
        .set('Authorization', `Bearer ${interviewerToken}`)
        .send(sessionData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.candidateName).toBe('John Doe');
      expect(response.body.data.sessionId).toBeDefined();
      expect(response.body.data.candidateId).toBeDefined();

      testSessionId = response.body.data.sessionId;
    });

    it('should reject session creation with candidate token', async () => {
      const sessionData = {
        candidateName: 'John Doe',
        candidateEmail: 'john@test.com',
        interviewerUserId
      };

      const response = await request(app)
        .post('/api/sessions/create')
        .set('Authorization', `Bearer ${candidateToken}`)
        .send(sessionData)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Unauthorized');
    });

    it('should reject session creation without token', async () => {
      const sessionData = {
        candidateName: 'John Doe',
        candidateEmail: 'john@test.com',
        interviewerUserId
      };

      await request(app)
        .post('/api/sessions/create')
        .send(sessionData)
        .expect(401);
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/sessions/create')
        .set('Authorization', `Bearer ${interviewerToken}`)
        .send({})
        .expect(500); // Validation error will cause 500

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/sessions/:sessionId', () => {
    beforeEach(async () => {
      // Create a test session
      const session = new InterviewSession({
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
        candidateId: candidateUserId,
        candidateName: 'Test Candidate',
        startTime: new Date(),
        status: SessionStatus.ACTIVE
      });
      await session.save();
      testSessionId = session.sessionId;
    });

    it('should get session details with valid token', async () => {
      const response = await request(app)
        .get(`/api/sessions/${testSessionId}`)
        .set('Authorization', `Bearer ${interviewerToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.sessionId).toBe(testSessionId);
      expect(response.body.data.candidateName).toBe('Test Candidate');
    });

    it('should return 404 for non-existent session', async () => {
      const response = await request(app)
        .get('/api/sessions/123e4567-e89b-12d3-a456-426614174999')
        .set('Authorization', `Bearer ${interviewerToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Not found');
    });

    it('should reject request without token', async () => {
      await request(app)
        .get(`/api/sessions/${testSessionId}`)
        .expect(401);
    });
  });

  describe('PATCH /api/sessions/:sessionId/status', () => {
    beforeEach(async () => {
      const session = new InterviewSession({
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
        candidateId: candidateUserId,
        candidateName: 'Test Candidate',
        startTime: new Date(),
        status: SessionStatus.ACTIVE
      });
      await session.save();
      testSessionId = session.sessionId;
    });

    it('should update session status', async () => {
      const response = await request(app)
        .patch(`/api/sessions/${testSessionId}/status`)
        .set('Authorization', `Bearer ${interviewerToken}`)
        .send({ status: SessionStatus.COMPLETED })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe(SessionStatus.COMPLETED);
      expect(response.body.data.endTime).toBeDefined();
    });

    it('should reject invalid status', async () => {
      const response = await request(app)
        .patch(`/api/sessions/${testSessionId}/status`)
        .set('Authorization', `Bearer ${interviewerToken}`)
        .send({ status: 'invalid-status' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid status');
    });

    it('should return 404 for non-existent session', async () => {
      const response = await request(app)
        .patch('/api/sessions/123e4567-e89b-12d3-a456-426614174999/status')
        .set('Authorization', `Bearer ${interviewerToken}`)
        .send({ status: SessionStatus.COMPLETED })
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/sessions/:sessionId/end', () => {
    beforeEach(async () => {
      const session = new InterviewSession({
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
        candidateId: candidateUserId,
        candidateName: 'Test Candidate',
        startTime: new Date(),
        status: SessionStatus.ACTIVE
      });
      await session.save();
      testSessionId = session.sessionId;
    });

    it('should end session successfully', async () => {
      const response = await request(app)
        .post(`/api/sessions/${testSessionId}/end`)
        .set('Authorization', `Bearer ${interviewerToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe(SessionStatus.COMPLETED);
      expect(response.body.data.endTime).toBeDefined();
      expect(response.body.data.duration).toBeDefined();
    });
  });

  describe('POST /api/sessions/:sessionId/terminate', () => {
    beforeEach(async () => {
      const session = new InterviewSession({
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
        candidateId: candidateUserId,
        candidateName: 'Test Candidate',
        startTime: new Date(),
        status: SessionStatus.ACTIVE
      });
      await session.save();
      testSessionId = session.sessionId;
    });

    it('should terminate session successfully', async () => {
      const response = await request(app)
        .post(`/api/sessions/${testSessionId}/terminate`)
        .set('Authorization', `Bearer ${interviewerToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe(SessionStatus.TERMINATED);
      expect(response.body.data.endTime).toBeDefined();
    });
  });

  describe('POST /api/sessions/:sessionId/observations', () => {
    beforeEach(async () => {
      const session = new InterviewSession({
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
        candidateId: candidateUserId,
        candidateName: 'Test Candidate',
        startTime: new Date(),
        status: SessionStatus.ACTIVE
      });
      await session.save();
      testSessionId = session.sessionId;
    });

    it('should create manual observation with interviewer token', async () => {
      const observationData = {
        observationType: ObservationType.SUSPICIOUS_BEHAVIOR,
        description: 'Candidate looking at phone',
        severity: Severity.HIGH,
        flagged: true
      };

      const response = await request(app)
        .post(`/api/sessions/${testSessionId}/observations`)
        .set('Authorization', `Bearer ${interviewerToken}`)
        .send(observationData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.description).toBe('Candidate looking at phone');
      expect(response.body.data.severity).toBe(Severity.HIGH);
      expect(response.body.data.flagged).toBe(true);
    });

    it('should reject observation creation with candidate token', async () => {
      const observationData = {
        observationType: ObservationType.SUSPICIOUS_BEHAVIOR,
        description: 'Test observation',
        severity: Severity.LOW,
        flagged: false
      };

      const response = await request(app)
        .post(`/api/sessions/${testSessionId}/observations`)
        .set('Authorization', `Bearer ${candidateToken}`)
        .send(observationData)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Unauthorized');
    });

    it('should return 404 for non-existent session', async () => {
      const observationData = {
        observationType: ObservationType.GENERAL_NOTE,
        description: 'Test note',
        severity: Severity.LOW,
        flagged: false
      };

      const response = await request(app)
        .post('/api/sessions/123e4567-e89b-12d3-a456-426614174999/observations')
        .set('Authorization', `Bearer ${interviewerToken}`)
        .send(observationData)
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/sessions/:sessionId/observations', () => {
    beforeEach(async () => {
      const session = new InterviewSession({
        sessionId: '123e4567-e89b-12d3-a456-426614174000',
        candidateId: candidateUserId,
        candidateName: 'Test Candidate',
        startTime: new Date(),
        status: SessionStatus.ACTIVE
      });
      await session.save();
      testSessionId = session.sessionId;

      // Create test observations
      const observation1 = new ManualObservation({
        observationId: '123e4567-e89b-12d3-a456-426614174010',
        sessionId: testSessionId,
        interviewerId: interviewerUserId,
        timestamp: new Date(),
        observationType: ObservationType.SUSPICIOUS_BEHAVIOR,
        description: 'First observation',
        severity: Severity.HIGH,
        flagged: true
      });

      const observation2 = new ManualObservation({
        observationId: '123e4567-e89b-12d3-a456-426614174011',
        sessionId: testSessionId,
        interviewerId: interviewerUserId,
        timestamp: new Date(),
        observationType: ObservationType.GENERAL_NOTE,
        description: 'Second observation',
        severity: Severity.LOW,
        flagged: false
      });

      await Promise.all([observation1.save(), observation2.save()]);
    });

    it('should get session observations', async () => {
      const response = await request(app)
        .get(`/api/sessions/${testSessionId}/observations`)
        .set('Authorization', `Bearer ${interviewerToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].description).toBeDefined();
    });

    it('should return empty array for session with no observations', async () => {
      // Create a new session without observations
      const newSession = new InterviewSession({
        sessionId: '123e4567-e89b-12d3-a456-426614174001',
        candidateId: candidateUserId,
        candidateName: 'Test Candidate 2',
        startTime: new Date(),
        status: SessionStatus.ACTIVE
      });
      await newSession.save();

      const response = await request(app)
        .get(`/api/sessions/${newSession.sessionId}/observations`)
        .set('Authorization', `Bearer ${interviewerToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(0);
    });
  });

  describe('GET /api/sessions', () => {
    beforeEach(async () => {
      // Create multiple test sessions
      const sessions = [
        new InterviewSession({
          sessionId: '123e4567-e89b-12d3-a456-426614174000',
          candidateId: candidateUserId,
          candidateName: 'Active Session',
          startTime: new Date(),
          status: SessionStatus.ACTIVE
        }),
        new InterviewSession({
          sessionId: '123e4567-e89b-12d3-a456-426614174001',
          candidateId: candidateUserId,
          candidateName: 'Completed Session',
          startTime: new Date(Date.now() - 3600000), // 1 hour ago
          endTime: new Date(),
          status: SessionStatus.COMPLETED
        }),
        new InterviewSession({
          sessionId: '123e4567-e89b-12d3-a456-426614174002',
          candidateId: candidateUserId,
          candidateName: 'Terminated Session',
          startTime: new Date(Date.now() - 7200000), // 2 hours ago
          endTime: new Date(Date.now() - 3600000), // 1 hour ago
          status: SessionStatus.TERMINATED
        })
      ];

      await Promise.all(sessions.map(session => session.save()));
    });

    it('should get all sessions', async () => {
      const response = await request(app)
        .get('/api/sessions')
        .set('Authorization', `Bearer ${interviewerToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.sessions).toHaveLength(3);
      expect(response.body.data.pagination.total).toBe(3);
    });

    it('should filter sessions by status', async () => {
      const response = await request(app)
        .get('/api/sessions?status=active')
        .set('Authorization', `Bearer ${interviewerToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.sessions).toHaveLength(1);
      expect(response.body.data.sessions[0].status).toBe(SessionStatus.ACTIVE);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/sessions?limit=2&offset=1')
        .set('Authorization', `Bearer ${interviewerToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.sessions).toHaveLength(2);
      expect(response.body.data.pagination.limit).toBe(2);
      expect(response.body.data.pagination.offset).toBe(1);
    });
  });

  describe('GET /api/sessions/stats/websocket', () => {
    it('should return WebSocket statistics', async () => {
      const response = await request(app)
        .get('/api/sessions/stats/websocket')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(503); // Service unavailable since WebSocket service is not initialized in tests

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Service unavailable');
    });
  });
});