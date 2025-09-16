import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { VideoMetadata, VideoUploadInput } from '../types';
import { cloudStorageService } from './cloudStorageService';
import { InterviewSession } from '../models/InterviewSession';
import ffmpeg from 'fluent-ffmpeg';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import ffmpegStatic from 'ffmpeg-static';

try {
  if (ffmpegStatic) {
    ffmpeg.setFfmpegPath(ffmpegStatic as string);
  }
} catch {
  // rely on system ffmpeg if available
}

export interface VideoChunk {
  chunkIndex: number;
  totalChunks: number;
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export interface VideoUploadSession {
  sessionId: string;
  candidateId: string;
  chunks: Map<number, VideoChunk>;
  totalChunks: number;
  filename: string;
  mimeType: string;
  createdAt: Date;
  lastUpdated: Date;
}

export class VideoStorageService {
  private uploadSessions: Map<string, VideoUploadSession> = new Map();
  private readonly uploadDir: string;
  private readonly tempDir: string;
  // Max per-chunk size (bytes). Keep in sync with multer limit in routes.
  private readonly maxChunkSize = Math.max(1, Math.floor(Number(process.env.UPLOAD_MAX_CHUNK_MB || 10))) * 1024 * 1024; // default 10MB
  private readonly sessionTimeout = 30 * 60 * 1000; // 30 minutes

  constructor() {
    this.uploadDir = path.join(process.cwd(), 'uploads', 'videos');
    this.tempDir = path.join(process.cwd(), 'uploads', 'temp');
    this.ensureDirectories();
    this.startCleanupTimer();
  }

  private ensureDirectories(): void {
    [this.uploadDir, this.tempDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  private startCleanupTimer(): void {
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, 5 * 60 * 1000); // Run every 5 minutes
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [sessionKey, session] of this.uploadSessions.entries()) {
      if (now - session.lastUpdated.getTime() > this.sessionTimeout) {
        this.cleanupSession(sessionKey);
      }
    }
  }

  private cleanupSession(sessionKey: string): void {
    const session = this.uploadSessions.get(sessionKey);
    if (session) {
      // Clean up temporary chunk files
      for (const chunk of session.chunks.values()) {
        const tempPath = this.getTempChunkPath(sessionKey, chunk.chunkIndex);
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      }
      this.uploadSessions.delete(sessionKey);
    }
  }

  private getSessionKey(sessionId: string, candidateId: string): string {
    return `${sessionId}-${candidateId}`;
  }

  private getTempChunkPath(sessionKey: string, chunkIndex: number): string {
    return path.join(this.tempDir, `${sessionKey}-chunk-${chunkIndex}`);
  }

  private getFinalVideoPath(videoId: string, filename: string): string {
    const ext = path.extname(filename);
    return path.join(this.uploadDir, `${videoId}${ext}`);
  }

