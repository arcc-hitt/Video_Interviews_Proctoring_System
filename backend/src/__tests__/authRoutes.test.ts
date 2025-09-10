import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { v4 as uuidv4 } from 'uuid';
import authRoutes from '../routes/authRoutes';
import { User } from '../models';
import { InterviewSession } from '../models/InterviewSession';
import { UserRole, SessionStatus } from '../types';
import { generateToken } from '../middleware/auth';

// Create Express app for testing
const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

// MongoDB Memory Server
let mongoServer: MongoMemoryServer;

// Test data
const testUsers = {
  candidate: {
    userId: uuidv4(),
    email: 'candidate@test.com',
    password: 'password123',
    name: 'Test Candidate',
    role: UserRole.CANDIDATE
  },
  interviewer: {
    userId: uuidv4(),
    email: 'interviewer@test.com',
    password: 'password123',
    name: 'Test Interviewer',
    role: UserRole.INTERVIEWER
  },
  admin: {
    userId: uuidv4(),
    email: 'admin@test.com',
    password: 'password123',
    name: 'Test Admin',
    role: UserRole.ADMIN
  }
};

describe('Authentication Routes', () => {
  beforeAll(async () => {
    // Start MongoDB Memory Server
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    
    // Connect to MongoDB
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    // Clean up
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear database before each test
    await User.deleteMany({});
    await InterviewSession.deleteMany({});
  });

  describe('POST /api/auth/register', () => {
    it('should register a new candidate successfully', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: testUsers.candidate.email,
          password: testUsers.candidate.password,
          name: testUsers.candidate.name,
          role: testUsers.candidate.role
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(testUsers.candidate.email);
      expect(response.body.data.user.role).toBe(UserRole.CANDIDATE);
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.user.password).toBeUndefined();
    });

    it('should register a new interviewer successfully', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: testUsers.interviewer.email,
          password: testUsers.interviewer.password,
          name: testUsers.interviewer.name,
          role: testUsers.interviewer.role
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.role).toBe(UserRole.INTERVIEWER);
    });

    it('should fail to register user with existing email', async () => {
      // Create user first
      await User.create(testUsers.candidate);

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: testUsers.candidate.email,
          password: 'newpassword123',
          name: 'Another User',
          role: UserRole.CANDIDATE
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('already exists');
    });

    it('should fail with invalid email format', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'invalid-email',
          password: testUsers.candidate.password,
          name: testUsers.candidate.name,
          role: testUsers.candidate.role
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should fail with short password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: testUsers.candidate.email,
          password: '123',
          name: testUsers.candidate.name,
          role: testUsers.candidate.role
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should fail with invalid role', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: testUsers.candidate.email,
          password: testUsers.candidate.password,
          name: testUsers.candidate.name,
          role: 'invalid-role'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Create test users
      await User.create(testUsers.candidate);
      await User.create(testUsers.interviewer);
      await User.create(testUsers.admin);
    });

    it('should login candidate successfully', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUsers.candidate.email,
          password: testUsers.candidate.password
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(testUsers.candidate.email);
      expect(response.body.data.user.role).toBe(UserRole.CANDIDATE);
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.user.password).toBeUndefined();
    });

    it('should login interviewer successfully', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUsers.interviewer.email,
          password: testUsers.interviewer.password
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.role).toBe(UserRole.INTERVIEWER);
    });

    it('should fail with incorrect password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUsers.candidate.email,
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid email or password');
    });

    it('should fail with non-existent email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@test.com',
          password: testUsers.candidate.password
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid email or password');
    });

    it('should fail with inactive user', async () => {
      // Deactivate user
      await User.findOneAndUpdate(
        { email: testUsers.candidate.email },
        { isActive: false }
      );

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUsers.candidate.email,
          password: testUsers.candidate.password
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/auth/me', () => {
    let candidateToken: string;
    let interviewerToken: string;

    beforeEach(async () => {
      // Create test users
      const candidate = await User.create(testUsers.candidate);
      const interviewer = await User.create(testUsers.interviewer);

      candidateToken = generateToken(candidate);
      interviewerToken = generateToken(interviewer);
    });

    it('should return candidate profile successfully', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${candidateToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.email).toBe(testUsers.candidate.email);
      expect(response.body.data.role).toBe(UserRole.CANDIDATE);
      expect(response.body.data.password).toBeUndefined();
    });

    it('should return interviewer profile successfully', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${interviewerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.role).toBe(UserRole.INTERVIEWER);
    });

    it('should fail without token', async () => {
      const response = await request(app)
        .get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('No token provided');
    });

    it('should fail with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/logout', () => {
    let candidateToken: string;

    beforeEach(async () => {
      const candidate = await User.create(testUsers.candidate);
      candidateToken = generateToken(candidate);
    });

    it('should logout successfully', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${candidateToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Logout successful');
    });

    it('should fail without authentication', async () => {
      const response = await request(app)
        .post('/api/auth/logout');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/sessions/create', () => {
    let interviewerToken: string;
    let adminToken: string;
    let candidateToken: string;

    beforeEach(async () => {
      const interviewer = await User.create(testUsers.interviewer);
      const admin = await User.create(testUsers.admin);
      const candidate = await User.create(testUsers.candidate);

      interviewerToken = generateToken(interviewer);
      adminToken = generateToken(admin);
      candidateToken = generateToken(candidate);
    });

    it('should create session successfully as interviewer', async () => {
      const response = await request(app)
        .post('/api/auth/sessions/create')
        .set('Authorization', `Bearer ${interviewerToken}`)
        .send({
          candidateName: 'John Doe',
          candidateEmail: 'john.doe@test.com',
          interviewerUserId: testUsers.interviewer.userId
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.session.candidateName).toBe('John Doe');
      expect(response.body.data.session.status).toBe(SessionStatus.ACTIVE);
      expect(response.body.data.candidateId).toBeDefined();
    });

    it('should create session successfully as admin', async () => {
      const response = await request(app)
        .post('/api/auth/sessions/create')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          candidateName: 'Jane Doe',
          interviewerUserId: testUsers.interviewer.userId
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    it('should fail as candidate', async () => {
      const response = await request(app)
        .post('/api/auth/sessions/create')
        .set('Authorization', `Bearer ${candidateToken}`)
        .send({
          candidateName: 'John Doe',
          interviewerUserId: testUsers.interviewer.userId
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Insufficient permissions');
    });

    it('should fail with non-existent interviewer', async () => {
      const response = await request(app)
        .post('/api/auth/sessions/create')
        .set('Authorization', `Bearer ${interviewerToken}`)
        .send({
          candidateName: 'John Doe',
          interviewerUserId: uuidv4()
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Interviewer not found');
    });

    it('should fail if candidate already has active session', async () => {
      // Create existing session
      const sessionId = uuidv4();
      await InterviewSession.create({
        sessionId,
        candidateId: testUsers.candidate.userId,
        candidateName: testUsers.candidate.name,
        startTime: new Date(),
        status: SessionStatus.ACTIVE
      });

      const response = await request(app)
        .post('/api/auth/sessions/create')
        .set('Authorization', `Bearer ${interviewerToken}`)
        .send({
          candidateName: testUsers.candidate.name,
          candidateEmail: testUsers.candidate.email,
          interviewerUserId: testUsers.interviewer.userId
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('already has an active');
    });
  });

  describe('POST /api/auth/sessions/pair', () => {
    let interviewerToken: string;
    let candidateToken: string;
    let sessionId: string;

    beforeEach(async () => {
      const interviewer = await User.create(testUsers.interviewer);
      const candidate = await User.create(testUsers.candidate);

      interviewerToken = generateToken(interviewer);
      candidateToken = generateToken(candidate);

      // Create test session
      sessionId = uuidv4();
      await InterviewSession.create({
        sessionId,
        candidateId: testUsers.candidate.userId,
        candidateName: testUsers.candidate.name,
        startTime: new Date(),
        status: SessionStatus.ACTIVE
      });
    });

    it('should pair session successfully as interviewer', async () => {
      const response = await request(app)
        .post('/api/auth/sessions/pair')
        .set('Authorization', `Bearer ${interviewerToken}`)
        .send({
          sessionId,
          interviewerUserId: testUsers.interviewer.userId
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.paired).toBe(true);
      expect(response.body.data.session.sessionId).toBe(sessionId);
    });

    it('should fail as candidate', async () => {
      const response = await request(app)
        .post('/api/auth/sessions/pair')
        .set('Authorization', `Bearer ${candidateToken}`)
        .send({
          sessionId,
          interviewerUserId: testUsers.interviewer.userId
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it('should fail with non-existent session', async () => {
      const response = await request(app)
        .post('/api/auth/sessions/pair')
        .set('Authorization', `Bearer ${interviewerToken}`)
        .send({
          sessionId: uuidv4(),
          interviewerUserId: testUsers.interviewer.userId
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Session not found');
    });
  });

  describe('GET /api/auth/sessions', () => {
    let candidateToken: string;
    let interviewerToken: string;
    let adminToken: string;

    beforeEach(async () => {
      const candidate = await User.create(testUsers.candidate);
      const interviewer = await User.create(testUsers.interviewer);
      const admin = await User.create(testUsers.admin);

      candidateToken = generateToken(candidate);
      interviewerToken = generateToken(interviewer);
      adminToken = generateToken(admin);

      // Create test sessions
      await InterviewSession.create({
        sessionId: uuidv4(),
        candidateId: testUsers.candidate.userId,
        candidateName: testUsers.candidate.name,
        startTime: new Date(),
        status: SessionStatus.ACTIVE
      });

      await InterviewSession.create({
        sessionId: uuidv4(),
        candidateId: uuidv4(),
        candidateName: 'Other Candidate',
        startTime: new Date(),
        status: SessionStatus.COMPLETED
      });
    });

    it('should return candidate sessions for candidate', async () => {
      const response = await request(app)
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${candidateToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].candidateId).toBe(testUsers.candidate.userId);
    });

    it('should return active sessions for interviewer', async () => {
      const response = await request(app)
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${interviewerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].status).toBe(SessionStatus.ACTIVE);
    });

    it('should return all sessions for admin', async () => {
      const response = await request(app)
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
    });
  });

  describe('GET /api/auth/sessions/:sessionId', () => {
    let candidateToken: string;
    let interviewerToken: string;
    let sessionId: string;
    let otherSessionId: string;

    beforeEach(async () => {
      const candidate = await User.create(testUsers.candidate);
      const interviewer = await User.create(testUsers.interviewer);

      candidateToken = generateToken(candidate);
      interviewerToken = generateToken(interviewer);

      // Create test sessions
      sessionId = uuidv4();
      await InterviewSession.create({
        sessionId,
        candidateId: testUsers.candidate.userId,
        candidateName: testUsers.candidate.name,
        startTime: new Date(),
        status: SessionStatus.ACTIVE
      });

      otherSessionId = uuidv4();
      await InterviewSession.create({
        sessionId: otherSessionId,
        candidateId: uuidv4(),
        candidateName: 'Other Candidate',
        startTime: new Date(),
        status: SessionStatus.ACTIVE
      });
    });

    it('should return session for candidate owner', async () => {
      const response = await request(app)
        .get(`/api/auth/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${candidateToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.sessionId).toBe(sessionId);
    });

    it('should return session for interviewer', async () => {
      const response = await request(app)
        .get(`/api/auth/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${interviewerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should deny access to other candidate session', async () => {
      const response = await request(app)
        .get(`/api/auth/sessions/${otherSessionId}`)
        .set('Authorization', `Bearer ${candidateToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Access denied');
    });

    it('should fail with non-existent session', async () => {
      const response = await request(app)
        .get(`/api/auth/sessions/${uuidv4()}`)
        .set('Authorization', `Bearer ${candidateToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/auth/sessions/:sessionId/end', () => {
    let interviewerToken: string;
    let candidateToken: string;
    let sessionId: string;

    beforeEach(async () => {
      const interviewer = await User.create(testUsers.interviewer);
      const candidate = await User.create(testUsers.candidate);

      interviewerToken = generateToken(interviewer);
      candidateToken = generateToken(candidate);

      // Create test session
      sessionId = uuidv4();
      await InterviewSession.create({
        sessionId,
        candidateId: testUsers.candidate.userId,
        candidateName: testUsers.candidate.name,
        startTime: new Date(),
        status: SessionStatus.ACTIVE
      });
    });

    it('should end session successfully as interviewer', async () => {
      const response = await request(app)
        .put(`/api/auth/sessions/${sessionId}/end`)
        .set('Authorization', `Bearer ${interviewerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe(SessionStatus.COMPLETED);
      expect(response.body.data.endTime).toBeDefined();
      expect(response.body.data.duration).toBeDefined();
    });

    it('should fail as candidate', async () => {
      const response = await request(app)
        .put(`/api/auth/sessions/${sessionId}/end`)
        .set('Authorization', `Bearer ${candidateToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it('should fail with non-existent session', async () => {
      const response = await request(app)
        .put(`/api/auth/sessions/${uuidv4()}/end`)
        .set('Authorization', `Bearer ${interviewerToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it('should fail with already completed session', async () => {
      // End session first
      await request(app)
        .put(`/api/auth/sessions/${sessionId}/end`)
        .set('Authorization', `Bearer ${interviewerToken}`);

      // Try to end again
      const response = await request(app)
        .put(`/api/auth/sessions/${sessionId}/end`)
        .set('Authorization', `Bearer ${interviewerToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });
});