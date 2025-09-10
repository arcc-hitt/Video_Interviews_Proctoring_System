import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useVideoStream } from '../useVideoStream';

// Mock stream object
const mockStream = {
  getTracks: vi.fn().mockReturnValue([
    { stop: vi.fn() },
    { stop: vi.fn() }
  ]),
};

describe('useVideoStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset MediaDevices mock
    navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(mockStream);
    
    // Reset MediaRecorder mock
    const MockMediaRecorder: any = vi.fn().mockImplementation(() => ({
      start: vi.fn(),
      stop: vi.fn(),
      ondataavailable: null,
      onstop: null,
      onerror: null,
      state: 'inactive',
    }));
    MockMediaRecorder.isTypeSupported = vi.fn().mockReturnValue(true);
    globalThis.MediaRecorder = MockMediaRecorder;
    
    MediaRecorder.isTypeSupported = vi.fn().mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with default state', () => {
    const { result } = renderHook(() => useVideoStream());

    expect(result.current.stream).toBeNull();
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.isRecording).toBe(false);
    expect(result.current.recordedChunks).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('starts stream successfully', async () => {
    const { result } = renderHook(() => useVideoStream());

    await act(async () => {
      const stream = await result.current.startStream();
      expect(stream).toBe(mockStream);
    });

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
        facingMode: 'user'
      },
      audio: true
    });

    expect(result.current.stream).toBe(mockStream);
    expect(result.current.isStreaming).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('handles stream start error', async () => {
    const accessDeniedError = new Error('Permission denied');
    accessDeniedError.name = 'NotAllowedError';
    
    navigator.mediaDevices.getUserMedia = vi.fn().mockRejectedValue(accessDeniedError);

    const { result } = renderHook(() => useVideoStream());

    await act(async () => {
      try {
        await result.current.startStream();
      } catch (error) {
        expect(error).toEqual({
          type: 'CAMERA_ACCESS_DENIED',
          message: 'Permission denied',
          originalError: accessDeniedError
        });
      }
    });

    expect(result.current.stream).toBeNull();
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.error).toEqual({
      type: 'CAMERA_ACCESS_DENIED',
      message: 'Permission denied',
      originalError: accessDeniedError
    });
  });

  it('stops stream and cleans up', async () => {
    const { result } = renderHook(() => useVideoStream());

    // Start stream first
    await act(async () => {
      await result.current.startStream();
    });

    expect(result.current.isStreaming).toBe(true);

    // Stop stream
    act(() => {
      result.current.stopStream();
    });

    expect(mockStream.getTracks()[0].stop).toHaveBeenCalled();
    expect(mockStream.getTracks()[1].stop).toHaveBeenCalled();
    expect(result.current.stream).toBeNull();
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('starts recording successfully', async () => {
    const mockMediaRecorder = {
      start: vi.fn(),
      stop: vi.fn(),
      ondataavailable: null,
      onstop: null,
      onerror: null,
      state: 'inactive',
    };

    const MockMediaRecorder: any = vi.fn().mockImplementation(() => mockMediaRecorder);
    MockMediaRecorder.isTypeSupported = vi.fn().mockReturnValue(true);
    globalThis.MediaRecorder = MockMediaRecorder;

    const { result } = renderHook(() => useVideoStream());

    // Start stream first
    await act(async () => {
      await result.current.startStream();
    });

    // Start recording
    await act(async () => {
      await result.current.startRecording();
    });

    expect(MediaRecorder).toHaveBeenCalledWith(mockStream, {
      mimeType: 'video/webm;codecs=vp9'
    });
    expect(mockMediaRecorder.start).toHaveBeenCalledWith(1000);
    expect(result.current.isRecording).toBe(true);
    expect(result.current.recordedChunks).toEqual([]);
  });

  it('handles recording without stream', async () => {
    const { result } = renderHook(() => useVideoStream());

    await act(async () => {
      try {
        await result.current.startRecording();
      } catch (error) {
        expect(error).toEqual({
          type: 'RECORDING_FAILED',
          message: 'No active stream to record'
        });
      }
    });

    expect(result.current.isRecording).toBe(false);
    expect(result.current.error).toEqual({
      type: 'RECORDING_FAILED',
      message: 'No active stream to record'
    });
  });

  it('stops recording', async () => {
    const mockMediaRecorder = {
      start: vi.fn(),
      stop: vi.fn(),
      ondataavailable: null,
      onstop: null,
      onerror: null,
      state: 'recording',
    };

    const MockMediaRecorder: any = vi.fn().mockImplementation(() => mockMediaRecorder);
    MockMediaRecorder.isTypeSupported = vi.fn().mockReturnValue(true);
    globalThis.MediaRecorder = MockMediaRecorder;

    const { result } = renderHook(() => useVideoStream());

    // Start stream and recording
    await act(async () => {
      await result.current.startStream();
    });

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.isRecording).toBe(true);

    // Stop recording
    act(() => {
      result.current.stopRecording();
    });

    expect(mockMediaRecorder.stop).toHaveBeenCalled();
  });

  it('gets recording blob', async () => {
    const { result } = renderHook(() => useVideoStream());

    // Initially no blob
    expect(result.current.getRecordingBlob()).toBeNull();

    // Start stream and recording to get chunks
    const mockMediaRecorder: any = {
      start: vi.fn(),
      stop: vi.fn(),
      ondataavailable: null,
      onstop: null,
      onerror: null,
      state: 'inactive',
    };

    const MockMediaRecorder: any = vi.fn().mockImplementation(() => mockMediaRecorder);
    MockMediaRecorder.isTypeSupported = vi.fn().mockReturnValue(true);
    globalThis.MediaRecorder = MockMediaRecorder;

    await act(async () => {
      await result.current.startStream();
      await result.current.startRecording();
    });

    // Simulate recording data available
    const testBlob = new Blob(['test'], { type: 'video/webm' });
    act(() => {
      if (mockMediaRecorder.ondataavailable) {
        mockMediaRecorder.ondataavailable({ data: testBlob } as any);
      }
      if (mockMediaRecorder.onstop) {
        mockMediaRecorder.onstop({} as any);
      }
    });

    const blob = result.current.getRecordingBlob();
    expect(blob).toBeInstanceOf(Blob);
    expect(blob?.type).toBe('video/webm');
  });

  it('downloads recording', async () => {
    const { result } = renderHook(() => useVideoStream());

    // Mock document methods
    const mockAnchor = {
      href: '',
      download: '',
      click: vi.fn(),
    };
    
    const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as any);
    const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockAnchor as any);
    const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockAnchor as any);

    // Simulate recorded chunks
    act(() => {
      result.current.recordedChunks.push(new Blob(['test'], { type: 'video/webm' }));
    });

    act(() => {
      result.current.downloadRecording('test-recording.webm');
    });

    expect(createElementSpy).toHaveBeenCalledWith('a');
    expect(mockAnchor.download).toBe('test-recording.webm');
    expect(mockAnchor.click).toHaveBeenCalled();
    expect(appendChildSpy).toHaveBeenCalledWith(mockAnchor);
    expect(removeChildSpy).toHaveBeenCalledWith(mockAnchor);

    createElementSpy.mockRestore();
    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
  });

  it('clears error', async () => {
    const { result } = renderHook(() => useVideoStream());

    // Trigger an error first
    navigator.mediaDevices.getUserMedia = vi.fn().mockRejectedValue(new Error('Test error'));

    await act(async () => {
      try {
        await result.current.startStream();
      } catch (error) {
        // Expected to fail
      }
    });

    expect(result.current.error).toBeTruthy();

    // Clear error
    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBeNull();
  });

  it('handles frame capture', () => {
    const { result } = renderHook(() => useVideoStream());

    const mockVideo = {
      videoWidth: 640,
      videoHeight: 480,
    } as HTMLVideoElement;

    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue({
        drawImage: vi.fn(),
        getImageData: vi.fn().mockReturnValue({
          data: new Uint8ClampedArray(4),
          width: 640,
          height: 480,
        }),
      }),
    } as any;

    const mockCallback = vi.fn();

    act(() => {
      result.current.startFrameCapture(mockVideo, mockCanvas, mockCallback, 50);
    });

    // Wait for interval to trigger
    setTimeout(() => {
      expect(mockCanvas.width).toBe(640);
      expect(mockCanvas.height).toBe(480);
      expect(mockCallback).toHaveBeenCalled();
    }, 100);

    act(() => {
      result.current.stopFrameCapture();
    });
  });
});