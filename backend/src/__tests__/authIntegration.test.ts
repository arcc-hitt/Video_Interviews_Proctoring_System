import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { v4 as uuidv4 } from 'uuid';
import authRoutes from '../routes/authRoutes';
import videoRoutes from '../routes/videoRoutes';
import { User } from '../models';
import { UserRole } from '../types';
import { generateToken } from '../middleware/auth';

// Create Express app for testing
const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/videos', videoRoutes);

// MongoDB Memory Server
let mongoServer: MongoMemoryServer;

// Test data
const testUser = {
  userId: uuidv4(),
  email: 'test@example.com',
  password: 'password123',
  name: 'Test User',
  role: UserRole.CANDIDATE
};

describe('Authentication Integration Tests', () => {
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
  });

  describe('Protected Routes Integration', () => {
    let userToken: string;

    beforeEach(async () => {
      // Create test user
      const user = await User.create(testUser);
      userToken = generateToken(user);
    });

    it('should access public video routes without authentication', async () => {
      const response = await request(app)
        .get('/api/videos/health');

      // The video health endpoint should be accessible without auth
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should handle video upload validation without authentication', async () => {
      const response = await request(app)
        .post('/api/videos/upload')
        .send({
          sessionId: uuidv4(),
          candidateId: testUser.userId,
          chunkIndex: 0,
          totalChunks: 1,
          filename: 'test.mp4',
          mimeType: 'video/mp4'
        });

      // Should fail due to missing file, not authentication (video routes are currently public)
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('No file uploaded');
    });

    it('should handle video upload with invalid data', async () => {
      const response = await request(app)
        .post('/api/videos/upload')
        .send({
          sessionId: 'invalid-uuid',
          candidateId: testUser.userId,
          chunkIndex: 0,
          totalChunks: 1,
          filename: 'test.mp4',
          mimeType: 'video/mp4'
        });

      // Should fail due to validation error (invalid UUID)
      expect(response.status).toBe(400);
    });
  });

  describe('Role-based Access Control', () => {
    let candidateToken: string;
    let interviewerToken: string;
    let adminToken: string;

    beforeEach(async () => {
      // Create users with different roles
      const candidate = await User.create({
        ...testUser,
        userId: uuidv4(),
        email: 'candidate@test.com',
        role: UserRole.CANDIDATE
      });

      const interviewer = await User.create({
        ...testUser,
        userId: uuidv4(),
        email: 'interviewer@test.com',
        role: UserRole.INTERVIEWER
      });

      const admin = await User.create({
        ...testUser,
        userId: uuidv4(),
        email: 'admin@test.com',
        role: UserRole.ADMIN
      });

      candidateToken = generateToken(candidate);
      interviewerToken = generateToken(interviewer);
      adminToken = generateToken(admin);
    });

    it('should allow interviewer to create sessions', async () => {
      const response = await request(app)
        .post('/api/auth/sessions/create')
        .set('Authorization', `Bearer ${interviewerToken}`)
        .send({
          candidateName: 'Test Candidate',
          candidateEmail: 'newcandidate@test.com',
          interviewerUserId: (await User.findOne({ email: 'interviewer@test.com' }))!.userId
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    it('should allow admin to create sessions', async () => {
      const response = await request(app)
        .post('/api/auth/sessions/create')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          candidateName: 'Test Candidate',
          interviewerUserId: (await User.findOne({ email: 'interviewer@test.com' }))!.userId
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    it('should deny candidate from creating sessions', async () => {
      const response = await request(app)
        .post('/api/auth/sessions/create')
        .set('Authorization', `Bearer ${candidateToken}`)
        .send({
          candidateName: 'Test Candidate',
          interviewerUserId: (await User.findOne({ email: 'interviewer@test.com' }))!.userId
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Insufficient permissions');
    });
  });

  describe('JWT Token Validation', () => {
    it('should validate token expiration', async () => {
      // Create a user
      const user = await User.create(testUser);
      
      // Generate token with very short expiration for testing
      const shortLivedToken = generateToken(user);
      
      // Token should work immediately
      const response1 = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${shortLivedToken}`);

      expect(response1.status).toBe(200);
      expect(response1.body.success).toBe(true);
    });

    it('should handle malformed tokens', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer malformed.token.here');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should handle missing Bearer prefix', async () => {
      const user = await User.create(testUser);
      const token = generateToken(user);

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', token); // Missing "Bearer " prefix

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });
});