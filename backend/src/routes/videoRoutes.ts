import express, { Request, Response } from 'express';
import multer from 'multer';
import type { MulterError } from 'multer';
import { videoStorageService } from '../services/videoStorageService';
import { VideoUploadSchema } from '../types';
import { validateRequest } from '../middleware/validation';
import createRateLimiters from '../middleware/rateLimiter';
import { authenticate } from '../middleware/auth';

const router = express.Router();
const { upload: uploadLimiter } = createRateLimiters();

/**
 * GET /api/videos/health
 * Health check endpoint for video service
 */
router.get('/health', (req: Request, res: Response): void => {
  res.json({
    success: true,
    message: 'Video service is healthy',
    timestamp: new Date().toISOString()
  });
});

// Configure multer for memory storage
// Allow configuring chunk size via env: UPLOAD_MAX_CHUNK_MB (default 10MB)
const MAX_CHUNK_MB = Number(process.env.UPLOAD_MAX_CHUNK_MB || 10);
const MAX_CHUNK_BYTES = Math.max(1, Math.floor(MAX_CHUNK_MB)) * 1024 * 1024;

export const getMaxChunkBytes = () => MAX_CHUNK_BYTES;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_CHUNK_BYTES, // per chunk limit
  },
  fileFilter: (req, file, cb) => {
    // Accept video files; allow octet-stream if filename looks like a supported video
    const isVideoMime = file.mimetype.startsWith('video/');
    const isOctet = file.mimetype === 'application/octet-stream';
    const name = (file.originalname || '').toLowerCase();
    const videoExts = ['.webm', '.mp4', '.mkv', '.mov'];
    const hasVideoExt = videoExts.some(ext => name.endsWith(ext));

    if (isVideoMime || (isOctet && hasVideoExt)) {
      cb(null, true);
    } else {
      cb(new Error(`Only video files are allowed. Received mimetype=${file.mimetype} name=${file.originalname}`));
    }
  }
});

/**
 * POST /api/videos/upload
 * Upload video chunk
 */
router.post('/upload', authenticate, uploadLimiter, (req: Request, res: Response, next): void => {
  // Wrap multer to handle MulterError (e.g., LIMIT_FILE_SIZE) with a friendly 413
  const handler = upload.single('chunk');
  handler(req as any, res as any, (err?: any) => {
    if (err) {
      const mErr = err as MulterError & { code?: string };
      if (mErr && (mErr as any).code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({
          success: false,
          error: `Chunk too large. Max allowed per chunk is ${Math.round(MAX_CHUNK_BYTES / (1024 * 1024))}MB`,
          maxChunkBytes: MAX_CHUNK_BYTES
        });
        return;
      }
      return next(err);
    }
    next();
  });
}, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
      return;
    }

    // Parse and validate upload data
    const uploadData = {
      sessionId: req.body.sessionId,
      candidateId: req.body.candidateId,
      chunkIndex: parseInt(req.body.chunkIndex),
      totalChunks: parseInt(req.body.totalChunks),
      filename: req.body.filename,
      mimeType: req.file.mimetype
    };

    // Validate upload data
    const validation = VideoUploadSchema.safeParse(uploadData);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid upload data',
        details: validation.error.issues
      });
      return;
    }

    // Upload chunk
    const result = await videoStorageService.uploadChunk(
      validation.data,
      req.file.buffer
    );

    if (result.success) {
      res.status(result.isComplete ? 201 : 200).json({
        success: true,
        data: {
          chunkIndex: uploadData.chunkIndex,
          isComplete: result.isComplete,
          progress: ((uploadData.chunkIndex + 1) / uploadData.totalChunks) * 100
        },
        message: result.message
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message
      });
    }

  } catch (error) {
    console.error('Video upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during video upload'
    });
  }
});

/**
 * GET /api/videos/upload/status/:sessionId/:candidateId
 * Get upload status
 */
