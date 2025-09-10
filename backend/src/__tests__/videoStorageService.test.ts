import fs from 'fs';
import path from 'path';
import { VideoStorageService } from '../services/videoStorageService';

describe('VideoStorageService', () => {
  let service: VideoStorageService;
  const testSessionId = 'test-session-123';
  const testCandidateId = 'test-candidate-456';
  const testBuffer = Buffer.from('test video data');

  beforeAll(() => {
    service = new VideoStorageService();
    
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

  describe('initializeUploadSession', () => {
    it('should create a new upload session', () => {
      const session = service.initializeUploadSession(
        testSessionId,
        testCandidateId,
        2,
        'test-video.webm',
        'video/webm'
      );

      expect(session.sessionId).toBe(testSessionId);
      expect(session.candidateId).toBe(testCandidateId);
      expect(session.totalChunks).toBe(2);
      expect(session.filename).toBe('test-video.webm');
      expect(session.mimeType).toBe('video/webm');
      expect(session.chunks.size).toBe(0);
    });

    it('should return existing session if already initialized', () => {
      // Initialize first time
      const session1 = service.initializeUploadSession(
        testSessionId,
        testCandidateId,
        2,
        'test-video.webm',
        'video/webm'
      );

      // Initialize again with same parameters
      const session2 = service.initializeUploadSession(
        testSessionId,
        testCandidateId,
        2,
        'test-video.webm',
        'video/webm'
      );

      expect(session1.createdAt).toEqual(session2.createdAt);
      expect(session1.sessionId).toBe(session2.sessionId);
    });
  });

  describe('uploadChunk', () => {
    it('should upload a single chunk successfully', async () => {
      const uploadData = {
        sessionId: 'single-chunk-session',
        candidateId: testCandidateId,
        chunkIndex: 0,
        totalChunks: 1,
        filename: 'single-chunk.webm',
        mimeType: 'video/webm'
      };

      const result = await service.uploadChunk(uploadData, testBuffer);

      expect(result.success).toBe(true);
      expect(result.isComplete).toBe(true);
      expect(result.message).toContain('Video uploaded successfully');
    });

    it('should handle multi-chunk upload', async () => {
      const sessionId = 'multi-chunk-session';
      const chunk1Data = {
        sessionId,
        candidateId: testCandidateId,
        chunkIndex: 0,
        totalChunks: 2,
        filename: 'multi-chunk.webm',
        mimeType: 'video/webm'
      };

      const chunk2Data = {
        sessionId,
        candidateId: testCandidateId,
        chunkIndex: 1,
        totalChunks: 2,
        filename: 'multi-chunk.webm',
        mimeType: 'video/webm'
      };

      // Upload first chunk
      const result1 = await service.uploadChunk(chunk1Data, Buffer.from('chunk1'));
      expect(result1.success).toBe(true);
      expect(result1.isComplete).toBe(false);

      // Upload second chunk
      const result2 = await service.uploadChunk(chunk2Data, Buffer.from('chunk2'));
      expect(result2.success).toBe(true);
      expect(result2.isComplete).toBe(true);
    });

    it('should reject invalid chunk index', async () => {
      const uploadData = {
        sessionId: 'invalid-chunk-session',
        candidateId: testCandidateId,
        chunkIndex: 5, // Invalid - greater than totalChunks
        totalChunks: 2,
        filename: 'invalid.webm',
        mimeType: 'video/webm'
      };

      const result = await service.uploadChunk(uploadData, testBuffer);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid chunk index');
    });
  });

  describe('getUploadStatus', () => {
    it('should return status for existing session', async () => {
      const sessionId = 'status-test-session';
      
      // Upload one chunk out of two
      await service.uploadChunk({
        sessionId,
        candidateId: testCandidateId,
        chunkIndex: 0,
        totalChunks: 2,
        filename: 'status-test.webm',
        mimeType: 'video/webm'
      }, testBuffer);

      const status = service.getUploadStatus(sessionId, testCandidateId);

      expect(status.exists).toBe(true);
      expect(status.chunksReceived).toBe(1);
      expect(status.totalChunks).toBe(2);
      expect(status.progress).toBe(50);
    });

    it('should return default status for non-existing session', () => {
      const status = service.getUploadStatus('non-existent', 'non-existent');

      expect(status.exists).toBe(false);
      expect(status.chunksReceived).toBe(0);
      expect(status.totalChunks).toBe(0);
      expect(status.progress).toBe(0);
    });
  });

  describe('getMissingChunks', () => {
    it('should return missing chunks for incomplete upload', async () => {
      const sessionId = 'missing-chunks-session';
      
      // Upload chunks 0 and 2, skip chunk 1
      await service.uploadChunk({
        sessionId,
        candidateId: testCandidateId,
        chunkIndex: 0,
        totalChunks: 3,
        filename: 'missing-test.webm',
        mimeType: 'video/webm'
      }, testBuffer);

      await service.uploadChunk({
        sessionId,
        candidateId: testCandidateId,
        chunkIndex: 2,
        totalChunks: 3,
        filename: 'missing-test.webm',
        mimeType: 'video/webm'
      }, testBuffer);

      const missingChunks = service.getMissingChunks(sessionId, testCandidateId);

      expect(missingChunks).toEqual([1]);
    });

    it('should return empty array for non-existing session', () => {
      const missingChunks = service.getMissingChunks('non-existent', 'non-existent');
      expect(missingChunks).toEqual([]);
    });
  });
});