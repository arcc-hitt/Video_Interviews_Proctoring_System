import { useRef, useCallback, useEffect, useState } from 'react';

interface CVWorkerResult {
  faceDetection?: {
    faces: Array<{
      landmarks: Array<{ x: number; y: number; z: number }>;
      boundingBox: { x: number; y: number; width: number; height: number };
      confidence: number;
    }>;
    landmarks: Array<{ x: number; y: number; z: number }>;
    confidence: number;
    timestamp: Date;
  };
  objectDetection?: {
    objects: Array<{
      class: string;
      confidence: number;
      boundingBox: { x: number; y: number; width: number; height: number };
      timestamp: Date;
    }>;
  };
  processingTime: number;
}

interface UseCVWorkerOptions {
  onResult?: (result: CVWorkerResult) => void;
  onError?: (error: Error) => void;
  autoInitialize?: boolean;
}

interface UseCVWorkerReturn {
  isInitialized: boolean;
  isProcessing: boolean;
  processFrame: (imageData: ImageData) => Promise<CVWorkerResult>;
  initialize: () => Promise<void>;
  cleanup: () => void;
  error: string | null;
}

export const useCVWorker = (options: UseCVWorkerOptions = {}): UseCVWorkerReturn => {
  const workerRef = useRef<Worker | null>(null);
  const isInitializing = useRef(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRequests = useRef<Map<string, { resolve: (value: CVWorkerResult) => void; reject: (error: Error) => void }>>(new Map());

  const { onResult, onError, autoInitialize = true } = options;

  // Initialize worker
  const initialize = useCallback(async (): Promise<void> => {
    if (workerRef.current || isInitializing.current) {
      return; // Already initialized or initializing
    }

    isInitializing.current = true;

    try {
      // Create worker
      const worker = new Worker(new URL('../workers/cvWorker.ts', import.meta.url), {
        type: 'module'
      });
      
      workerRef.current = worker;

      // Set up message handler
      worker.onmessage = (event) => {
        const { type, data, id, error: workerError } = event.data;

        if (workerError) {
          const error = new Error(workerError);
          setError(workerError);
          
          // For initialization errors related to CORS/model loading, 
          // don't treat as fatal - just log and continue
          if (workerError.includes('Failed to fetch') || workerError.includes('CORS')) {
            // Still mark as initialized so the worker can process frames without object detection
            setIsInitialized(true);
          } else {
            onError?.(error);
          }
          
          // Reject pending request if any
          if (id && pendingRequests.current.has(id)) {
            const { reject } = pendingRequests.current.get(id)!;
            pendingRequests.current.delete(id);
            reject(error);
          }
          return;
        }

        switch (type) {
          case 'INITIALIZED':
            setIsInitialized(true);
            setError(null);
            isInitializing.current = false;
            break;

          case 'FRAME_PROCESSED':
            setIsProcessing(false);
            if (id && pendingRequests.current.has(id)) {
              const { resolve } = pendingRequests.current.get(id)!;
              pendingRequests.current.delete(id);
              resolve(data);
            }
            onResult?.(data);
            break;

          case 'CLEANUP_COMPLETE':
            setIsInitialized(false);
            break;

          default:
            break;
        }
      };

      worker.onerror = (error) => {
        const errorMessage = `Worker error: ${error.message}`;
        setError(errorMessage);
        onError?.(new Error(errorMessage));
        setIsProcessing(false);
      };

      // Initialize the worker
      worker.postMessage({
        type: 'INITIALIZE',
        id: 'init'
      });

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize CV worker';
      setError(errorMessage);
      onError?.(new Error(errorMessage));
      isInitializing.current = false;
    }
  }, [onResult, onError]);

  // Process frame
  const processFrame = useCallback(async (imageData: ImageData): Promise<CVWorkerResult> => {
    if (!workerRef.current || !isInitialized) {
      throw new Error('CV Worker not initialized');
    }

    if (isProcessing) {
      throw new Error('Worker is already processing a frame');
    }

    return new Promise((resolve, reject) => {
      const id = `frame_${Date.now()}_${Math.random()}`;
      
      // Store the promise resolvers
      pendingRequests.current.set(id, { resolve, reject });

      // Set processing state
      setIsProcessing(true);
      setError(null);

      // Send frame to worker
      workerRef.current!.postMessage({
        type: 'PROCESS_FRAME',
        id,
        data: { imageData }
      });

      // Set timeout for processing
      setTimeout(() => {
        if (pendingRequests.current.has(id)) {
          pendingRequests.current.delete(id);
          reject(new Error('Frame processing timeout'));
          setIsProcessing(false);
        }
      }, 10000); // 10 second timeout
    });
  }, [isInitialized, isProcessing]);

  // Cleanup worker
  const cleanup = useCallback((): void => {
    if (workerRef.current) {
      // Reject all pending requests
      pendingRequests.current.forEach(({ reject }) => {
        reject(new Error('Worker cleanup'));
      });
      pendingRequests.current.clear();

      // Send cleanup message
      workerRef.current.postMessage({
        type: 'CLEANUP',
        id: 'cleanup'
      });

      // Terminate worker
      workerRef.current.terminate();
      workerRef.current = null;
    }

    setIsInitialized(false);
    setIsProcessing(false);
    setError(null);
  }, []);

  // Auto-initialize on mount
  useEffect(() => {
    if (autoInitialize) {
      initialize();
    }

    // Cleanup on unmount
    return () => {
      cleanup();
    };
  }, [autoInitialize, initialize, cleanup]);

  return {
    isInitialized,
    isProcessing,
    processFrame,
    initialize,
    cleanup,
    error
  };
};
