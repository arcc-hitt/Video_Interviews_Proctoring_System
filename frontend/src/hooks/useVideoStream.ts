import { useState, useRef, useCallback, useEffect } from 'react';
import type { VideoStreamState, VideoStreamError, MediaConstraints } from '../types';

const DEFAULT_CONSTRAINTS: MediaConstraints = {
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 },
    facingMode: 'user'
  },
  audio: true
};

export const useVideoStream = () => {
  const [state, setState] = useState<VideoStreamState>({
    stream: null,
    isStreaming: false,
    isRecording: false,
    recordedChunks: [],
    error: null
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const frameCallbackRef = useRef<((imageData: ImageData) => void) | null>(null);
  const frameIntervalRef = useRef<number | null>(null);

  const handleError = useCallback((error: VideoStreamError) => {
    setState(prev => ({ ...prev, error }));
  }, []);

  const startStream = useCallback(async (constraints: MediaConstraints = DEFAULT_CONSTRAINTS) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      setState(prev => ({
        ...prev,
        stream,
        isStreaming: true,
        error: null
      }));

      return stream;
    } catch (error) {
      const videoError: VideoStreamError = {
        type: error instanceof Error && error.name === 'NotAllowedError' 
          ? 'CAMERA_ACCESS_DENIED' 
          : 'DEVICE_NOT_FOUND',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        originalError: error instanceof Error ? error : undefined
      };
      handleError(videoError);
      throw videoError;
    }
  }, [handleError]);

  const stopStream = useCallback(() => {
    if (state.stream && state.stream.getTracks) {
      state.stream.getTracks().forEach(track => track.stop());
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

  const startFrameCapture = useCallback((
    videoElement: HTMLVideoElement,
    canvasElement: HTMLCanvasElement,
    callback: (imageData: ImageData) => void,
    intervalMs: number = 100
  ) => {
    frameCallbackRef.current = callback;

    const captureFrame = () => {
      if (!videoElement || !canvasElement || !frameCallbackRef.current) return;

      const ctx = canvasElement.getContext('2d');
      if (!ctx || videoElement.videoWidth === 0 || videoElement.videoHeight === 0) return;

      // Set canvas dimensions to match video
      canvasElement.width = videoElement.videoWidth;
      canvasElement.height = videoElement.videoHeight;

      // Draw current video frame to canvas
      ctx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

      // Get image data for computer vision processing
      const imageData = ctx.getImageData(0, 0, canvasElement.width, canvasElement.height);
      frameCallbackRef.current(imageData);
    };

    frameIntervalRef.current = setInterval(captureFrame, intervalMs) as unknown as number;
  }, []);

  const stopFrameCapture = useCallback(() => {
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    frameCallbackRef.current = null;
  }, []);

  const startRecording = useCallback(async () => {
    if (!state.stream) {
      const error: VideoStreamError = {
        type: 'RECORDING_FAILED',
        message: 'No active stream to record'
      };
      handleError(error);
      throw error;
    }

    try {
      // Check if MediaRecorder is supported
      if (!MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
        if (!MediaRecorder.isTypeSupported('video/webm')) {
          throw new Error('WebM format not supported');
        }
      }

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') 
        ? 'video/webm;codecs=vp9' 
        : 'video/webm';

      const mediaRecorder = new MediaRecorder(state.stream, { mimeType });
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
      };

      mediaRecorder.onerror = (event) => {
        const error: VideoStreamError = {
          type: 'RECORDING_FAILED',
          message: 'Recording failed',
          originalError: event.error
        };
        handleError(error);
      };

      mediaRecorder.start(1000); // Record in 1-second chunks
      mediaRecorderRef.current = mediaRecorder;

      setState(prev => ({
        ...prev,
        isRecording: true,
        recordedChunks: []
      }));

    } catch (error) {
      const videoError: VideoStreamError = {
        type: 'RECORDING_FAILED',
        message: error instanceof Error ? error.message : 'Recording initialization failed',
        originalError: error instanceof Error ? error : undefined
      };
      handleError(videoError);
      throw videoError;
    }
  }, [state.stream, handleError]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isRecording) {
      mediaRecorderRef.current.stop();
    }
  }, [state.isRecording]);

  const getRecordingBlob = useCallback(() => {
    if (state.recordedChunks.length === 0) return null;
    return new Blob(state.recordedChunks, { type: 'video/webm' });
  }, [state.recordedChunks]);

  const downloadRecording = useCallback((filename?: string) => {
    const blob = getRecordingBlob();
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `recording-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [getRecordingBlob]);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStream();
      stopFrameCapture();
      if (mediaRecorderRef.current && state.isRecording) {
        mediaRecorderRef.current.stop();
      }
    };
  }, [stopStream, stopFrameCapture, state.isRecording]);

  return {
    ...state,
    startStream,
    stopStream,
    startFrameCapture,
    stopFrameCapture,
    startRecording,
    stopRecording,
    getRecordingBlob,
    downloadRecording,
    clearError
  };
};

export default useVideoStream;