  private async convertToMP4(inputPath: string, outputPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions([
          '-movflags +faststart',
          '-preset veryfast',
          '-pix_fmt yuv420p'
        ])
        .on('error', (err) => reject(err))
        .on('end', () => resolve(outputPath))
        .save(outputPath);
    });
  }

  /**
   * Initialize or get existing upload session
   */
  public initializeUploadSession(
    sessionId: string,
    candidateId: string,
    totalChunks: number,
    filename: string,
    mimeType: string
  ): VideoUploadSession {
    const sessionKey = this.getSessionKey(sessionId, candidateId);
    
    let session = this.uploadSessions.get(sessionKey);
    if (!session) {
      session = {
        sessionId,
        candidateId,
        chunks: new Map(),
        totalChunks,
        filename,
        mimeType,
        createdAt: new Date(),
        lastUpdated: new Date()
      };
      this.uploadSessions.set(sessionKey, session);
    } else {
      session.lastUpdated = new Date();
    }

    return session;
  }

  /**
   * Upload a video chunk
   */
  public async uploadChunk(
    uploadData: VideoUploadInput,
    buffer: Buffer
  ): Promise<{ success: boolean; isComplete: boolean; message: string }> {
    try {
      const sessionKey = this.getSessionKey(uploadData.sessionId, uploadData.candidateId);
      
      // Initialize session if it doesn't exist
      const session = this.initializeUploadSession(
        uploadData.sessionId,
        uploadData.candidateId,
        uploadData.totalChunks,
        uploadData.filename,
        uploadData.mimeType
      );

      // Validate chunk
      if (uploadData.chunkIndex >= uploadData.totalChunks) {
        throw new Error('Invalid chunk index');
      }

      if (buffer.length > this.maxChunkSize) {
        throw new Error('Chunk size exceeds maximum allowed size');
      }

      // Store chunk temporarily
      const tempPath = this.getTempChunkPath(sessionKey, uploadData.chunkIndex);
      await fs.promises.writeFile(tempPath, buffer);

      // Update session
      session.chunks.set(uploadData.chunkIndex, {
        chunkIndex: uploadData.chunkIndex,
        totalChunks: uploadData.totalChunks,
        buffer,
        filename: uploadData.filename,
        mimeType: uploadData.mimeType
      });
      session.lastUpdated = new Date();

      // Check if all chunks are received
      const isComplete = session.chunks.size === session.totalChunks;

      if (isComplete) {
        const asyncProcessing = process.env.ASYNC_VIDEO_PROCESSING === 'true' || process.env.NODE_ENV === 'production';
        if (asyncProcessing) {
          // Process in background to avoid blocking request in production
          setImmediate(async () => {
            try {
              await this.assembleVideo(session);
            } catch (e) {
              console.error('Async video assembly failed:', e);
            } finally {
              this.cleanupSession(sessionKey);
            }
          });
          return {
            success: true,
            isComplete: true,
            message: 'Upload complete. Processing recording in background.'
          };
        } else {
          const videoMetadata = await this.assembleVideo(session);
          this.cleanupSession(sessionKey);
          return {
            success: true,
            isComplete: true,
            message: `Video uploaded successfully. Video ID: ${videoMetadata.videoId}`
          };
        }
      }

      return {
        success: true,
        isComplete: false,
        message: `Chunk ${uploadData.chunkIndex + 1}/${uploadData.totalChunks} uploaded successfully`
      };

    } catch (error) {
      console.error('Error uploading chunk:', error);
      return {
        success: false,
        isComplete: false,
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Assemble video from chunks
   */
  private async assembleVideo(session: VideoUploadSession): Promise<VideoMetadata> {
  const videoId = randomUUID();
  const finalPath = this.getFinalVideoPath(videoId, session.filename);
    const sessionKey = this.getSessionKey(session.sessionId, session.candidateId);

    try {
      // Create write stream for final video
      const writeStream = fs.createWriteStream(finalPath);

      // Write chunks in order
      for (let i = 0; i < session.totalChunks; i++) {
        const tempPath = this.getTempChunkPath(sessionKey, i);
        if (fs.existsSync(tempPath)) {
          const chunkData = await fs.promises.readFile(tempPath);
          writeStream.write(chunkData);
        } else {
          throw new Error(`Missing chunk ${i}`);
        }
      }

      writeStream.end();

      // Wait for write to complete
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', () => resolve());
        writeStream.on('error', reject);
      });

      let pathForUpload = finalPath;
      let chosenExt = path.extname(finalPath).toLowerCase();
      if (chosenExt !== '.mp4') {
        const mp4Path = path.join(this.uploadDir, `${videoId}.mp4`);
        try {
          await this.convertToMP4(finalPath, mp4Path);
          pathForUpload = mp4Path;
          chosenExt = '.mp4';
          try { fs.unlinkSync(finalPath); } catch {/* ignore */}
        } catch (convErr) {
          console.error('FFmpeg conversion failed; using original file:', convErr);
        }
      }

      // Get file stats of the chosen file
      const stats = await fs.promises.stat(pathForUpload);

      // Default metadata (local storage)
      let metadata: VideoMetadata = {
        videoId,
        sessionId: session.sessionId,
        candidateId: session.candidateId,
        filename: `${videoId}${chosenExt}`,
        originalName: session.filename,
        mimeType: chosenExt === '.mp4' ? 'video/mp4' : session.mimeType,
        size: stats.size,
        uploadedAt: new Date(),
        storageUrl: `/api/videos/${videoId}`
      };

      // Try upload to Cloudinary if configured
      try {
        if (cloudStorageService.isEnabled()) {
          const uploadRes = await cloudStorageService.uploadVideo(pathForUpload, {
            folder: `video-interviews/recordings/${session.sessionId}`
          });
          metadata.storageUrl = uploadRes.url;
          // Persist to session for history/downloads
          await InterviewSession.findOneAndUpdate(
            { sessionId: session.sessionId },
            {
              videoUrl: uploadRes.url,
              recordingPublicId: uploadRes.publicId,
              recordingUploadedAt: new Date()
            }
          );
          // If uploaded to cloud successfully, remove local file to save disk space
          try { await fs.promises.unlink(pathForUpload); } catch { /* ignore */ }
        } else {
          // Fallback: store local file url
          await InterviewSession.findOneAndUpdate(
            { sessionId: session.sessionId },
            {
              videoUrl: metadata.storageUrl
            }
          );
        }
      } catch (e) {
  console.error('Cloud upload failed, keeping local file only:', e);
        // Keep local storage URL and still save to session
        await InterviewSession.findOneAndUpdate(
          { sessionId: session.sessionId },
          {
            videoUrl: metadata.storageUrl
          }
        );
      }

      return metadata;

    } catch (error) {
      // Clean up partial file if assembly failed
      if (fs.existsSync(finalPath)) {
        fs.unlinkSync(finalPath);
      }
      throw error;
    }
  }

  /**
   * Get video stream
   */
  public async getVideoStream(videoId: string): Promise<{
    stream: fs.ReadStream;
    contentType: string;
    contentLength: number;
    ext: string;
  } | null> {
    try {
      // Find video file
      const files = await fs.promises.readdir(this.uploadDir);
      const candidates = files.filter(file => file.startsWith(videoId));
      if (candidates.length === 0) {
        return null;
      }
      // Prefer mp4 if available
      const priority = ['.mp4', '.webm', '.mov', '.avi'];
  let selected: string = candidates[0]!;
      for (const ext of priority) {
        const found = candidates.find(f => f.toLowerCase().endsWith(ext));
        if (found) { selected = found; break; }
      }

      const videoFile: string = selected;
      const filePath = path.join(this.uploadDir, videoFile);
      const stats = await fs.promises.stat(filePath);
      const ext = path.extname(videoFile).toLowerCase();

      // Determine content type
      let contentType = 'video/mp4'; // default
      switch (ext) {
        case '.webm':
          contentType = 'video/webm';
          break;
        case '.mov':
          contentType = 'video/quicktime';
          break;
        case '.avi':
          contentType = 'video/x-msvideo';
          break;
      }

      const stream = fs.createReadStream(filePath);

      return {
        stream,
        contentType,
        contentLength: stats.size,
        ext
      };

    } catch (error) {
      console.error('Error getting video stream:', error);
      return null;
    }
  }

  /**
   * Get video stream with range support (for video seeking)
   */
  public async getVideoStreamWithRange(
    videoId: string,
    range?: string
  ): Promise<{
    stream: fs.ReadStream;
    contentType: string;
    contentLength: number;
    start: number;
    end: number;
    totalSize: number;
    ext: string;
  } | null> {
    try {
      // Find video file
      const files = await fs.promises.readdir(this.uploadDir);
      const candidates = files.filter(file => file.startsWith(videoId));
      if (candidates.length === 0) {
        return null;
      }
      // Prefer mp4 if available
      const priority = ['.mp4', '.webm', '.mov', '.avi'];
  let selected: string = candidates[0]!;
      for (const ext of priority) {
        const found = candidates.find(f => f.toLowerCase().endsWith(ext));
        if (found) { selected = found; break; }
      }
      const videoFile: string = selected;

      const filePath = path.join(this.uploadDir, videoFile);
      const stats = await fs.promises.stat(filePath);
      const totalSize = stats.size;

      let start = 0;
      let end = totalSize - 1;

      // Parse range header
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        start = parseInt(parts[0] || '0', 10);
        end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
      }

      const contentLength = end - start + 1;
      const ext = path.extname(videoFile).toLowerCase();

      // Determine content type
      let contentType = 'video/mp4'; // default
      switch (ext) {
        case '.webm':
          contentType = 'video/webm';
          break;
        case '.mov':
          contentType = 'video/quicktime';
          break;
        case '.avi':
          contentType = 'video/x-msvideo';
          break;
      }

      const stream = fs.createReadStream(filePath, { start, end });

      return {
        stream,
        contentType,
        contentLength,
        start,
        end,
        totalSize,
        ext
      };

    } catch (error) {
      console.error('Error getting video stream with range:', error);
      return null;
    }
  }

  /**
   * Delete video
   */
  public async deleteVideo(videoId: string): Promise<boolean> {
    try {
      const files = await fs.promises.readdir(this.uploadDir);
      const videoFile = files.find(file => file.startsWith(videoId));

      if (videoFile) {
        const filePath = path.join(this.uploadDir, videoFile);
        await fs.promises.unlink(filePath);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error deleting video:', error);
      return false;
    }
  }

  /**
   * Get upload session status
   */
  public getUploadStatus(sessionId: string, candidateId: string): {
    exists: boolean;
    chunksReceived: number;
    totalChunks: number;
    progress: number;
  } {
    const sessionKey = this.getSessionKey(sessionId, candidateId);
    const session = this.uploadSessions.get(sessionKey);

    if (!session) {
      return {
        exists: false,
        chunksReceived: 0,
        totalChunks: 0,
        progress: 0
      };
    }

    const chunksReceived = session.chunks.size;
    const progress = (chunksReceived / session.totalChunks) * 100;

    return {
      exists: true,
      chunksReceived,
      totalChunks: session.totalChunks,
      progress
    };
  }

  /**
   * Resume upload - get missing chunks
   */
  public getMissingChunks(sessionId: string, candidateId: string): number[] {
    const sessionKey = this.getSessionKey(sessionId, candidateId);
    const session = this.uploadSessions.get(sessionKey);

    if (!session) {
      return [];
    }

    const missingChunks: number[] = [];
    for (let i = 0; i < session.totalChunks; i++) {
      if (!session.chunks.has(i)) {
        missingChunks.push(i);
      }
    }

    return missingChunks;
  }
}

// Singleton instance
export const videoStorageService = new VideoStorageService();