router.get('/upload/status/:sessionId/:candidateId', authenticate, (req: Request, res: Response): void => {
  try {
    const { sessionId, candidateId } = req.params;

    if (!sessionId || !candidateId) {
      res.status(400).json({
        success: false,
        error: 'Missing sessionId or candidateId'
      });
      return;
    }

    const status = videoStorageService.getUploadStatus(sessionId, candidateId);

    res.json({
      success: true,
      data: status
    });

  } catch (error) {
    console.error('Error getting upload status:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/videos/upload/missing/:sessionId/:candidateId
 * Get missing chunks for resume functionality
 */
router.get('/upload/missing/:sessionId/:candidateId', authenticate, (req: Request, res: Response): void => {
  try {
    const { sessionId, candidateId } = req.params;

    if (!sessionId || !candidateId) {
      res.status(400).json({
        success: false,
        error: 'Missing sessionId or candidateId'
      });
      return;
    }

    const missingChunks = videoStorageService.getMissingChunks(sessionId, candidateId);

    res.json({
      success: true,
      data: {
        missingChunks,
        count: missingChunks.length
      }
    });

  } catch (error) {
    console.error('Error getting missing chunks:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/videos/:videoId
 * Stream video with range support
 */
router.get('/:videoId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { videoId } = req.params;

    if (!videoId) {
      res.status(400).json({
        success: false,
        error: 'Missing videoId'
      });
      return;
    }

    const range = req.headers.range;

    if (range) {
      // Handle range requests for video seeking
      const result = await videoStorageService.getVideoStreamWithRange(videoId, range);

      if (!result) {
        res.status(404).json({
          success: false,
          error: 'Video not found'
        });
        return;
      }

      res.status(206); // Partial Content
      res.set({
        'Content-Range': `bytes ${result.start}-${result.end}/${result.totalSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': result.contentLength.toString(),
        'Content-Type': result.contentType,
        'Cache-Control': 'public, max-age=3600',
        'Content-Disposition': `attachment; filename="${videoId}${result.ext || ''}"`
      });

      result.stream.pipe(res);

    } else {
      // Handle regular video requests
      const result = await videoStorageService.getVideoStream(videoId);

      if (!result) {
        res.status(404).json({
          success: false,
          error: 'Video not found'
        });
        return;
      }

      res.set({
        'Content-Length': result.contentLength.toString(),
        'Content-Type': result.contentType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        'Content-Disposition': `attachment; filename="${videoId}${result.ext || ''}"`
      });

      result.stream.pipe(res);
    }

  } catch (error) {
    console.error('Error streaming video:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * DELETE /api/videos/:videoId
 * Delete video
 */
router.delete('/:videoId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { videoId } = req.params;

    if (!videoId) {
      res.status(400).json({
        success: false,
        error: 'Missing videoId'
      });
      return;
    }

    const deleted = await videoStorageService.deleteVideo(videoId);

    if (deleted) {
      res.json({
        success: true,
        message: 'Video deleted successfully'
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Video not found'
      });
    }

  } catch (error) {
    console.error('Error deleting video:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * POST /api/videos/compress/:videoId
 * Compress video (placeholder for future implementation)
 */
router.post('/compress/:videoId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { videoId } = req.params;

    if (!videoId) {
      res.status(400).json({
        success: false,
        error: 'Missing videoId'
      });
      return;
    }

    const { quality = 'medium' } = req.body;

  // Placeholder for future video compression job

    res.json({
      success: true,
      message: 'Video compression queued',
      data: {
        videoId,
        quality,
        status: 'queued'
      }
    });

  } catch (error) {
    console.error('Error compressing video:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/videos/:videoId/metadata
 * Get video metadata
 */
router.get('/:videoId/metadata', async (req: Request, res: Response): Promise<void> => {
  try {
    const { videoId } = req.params;

    if (!videoId) {
      res.status(400).json({
        success: false,
        error: 'Missing videoId'
      });
      return;
    }

    // TODO: Implement metadata retrieval from database
    // For now, return basic file information

    const result = await videoStorageService.getVideoStream(videoId);

    if (!result) {
      res.status(404).json({
        success: false,
        error: 'Video not found'
      });
      return;
    }

    res.json({
      success: true,
      data: {
        videoId,
        size: result.contentLength,
        contentType: result.contentType,
        // TODO: Add more metadata like duration, resolution, etc.
      }
    });

  } catch (error) {
    console.error('Error getting video metadata:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

export default router;