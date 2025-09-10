import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useCVWorker } from '../hooks/useCVWorker';
import type { VideoStreamProps, VideoStreamState, VideoStreamError, MediaConstraints } from '../types';

const DEFAULT_CONSTRAINTS: MediaConstraints = {
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 },
    facingMode: 'user'
  },
  audio: true
};

export const VideoStreamComponent: React.FC<VideoStreamProps> = ({
  onFrameCapture,
  onRecordingStart,
  onRecordingStop,
  onError
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const frameIntervalRef = useRef<number | null>(null);

  // Initialize CV Worker for offloaded processing
  const cvWorker = useCVWorker({
    onResult: (_result) => {
      // Process the result and call the frame capture callback
      if (onFrameCapture) {
        // Convert worker result to ImageData format expected by onFrameCapture
        const imageData = new ImageData(1, 1); // Placeholder - actual implementation would extract from result
        onFrameCapture(imageData);
      }
    },
    onError: (error) => {
      console.error('CV Worker error:', error);
      if (onError) {
        onError({
          type: 'PROCESSING_ERROR',
          message: error.message,
          originalError: error
        });
      }
    },
    autoInitialize: true
  });

  const [state, setState] = useState<VideoStreamState>({
    stream: null,
    isStreaming: false,
    isRecording: false,
    recordedChunks: [],
    error: null
  });

  const handleError = useCallback((error: VideoStreamError) => {
    setState(prev => ({ ...prev, error }));
    onError?.(error);
  }, [onError]);

  const startStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(DEFAULT_CONSTRAINTS);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setState(prev => ({
        ...prev,
        stream,
        isStreaming: true,
        error: null
      }));

      // Start frame capture for computer vision processing
      if (onFrameCapture) {
        frameIntervalRef.current = setInterval(() => {
          captureFrame();
        }, 100) as unknown as number; // Capture frame every 100ms (10 FPS for CV processing)
      }

    } catch (error) {
      const videoError: VideoStreamError = {
        type: error instanceof Error && error.name === 'NotAllowedError'
          ? 'CAMERA_ACCESS_DENIED'
          : 'DEVICE_NOT_FOUND',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        originalError: error instanceof Error ? error : undefined
      };
      handleError(videoError);
    }
  }, [onFrameCapture, handleError]);

  const stopStream = useCallback(() => {
    if (state.stream && state.stream.getTracks) {
      try {
        state.stream.getTracks().forEach(track => track.stop());
      } catch (error) {
        console.warn('Error stopping tracks:', error);
      }
    }

    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }

    setState(prev => ({
      ...prev,
      stream: null,
      isStreaming: false,
      error: null
    }));
  }, [state.stream]);

  const captureFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx || video.videoWidth === 0 || video.videoHeight === 0) return;

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw current video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Get image data for computer vision processing
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Use Web Worker for processing if available, otherwise fallback to direct callback
    if (cvWorker.isInitialized && !cvWorker.isProcessing) {
      try {
        await cvWorker.processFrame(imageData);
      } catch (error) {
        console.error('CV Worker processing failed:', error);
        // Fallback to direct callback
        if (onFrameCapture) {
          onFrameCapture(imageData);
        }
      }
    } else if (onFrameCapture) {
      // Fallback to direct callback
      onFrameCapture(imageData);
    }
  }, [cvWorker, onFrameCapture]);

  const startRecording = useCallback(() => {
    if (!state.stream) {
      handleError({
        type: 'RECORDING_FAILED',
        message: 'No active stream to record'
      });
      return;
    }

    try {
      const mediaRecorder = new MediaRecorder(state.stream, {
        mimeType: 'video/webm;codecs=vp9'
      });

      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        setState(prev => ({
          ...prev,
          recordedChunks: chunks,
          isRecording: false
        }));
        onRecordingStop?.();
      };

      mediaRecorder.onerror = (event) => {
        handleError({
          type: 'RECORDING_FAILED',
          message: 'Recording failed',
          originalError: event.error
        });
      };

      mediaRecorder.start(1000); // Record in 1-second chunks
      mediaRecorderRef.current = mediaRecorder;

      setState(prev => ({
        ...prev,
        isRecording: true,
        recordedChunks: []
      }));

      onRecordingStart?.();

    } catch (error) {
      handleError({
        type: 'RECORDING_FAILED',
        message: error instanceof Error ? error.message : 'Recording initialization failed',
        originalError: error instanceof Error ? error : undefined
      });
    }
  }, [state.stream, handleError, onRecordingStart, onRecordingStop]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isRecording) {
      mediaRecorderRef.current.stop();
    }
  }, [state.isRecording]);

  const downloadRecording = useCallback(() => {
    if (state.recordedChunks.length === 0) return;

    const blob = new Blob(state.recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interview-recording-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [state.recordedChunks]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStream();
      if (mediaRecorderRef.current && state.isRecording) {
        mediaRecorderRef.current.stop();
      }
    };
  }, [stopStream, state.isRecording]);

  return (
    <div className="video-stream-container">
      <div className="relative">
        <video
          ref={videoRef}
          className="w-full h-auto rounded-lg shadow-lg"
          playsInline
          muted
        />

        {/* Hidden canvas for frame capture */}
        <canvas
          ref={canvasRef}
          className="hidden"
        />

        {/* Stream controls */}
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-2">
          {!state.isStreaming ? (
            <button
              onClick={startStream}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Start Camera
            </button>
          ) : (
            <>
              <button
                onClick={stopStream}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Stop Camera
              </button>

              {!state.isRecording ? (
                <button
                  onClick={startRecording}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Start Recording
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                >
                  Stop Recording
                </button>
              )}

              {state.recordedChunks.length > 0 && (
                <button
                  onClick={downloadRecording}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  Download
                </button>
              )}
            </>
          )}
        </div>

        {/* Status indicators */}
        <div className="absolute top-4 right-4 flex flex-col gap-2">
          {state.isStreaming && (
            <div className="flex items-center gap-2 px-3 py-1 bg-green-600 text-white rounded-full text-sm">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
              Live
            </div>
          )}

          {state.isRecording && (
            <div className="flex items-center gap-2 px-3 py-1 bg-red-600 text-white rounded-full text-sm">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
              Recording
            </div>
          )}
        </div>

        {/* Error display */}
        {state.error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75 rounded-lg">
            <div className="text-center text-white p-6">
              <h3 className="text-lg font-semibold mb-2">Camera Error</h3>
              <p className="text-sm mb-4">{state.error.message}</p>
              {state.error.type === 'CAMERA_ACCESS_DENIED' && (
                <p className="text-xs text-gray-300">
                  Please allow camera access and refresh the page
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoStreamComponent;