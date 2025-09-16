declare module '@tensorflow-models/face-landmarks-detection' {
  export enum SupportedModels {
    MediaPipeFaceMesh,
  }

  export interface MediaPipeFaceMeshTfjsModelConfig {
    runtime: 'tfjs';
    refineLandmarks?: boolean;
    maxFaces?: number;
  }

  export interface FaceLandmarksDetector {
    estimateFaces(input: any, config?: { flipHorizontal?: boolean }): Promise<any[]>;
  }

  export function createDetector(
    model: SupportedModels,
    config: MediaPipeFaceMeshTfjsModelConfig
  ): Promise<FaceLandmarksDetector>;
}
