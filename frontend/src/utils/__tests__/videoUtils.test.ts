import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  checkWebRTCSupport,
  getVideoDevices,
  getAudioDevices,
  createDeviceConstraints,
  handleGetUserMediaError,
  getSupportedMimeType,
  calculateBitrate,
  formatDuration,
  blobToBase64,
  createVideoThumbnail,
  DEFAULT_VIDEO_CONSTRAINTS,
  HIGH_QUALITY_CONSTRAINTS,
  LOW_BANDWIDTH_CONSTRAINTS
} from '../videoUtils';

describe('videoUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkWebRTCSupport', () => {
    it('returns supported true when all APIs are available', () => {
      const result = checkWebRTCSupport();
      expect(result.supported).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('returns missing APIs when not supported', () => {
      // Mock missing MediaDevices
      const originalMediaDevices = navigator.mediaDevices;
      Object.defineProperty(navigator, 'mediaDevices', {
        value: undefined,
        configurable: true
      });

      const result = checkWebRTCSupport();
      expect(result.supported).toBe(false);
      expect(result.missing).toContain('MediaDevices API');

      // Restore
      Object.defineProperty(navigator, 'mediaDevices', {
        value: originalMediaDevices,
        configurable: true
      });
    });

    it('detects missing getUserMedia', () => {
      const originalGetUserMedia = navigator.mediaDevices.getUserMedia;
      delete (navigator.mediaDevices as any).getUserMedia;

      const result = checkWebRTCSupport();
      expect(result.supported).toBe(false);
      expect(result.missing).toContain('getUserMedia');

      // Restore
      navigator.mediaDevices.getUserMedia = originalGetUserMedia;
    });
  });

  describe('getVideoDevices', () => {
    it('returns video input devices', async () => {
      const mockDevices = [
        { kind: 'videoinput', deviceId: 'camera1', label: 'Camera 1' },
        { kind: 'audioinput', deviceId: 'mic1', label: 'Microphone 1' },
        { kind: 'videoinput', deviceId: 'camera2', label: 'Camera 2' },
      ] as MediaDeviceInfo[];

      navigator.mediaDevices.enumerateDevices = vi.fn().mockResolvedValue(mockDevices);

      const result = await getVideoDevices();
      expect(result).toHaveLength(2);
      expect(result[0].deviceId).toBe('camera1');
      expect(result[1].deviceId).toBe('camera2');
    });

    it('handles enumeration error', async () => {
      navigator.mediaDevices.enumerateDevices = vi.fn().mockRejectedValue(new Error('Access denied'));

      const result = await getVideoDevices();
      expect(result).toEqual([]);
    });
  });

  describe('getAudioDevices', () => {
    it('returns audio input devices', async () => {
      const mockDevices = [
        { kind: 'videoinput', deviceId: 'camera1', label: 'Camera 1' },
        { kind: 'audioinput', deviceId: 'mic1', label: 'Microphone 1' },
        { kind: 'audioinput', deviceId: 'mic2', label: 'Microphone 2' },
      ] as MediaDeviceInfo[];

      navigator.mediaDevices.enumerateDevices = vi.fn().mockResolvedValue(mockDevices);

      const result = await getAudioDevices();
      expect(result).toHaveLength(2);
      expect(result[0].deviceId).toBe('mic1');
      expect(result[1].deviceId).toBe('mic2');
    });
  });

  describe('createDeviceConstraints', () => {
    it('creates constraints with default quality', () => {
      const result = createDeviceConstraints();
      expect(result).toEqual(DEFAULT_VIDEO_CONSTRAINTS);
    });

    it('creates constraints with high quality', () => {
      const result = createDeviceConstraints(undefined, undefined, 'high');
      expect(result).toEqual(HIGH_QUALITY_CONSTRAINTS);
    });

    it('creates constraints with low quality', () => {
      const result = createDeviceConstraints(undefined, undefined, 'low');
      expect(result).toEqual(LOW_BANDWIDTH_CONSTRAINTS);
    });

    it('creates constraints with specific device IDs', () => {
      const result = createDeviceConstraints('video123', 'audio456');
      expect(result.video).toEqual({
        ...DEFAULT_VIDEO_CONSTRAINTS.video,
        deviceId: { exact: 'video123' }
      });
      expect(result.audio).toEqual({
        deviceId: { exact: 'audio456' }
      });
    });
  });

  describe('handleGetUserMediaError', () => {
    it('handles NotAllowedError', () => {
      const error = new Error('Permission denied');
      error.name = 'NotAllowedError';

      const result = handleGetUserMediaError(error);
      expect(result.type).toBe('CAMERA_ACCESS_DENIED');
      expect(result.message).toContain('Camera access was denied');
    });

    it('handles NotFoundError', () => {
      const error = new Error('No camera found');
      error.name = 'NotFoundError';

      const result = handleGetUserMediaError(error);
      expect(result.type).toBe('DEVICE_NOT_FOUND');
      expect(result.message).toContain('No camera device found');
    });

    it('handles NotReadableError', () => {
      const error = new Error('Camera in use');
      error.name = 'NotReadableError';

      const result = handleGetUserMediaError(error);
      expect(result.type).toBe('DEVICE_NOT_FOUND');
      expect(result.message).toContain('Camera is already in use');
    });

    it('handles unknown error', () => {
      const error = new Error('Unknown error');
      error.name = 'UnknownError';

      const result = handleGetUserMediaError(error);
      expect(result.type).toBe('STREAM_FAILED');
      expect(result.message).toBe('Unknown error');
    });
  });

  describe('getSupportedMimeType', () => {
    it('returns first supported mime type', () => {
      MediaRecorder.isTypeSupported = vi.fn()
        .mockReturnValueOnce(false) // vp9
        .mockReturnValueOnce(true); // vp8

      const result = getSupportedMimeType();
      expect(result).toBe('video/webm;codecs=vp8');
    });

    it('returns fallback when no types supported', () => {
      MediaRecorder.isTypeSupported = vi.fn().mockReturnValue(false);

      const result = getSupportedMimeType();
      expect(result).toBe('video/webm');
    });
  });

  describe('calculateBitrate', () => {
    it('calculates bitrate correctly', () => {
      const result = calculateBitrate(1920, 1080, 30);
      const expected = Math.round(1920 * 1080 * 30 * 0.1);
      expect(result).toBe(expected);
    });
  });

  describe('formatDuration', () => {
    it('formats seconds to MM:SS', () => {
      expect(formatDuration(65)).toBe('01:05');
      expect(formatDuration(125)).toBe('02:05');
    });

    it('formats seconds to HH:MM:SS for hours', () => {
      expect(formatDuration(3665)).toBe('01:01:05');
      expect(formatDuration(7325)).toBe('02:02:05');
    });

    it('handles zero duration', () => {
      expect(formatDuration(0)).toBe('00:00');
    });
  });

  describe('blobToBase64', () => {
    it('converts blob to base64', async () => {
      const mockBlob = new Blob(['test data'], { type: 'video/webm' });

      // Mock FileReader
      const mockFileReader = {
        readAsDataURL: vi.fn(),
        onload: null,
        onerror: null,
        result: 'data:video/webm;base64,dGVzdCBkYXRh'
      };

      const MockFileReader: any = vi.fn().mockImplementation(() => mockFileReader);
      MockFileReader.EMPTY = 0;
      MockFileReader.LOADING = 1;
      MockFileReader.DONE = 2;
      globalThis.FileReader = MockFileReader;

      const promise = blobToBase64(mockBlob);

      // Simulate FileReader onload
      if (mockFileReader.onload) {
        (mockFileReader.onload as any)({} as any);
      }

      const result = await promise;
      expect(result).toBe('dGVzdCBkYXRh');
    });

    it('handles FileReader error', async () => {
      const mockBlob = new Blob(['test data'], { type: 'video/webm' });

      const mockFileReader = {
        readAsDataURL: vi.fn(),
        onload: null,
        onerror: null,
        result: null
      };

      const MockFileReader: any = vi.fn().mockImplementation(() => mockFileReader);
      MockFileReader.EMPTY = 0;
      MockFileReader.LOADING = 1;
      MockFileReader.DONE = 2;
      globalThis.FileReader = MockFileReader;

      const promise = blobToBase64(mockBlob);

      // Simulate FileReader error
      if (mockFileReader.onerror) {
        (mockFileReader.onerror as any)(new Error('Read failed') as any);
      }

      await expect(promise).rejects.toThrow('Read failed');
    });
  });

  describe('createVideoThumbnail', () => {
    it('creates thumbnail from video blob', async () => {
      const mockBlob = new Blob(['video data'], { type: 'video/webm' });

      const mockVideo = {
        addEventListener: vi.fn(),
        videoWidth: 640,
        videoHeight: 480,
        duration: 10,
        currentTime: 0,
        src: '',
        load: vi.fn()
      };

      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn().mockReturnValue({
          drawImage: vi.fn()
        }),
        toDataURL: vi.fn().mockReturnValue('data:image/jpeg;base64,thumbnail')
      };

      vi.spyOn(document, 'createElement')
        .mockReturnValueOnce(mockVideo as any)
        .mockReturnValueOnce(mockCanvas as any);

      const promise = createVideoThumbnail(mockBlob, 2);

      // Simulate video events
      const loadedMetadataCallback = mockVideo.addEventListener.mock.calls
        .find(call => call[0] === 'loadedmetadata')?.[1];
      const seekedCallback = mockVideo.addEventListener.mock.calls
        .find(call => call[0] === 'seeked')?.[1];

      if (loadedMetadataCallback) {
        loadedMetadataCallback();
      }
      if (seekedCallback) {
        seekedCallback();
      }

      const result = await promise;
      expect(result).toBe('data:image/jpeg;base64,thumbnail');
      expect(mockCanvas.width).toBe(640);
      expect(mockCanvas.height).toBe(480);
      expect(mockVideo.currentTime).toBe(2);
    });

    it('handles video loading error', async () => {
      const mockBlob = new Blob(['video data'], { type: 'video/webm' });

      const mockVideo = {
        addEventListener: vi.fn(),
        src: '',
        load: vi.fn()
      };

      const mockCanvas = {
        getContext: vi.fn().mockReturnValue({})
      };

      vi.spyOn(document, 'createElement')
        .mockReturnValueOnce(mockVideo as any)
        .mockReturnValueOnce(mockCanvas as any);

      const promise = createVideoThumbnail(mockBlob);

      // Simulate video error
      const errorCallback = mockVideo.addEventListener.mock.calls
        .find(call => call[0] === 'error')?.[1];

      if (errorCallback) {
        errorCallback();
      }

      await expect(promise).rejects.toThrow('Error loading video for thumbnail');
    });

    it('handles missing canvas context', async () => {
      const mockBlob = new Blob(['video data'], { type: 'video/webm' });

      const mockCanvas = {
        getContext: vi.fn().mockReturnValue(null)
      };

      vi.spyOn(document, 'createElement')
        .mockReturnValueOnce({} as any)
        .mockReturnValueOnce(mockCanvas as any);

      await expect(createVideoThumbnail(mockBlob)).rejects.toThrow('Canvas context not available');
    });
  });
});