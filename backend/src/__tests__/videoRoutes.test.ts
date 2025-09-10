import request from 'supertest';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import videoRoutes from '../routes/videoRoutes';

// Create test app
const app = express();
app.use(express.json());
app.use('/api/videos', videoRoutes);

// Test data
const testSessionId = uuidv4();
const testCandidateId = uuidv4();
const testVideoBuffer = Buffer.from('fake video data for testing');

describe('Video Routes Integration Tests', () => {
  beforeAll(() => {
    // Ensure test directories exist
    const uploadDir = path.join(process.cwd(), 'uploads', 'videos');
    const tempDir = path.join(process.cwd(), 'uploads', 'temp');
    
    [uploadDir, tempDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  });

  afterAll(() => {
    // Clean up test files
    const uploadDir = path.join(process.cwd(), 'uploads');
    if (fs.existsSync(uploadDir)) {
      fs.rmSync(uploadDir, { recursive: true, force: true });
    }
  });

  describe('POST /api/videos/upload', () => {
    it('should upload a single chunk successfully', async () => {
      const response = await request(app)
        .post('/api/videos/upload')
        .field('sessionId', testSessionId)
        .field('candidateId', testCandidateId)
        .field('chunkIndex', '0')
        .field('totalChunks', '1')
        .field('filename', 'test-video.webm')
        .attach('chunk', testVideoBuffer, 'test-video.webm')
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.isComplete).toBe(true);
      expect(response.body.data.progress).toBe(100);
    });

    it('should handle multi-chunk upload', async () => {
      const newSessionId = uuidv4();
      const chunk1 = Buffer.from('chunk1data');
      const chunk2 = Buffer.from('chunk2data');

      // Upload first chunk
      const response1 = await request(app)
        .post('/api/videos/upload')
        .field('sessionId', newSessionId)
        .field('candidateId', testCandidateId)
        .field('chunkIndex', '0')
        .field('totalChunks', '2')
        .field('filename', 'multi-chunk-video.webm')
        .attach('chunk', chunk1, 'multi-chunk-video.webm')
        .expect(200);

      expect(response1.body.success).toBe(true);
      expect(response1.body.data.isComplete).toBe(false);
      expect(response1.body.data.progress).toBe(50);

      // Upload second chunk
      const response2 = await request(app)
        .post('/api/videos/upload')
        .field('sessionId', newSessionId)
        .field('candidateId', testCandidateId)
        .field('chunkIndex', '1')
        .field('totalChunks', '2')
        .field('filename', 'multi-chunk-video.webm')
        .attach('chunk', chunk2, 'multi-chunk-video.webm')
        .expect(201);

      expect(response2.body.success).toBe(true);
      expect(response2.body.data.isComplete).toBe(true);
      expect(response2.body.data.progress).toBe(100);
    });

    it('should reject invalid upload data', async () => {
      const response = await request(app)
        .post('/api/videos/upload')
        .field('sessionId', 'invalid-uuid')
        .field('candidateId', testCandidateId)
        .field('chunkIndex', '0')
        .field('totalChunks', '1')
        .field('filename', 'test-video.webm')
        .attach('chunk', testVideoBuffer, 'test-video.webm')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid upload data');
    });

    it('should reject non-video files', async () => {
      const textBuffer = Buffer.from('This is not a video file');
      
      const response = await request(app)
        .post('/api/videos/upload')
        .field('sessionId', testSessionId)
        .field('candidateId', testCandidateId)
        .field('chunkIndex', '0')
        .field('totalChunks', '1')
        .field('filename', 'test.txt')
        .attach('chunk', textBuffer, {
          filename: 'test.txt',
          contentType: 'text/plain'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject upload without file', async () => {
      const response = await request(app)
        .post('/api/videos/upload')
        .field('sessionId', testSessionId)
        .field('candidateId', testCandidateId)
        .field('chunkIndex', '0')
        .field('totalChunks', '1')
        .field('filename', 'test-video.webm')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('No file uploaded');
    });
  });

  describe('GET /api/videos/upload/status/:sessionId/:candidateId', () => {
    it('should return upload status for existing session', async () => {
      // First upload a chunk to create a session
      const sessionId = uuidv4();
      await request(app)
        .post('/api/videos/upload')
        .field('sessionId', sessionId)
        .field('candidateId', testCandidateId)
        .field('chunkIndex', '0')
        .field('totalChunks', '2')
        .field('filename', 'status-test.webm')
        .attach('chunk', testVideoBuffer, 'status-test.webm');

      // Check status
      const response = await request(app)
        .get(`/api/videos/upload/status/${sessionId}/${testCandidateId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.exists).toBe(true);
      expect(response.body.data.chunksReceived).toBe(1);
      expect(response.body.data.totalChunks).toBe(2);
      expect(response.body.data.progress).toBe(50);
    });

    it('should return status for non-existing session', async () => {
      const nonExistentSessionId = uuidv4();
      
      const response = await request(app)
        .get(`/api/videos/upload/status/${nonExistentSessionId}/${testCandidateId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.exists).toBe(false);
      expect(response.body.data.chunksReceived).toBe(0);
      expect(response.body.data.totalChunks).toBe(0);
      expect(response.body.data.progress).toBe(0);
    });
  });

  describe('GET /api/videos/upload/missing/:sessionId/:candidateId', () => {
    it('should return missing chunks for incomplete upload', async () => {
      const sessionId = uuidv4();
      
      // Upload only chunk 0 and 2 out of 4 chunks
      await request(app)
        .post('/api/videos/upload')
        .field('sessionId', sessionId)
        .field('candidateId', testCandidateId)
        .field('chunkIndex', '0')
        .field('totalChunks', '4')
        .field('filename', 'missing-test.webm')
        .attach('chunk', testVideoBuffer, 'missing-test.webm');

      await request(app)
        .post('/api/videos/upload')
        .field('sessionId', sessionId)
        .field('candidateId', testCandidateId)
        .field('chunkIndex', '2')
        .field('totalChunks', '4')
        .field('filename', 'missing-test.webm')
        .attach('chunk', testVideoBuffer, 'missing-test.webm');

      // Check missing chunks
      const response = await request(app)
        .get(`/api/videos/upload/missing/${sessionId}/${testCandidateId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.missingChunks).toEqual([1, 3]);
      expect(response.body.data.count).toBe(2);
    });

    it('should return empty array for non-existing session', async () => {
      const nonExistentSessionId = uuidv4();
      
      const response = await request(app)
        .get(`/api/videos/upload/missing/${nonExistentSessionId}/${testCandidateId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.missingChunks).toEqual([]);
      expect(response.body.data.count).toBe(0);
    });
  });

  describe('GET /api/videos/:videoId', () => {
    let videoId: string;

    beforeAll(async () => {
      // Upload a complete video for streaming tests
      const response = await request(app)
        .post('/api/videos/upload')
        .field('sessionId', uuidv4())
        .field('candidateId', testCandidateId)
        .field('chunkIndex', '0')
        .field('totalChunks', '1')
        .field('filename', 'stream-test.webm')
        .attach('chunk', testVideoBuffer, 'stream-test.webm');

      // Extract video ID from response message
      const match = response.body.message.match(/Video ID: ([a-f0-9-]+)/);
      videoId = match ? match[1] : '';
    });

    it('should stream video without range header', async () => {
      const response = await request(app)
        .get(`/api/videos/${videoId}`)
        .expect(200);

      expect(response.headers['content-type']).toMatch(/video/);
      expect(response.headers['accept-ranges']).toBe('bytes');
      expect(response.headers['content-length']).toBeDefined();
    });

    it('should handle range requests', async () => {
      const response = await request(app)
        .get(`/api/videos/${videoId}`)
        .set('Range', 'bytes=0-10')
        .expect(206);

      expect(response.headers['content-range']).toMatch(/bytes 0-10\/\d+/);
      expect(response.headers['accept-ranges']).toBe('bytes');
    });

    it('should return 404 for non-existent video', async () => {
      const nonExistentVideoId = uuidv4();
      
      const response = await request(app)
        .get(`/api/videos/${nonExistentVideoId}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Video not found');
    });
  });

  describe('DELETE /api/videos/:videoId', () => {
    it('should delete existing video', async () => {
      // Upload a video to delete
      const response = await request(app)
        .post('/api/videos/upload')
        .field('sessionId', uuidv4())
        .field('candidateId', testCandidateId)
        .field('chunkIndex', '0')
        .field('totalChunks', '1')
        .field('filename', 'delete-test.webm')
        .attach('chunk', testVideoBuffer, 'delete-test.webm');

      const match = response.body.message.match(/Video ID: ([a-f0-9-]+)/);
      const videoId = match ? match[1] : '';

      // Delete the video
      const deleteResponse = await request(app)
        .delete(`/api/videos/${videoId}`)
        .expect(200);

      expect(deleteResponse.body.success).toBe(true);
      expect(deleteResponse.body.message).toBe('Video deleted successfully');

      // Verify video is deleted by trying to stream it
      await request(app)
        .get(`/api/videos/${videoId}`)
        .expect(404);
    });

    it('should return 404 for non-existent video', async () => {
      const nonExistentVideoId = uuidv4();
      
      const response = await request(app)
        .delete(`/api/videos/${nonExistentVideoId}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Video not found');
    });
  });

  describe('GET /api/videos/:videoId/metadata', () => {
    let videoId: string;

    beforeAll(async () => {
      // Upload a video for metadata tests
      const response = await request(app)
        .post('/api/videos/upload')
        .field('sessionId', uuidv4())
        .field('candidateId', testCandidateId)
        .field('chunkIndex', '0')
        .field('totalChunks', '1')
        .field('filename', 'metadata-test.webm')
        .attach('chunk', testVideoBuffer, 'metadata-test.webm');

      const match = response.body.message.match(/Video ID: ([a-f0-9-]+)/);
      videoId = match ? match[1] : '';
    });

    it('should return video metadata', async () => {
      const response = await request(app)
        .get(`/api/videos/${videoId}/metadata`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.videoId).toBe(videoId);
      expect(response.body.data.size).toBeDefined();
      expect(response.body.data.contentType).toMatch(/video/);
    });

    it('should return 404 for non-existent video', async () => {
      const nonExistentVideoId = uuidv4();
      
      const response = await request(app)
        .get(`/api/videos/${nonExistentVideoId}/metadata`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Video not found');
    });
  });
});