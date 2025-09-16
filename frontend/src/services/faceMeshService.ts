import '@tensorflow/tfjs-backend-webgl';
import * as tf from '@tensorflow/tfjs-core';
import type { FaceLandmarks } from '../types';

/**
 * Lightweight wrapper around @tensorflow-models/face-landmarks-detection
 * to provide MediaPipe Face Mesh landmarks suitable for EAR/drowsiness.
 */
export class FaceMeshService {
  private static instance: FaceMeshService | null = null;
  private detector: any | null = null;
  private initializing = false;

  static getInstance(): FaceMeshService {
    if (!this.instance) this.instance = new FaceMeshService();
    return this.instance;
  }

  public async initialize(): Promise<void> {
    if (this.detector || this.initializing) return;
    this.initializing = true;
    try {
      // Ensure backend is ready
      await tf.ready();

      // Dynamic import to avoid upfront bundle weight
      const faceLandmarksDetection = await import('@tensorflow-models/face-landmarks-detection');
      this.detector = await faceLandmarksDetection.createDetector(
        faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
        {
          runtime: 'tfjs',
          refineLandmarks: true,
          maxFaces: 1
        } as any
      );
    } catch (err) {
      console.error('Failed to initialize FaceMesh detector:', err);
      this.detector = null;
    } finally {
      this.initializing = false;
    }
  }

  public isReady(): boolean {
    return !!this.detector;
  }

  /**
   * Estimate face landmarks from an ImageData frame.
   * Returns normalized coordinates (0..1) relative to the frame dimensions.
   */
  public async estimateLandmarks(imageData: ImageData): Promise<FaceLandmarks[]> {
    try {
      if (!this.detector) {
        await this.initialize();
        if (!this.detector) return [];
      }

      // Convert ImageData to tensor for tfjs runtime
      const tensor = tf.browser.fromPixels(imageData);
      const faces = await this.detector.estimateFaces(tensor as any, {
        flipHorizontal: false
      });
      tensor.dispose();

      if (!faces || faces.length === 0) return [];

      // Take the first face's keypoints
      const kp = (faces[0] as any).keypoints as Array<{ x: number; y: number; z?: number }>; // API shape
      const width = imageData.width;
      const height = imageData.height;

      return kp.map(p => ({
        x: p.x / width,
        y: p.y / height,
        z: (p.z ?? 0) / Math.max(width, height)
      }));
    } catch (err) {
      // Fail-soft: return empty on any error to avoid breaking frame loop
      console.warn('FaceMesh estimation failed:', err);
      return [];
    }
  }
}

export const faceMeshService = FaceMeshService.getInstance();
