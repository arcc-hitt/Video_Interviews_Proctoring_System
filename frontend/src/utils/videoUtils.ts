import type { MediaConstraints, VideoStreamError } from '../types';

/**
 * Default media constraints for video streaming
 */
export const DEFAULT_VIDEO_CONSTRAINTS: MediaConstraints = {
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 },
    facingMode: 'user'
  },
  audio: true
};

/**
 * High quality constraints for recording
 */
export const HIGH_QUALITY_CONSTRAINTS: MediaConstraints = {
  video: {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 30 },
    facingMode: 'user'
  },
  audio: true
};

/**
 * Low bandwidth constraints for slower connections
 */
export const LOW_BANDWIDTH_CONSTRAINTS: MediaConstraints = {
  video: {
    width: { ideal: 640 },
    height: { ideal: 480 },
    frameRate: { ideal: 15 },
    facingMode: 'user'
  },
  audio: true
};

/**
 * Check if the browser supports required WebRTC features
 */
export const checkWebRTCSupport = (): { supported: boolean; missing: string[] } => {
  const missing: string[] = [];

  if (!navigator.mediaDevices) {
    missing.push('MediaDevices API');
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    missing.push('getUserMedia');
  }

  if (!window.MediaRecorder) {
    missing.push('MediaRecorder API');
  }

  if (!window.RTCPeerConnection) {
    missing.push('RTCPeerConnection');
  }

  return {
    supported: missing.length === 0,
    missing
  };
};

/**
 * Get available video input devices
 */
export const getVideoDevices = async (): Promise<MediaDeviceInfo[]> => {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(device => device.kind === 'videoinput');
  } catch (error) {
    console.error('Error enumerating video devices:', error);
    return [];
  }
};

/**
 * Get available audio input devices
 */
export const getAudioDevices = async (): Promise<MediaDeviceInfo[]> => {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(device => device.kind === 'audioinput');
  } catch (error) {
    console.error('Error enumerating audio devices:', error);
    return [];
  }
};

/**
 * Create constraints for a specific device
 */
export const createDeviceConstraints = (
  videoDeviceId?: string,
  audioDeviceId?: string,
  quality: 'low' | 'medium' | 'high' = 'medium'
): MediaConstraints => {
  const baseConstraints = quality === 'high'
    ? HIGH_QUALITY_CONSTRAINTS
    : quality === 'low'
      ? LOW_BANDWIDTH_CONSTRAINTS
      : DEFAULT_VIDEO_CONSTRAINTS;

  return {
    video: {
      ...baseConstraints.video,
      ...(videoDeviceId && { deviceId: { exact: videoDeviceId } })
    },
    audio: audioDeviceId
      ? { deviceId: { exact: audioDeviceId } }
      : baseConstraints.audio
  };
};

/**
 * Handle getUserMedia errors and convert to VideoStreamError
 */
export const handleGetUserMediaError = (error: Error): VideoStreamError => {
  switch (error.name) {
    case 'NotAllowedError':
      return {
        type: 'CAMERA_ACCESS_DENIED',
        message: 'Camera access was denied. Please allow camera permissions and try again.',
        originalError: error
      };
    case 'NotFoundError':
      return {
        type: 'DEVICE_NOT_FOUND',
        message: 'No camera device found. Please connect a camera and try again.',
        originalError: error
      };
    case 'NotReadableError':
      return {
        type: 'DEVICE_NOT_FOUND',
        message: 'Camera is already in use by another application.',
        originalError: error
      };
    case 'OverconstrainedError':
      return {
        type: 'DEVICE_NOT_FOUND',
        message: 'Camera does not support the requested constraints.',
        originalError: error
      };
    case 'SecurityError':
      return {
        type: 'CAMERA_ACCESS_DENIED',
        message: 'Camera access blocked due to security restrictions.',
        originalError: error
      };
    default:
      return {
        type: 'STREAM_FAILED',
        message: error.message || 'Unknown error occurred while accessing camera.',
        originalError: error
      };
  }
};

/**
 * Check if MediaRecorder supports a specific MIME type
 */
export const getSupportedMimeType = (): string => {
  const types = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4;codecs=h264',
    'video/mp4'
  ];

  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }

  return 'video/webm'; // Fallback
};

/**
 * Calculate video bitrate based on resolution and frame rate
 */
export const calculateBitrate = (width: number, height: number, frameRate: number): number => {
  // Base bitrate calculation: pixels per second * bits per pixel
  const pixelsPerSecond = width * height * frameRate;
  const bitsPerPixel = 0.1; // Conservative estimate
  return Math.round(pixelsPerSecond * bitsPerPixel);
};

/**
 * Format video duration from seconds to HH:MM:SS
 */
export const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Convert blob to base64 string
 */
export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]); // Remove data:video/webm;base64, prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

/**
 * Create a thumbnail from video blob
 */
export const createVideoThumbnail = (blob: Blob, timeOffset: number = 1): Promise<string> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Canvas context not available'));
      return;
    }

    video.addEventListener('loadedmetadata', () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      video.currentTime = Math.min(timeOffset, video.duration);
    });

    video.addEventListener('seeked', () => {
      ctx.drawImage(video, 0, 0);
      const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.8);
      resolve(thumbnailDataUrl);
      URL.revokeObjectURL(video.src);
    });

    video.addEventListener('error', () => {
      reject(new Error('Error loading video for thumbnail'));
      URL.revokeObjectURL(video.src);
    });

    video.src = URL.createObjectURL(blob);
    video.load();
  });
};