import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFaceDetection } from '../useFaceDetection';
import type { FocusEvent } from '../../types';

// Mock ImageData for test environment
global.ImageData = class ImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }
} as any;

// Mock the face detection service
const mockService = {
  detectFace: vi.fn(),
  trackGazeDirection: vi.fn(),
  checkFocusStatus: vi.fn(),
  cleanup: vi.fn(),
  onFocusEvent: null as ((event: FocusEvent) => void) | null
};

vi.mock('../../services/faceDetectionService', () => ({
  MediaPipeFaceDetectionService: vi.fn().mockImplementation(() => mockService)
}));

describe('useFaceDetection', () => {
  let mockOnDetectionEvent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnDetectionEvent = vi.fn();

    // Reset mock service methods
    mockService.detectFace.mockResolvedValue({
      faces: [{ landmarks: [], boundingBox: { x: 0, y: 0, width: 100, height: 100 }, confidence: 0.9 }],
      landmarks: [{ x: 0.5, y: 0.5, z: 0 }],
      confidence: 0.9,
      timestamp: new Date()
    });

    mockService.trackGazeDirection.mockReturnValue({
      x: 0.1,
      y: 0.1,
      isLookingAtScreen: true,
      confidence: 0.9
    });

    mockService.checkFocusStatus.mockReturnValue({
      isFocused: true,
      gazeDirection: { x: 0.1, y: 0.1, isLookingAtScreen: true, confidence: 0.9 },
      faceCount: 1,
      isPresent: true,
      confidence: 0.9
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize face detection service when enabled', async () => {
    const { result } = renderHook(() =>
      useFaceDetection({
        enabled: true,
        onDetectionEvent: mockOnDetectionEvent,
        sessionId: 'test-session',
        candidateId: 'test-candidate'
      })
    );

    // Wait for initialization
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.isInitialized).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('should not initialize when disabled', () => {
    const { result } = renderHook(() =>
      useFaceDetection({ enabled: false })
    );

    expect(result.current.isInitialized).toBe(false);
  });

  it('should process video frames and update focus status', async () => {
    const { result } = renderHook(() =>
      useFaceDetection({
        enabled: true,
        onDetectionEvent: mockOnDetectionEvent,
        sessionId: 'test-session',
        candidateId: 'test-candidate'
      })
    );

    // Wait for initialization
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Create mock image data
    const mockImageData = new ImageData(640, 480);

    // Process frame
    await act(async () => {
      await result.current.processFrame(mockImageData);
    });

    expect(mockService.detectFace).toHaveBeenCalledWith(mockImageData);
    expect(mockService.trackGazeDirection).toHaveBeenCalled();
    expect(mockService.checkFocusStatus).toHaveBeenCalled();
    expect(result.current.currentFocusStatus).toBeTruthy();
    expect(result.current.currentFocusStatus?.isFocused).toBe(true);
  });

  it('should handle focus events and convert to detection events', async () => {
    renderHook(() =>
      useFaceDetection({
        enabled: true,
        onDetectionEvent: mockOnDetectionEvent,
        sessionId: 'test-session',
        candidateId: 'test-candidate'
      })
    );

    // Wait for initialization
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Simulate a focus event
    const focusEvent: FocusEvent = {
      type: 'focus-loss',
      timestamp: new Date(),
      duration: 5000,
      confidence: 0.8,
      metadata: {
        faceCount: 1,
        gazeDirection: { x: 0.8, y: 0.3, isLookingAtScreen: false, confidence: 0.8 }
      }
    };

    // Trigger focus event through the service callback
    act(() => {
      if (mockService.onFocusEvent) {
        mockService.onFocusEvent(focusEvent);
      }
    });

    expect(mockOnDetectionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'test-session',
        candidateId: 'test-candidate',
        eventType: 'focus-loss',
        timestamp: focusEvent.timestamp,
        duration: 5000,
        confidence: 0.8,
        metadata: expect.objectContaining({
          faceCount: 1,
          originalEventType: 'focus-loss'
        })
      })
    );
  });

  it('should handle multiple faces event', async () => {
    renderHook(() =>
      useFaceDetection({
        enabled: true,
        onDetectionEvent: mockOnDetectionEvent,
        sessionId: 'test-session',
        candidateId: 'test-candidate'
      })
    );

    // Wait for initialization
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Simulate multiple faces event
    const focusEvent: FocusEvent = {
      type: 'multiple-faces',
      timestamp: new Date(),
      confidence: 0.9,
      metadata: {
        faceCount: 3
      }
    };

    act(() => {
      if (mockService.onFocusEvent) {
        mockService.onFocusEvent(focusEvent);
      }
    });

    expect(mockOnDetectionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'multiple-faces',
        metadata: expect.objectContaining({
          faceCount: 3,
          originalEventType: 'multiple-faces'
        })
      })
    );
  });

  it('should handle absence event', async () => {
    renderHook(() =>
      useFaceDetection({
        enabled: true,
        onDetectionEvent: mockOnDetectionEvent,
        sessionId: 'test-session',
        candidateId: 'test-candidate'
      })
    );

    // Wait for initialization
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Simulate absence event
    const focusEvent: FocusEvent = {
      type: 'absence',
      timestamp: new Date(),
      duration: 10000,
      confidence: 0,
      metadata: {
        faceCount: 0
      }
    };

    act(() => {
      if (mockService.onFocusEvent) {
        mockService.onFocusEvent(focusEvent);
      }
    });

    expect(mockOnDetectionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'absence',
        duration: 10000,
        metadata: expect.objectContaining({
          faceCount: 0,
          originalEventType: 'absence'
        })
      })
    );
  });

  it('should handle processing errors gracefully', async () => {
    mockService.detectFace.mockRejectedValue(new Error('Detection failed'));

    const { result } = renderHook(() =>
      useFaceDetection({
        enabled: true,
        onDetectionEvent: mockOnDetectionEvent,
        sessionId: 'test-session',
        candidateId: 'test-candidate'
      })
    );

    // Wait for initialization
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    const mockImageData = new ImageData(640, 480);

    await act(async () => {
      await result.current.processFrame(mockImageData);
    });

    expect(result.current.error).toBe('Detection failed');
  });

  it('should not process frames when disabled', async () => {
    const { result } = renderHook(() =>
      useFaceDetection({ enabled: false })
    );

    const mockImageData = new ImageData(640, 480);

    await act(async () => {
      await result.current.processFrame(mockImageData);
    });

    expect(mockService.detectFace).not.toHaveBeenCalled();
  });

  it('should not emit detection events without session info', async () => {
    renderHook(() =>
      useFaceDetection({
        enabled: true,
        onDetectionEvent: mockOnDetectionEvent
        // No sessionId or candidateId provided
      })
    );

    // Wait for initialization
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Simulate focus event
    const focusEvent: FocusEvent = {
      type: 'focus-loss',
      timestamp: new Date(),
      duration: 5000,
      confidence: 0.8,
      metadata: {}
    };

    act(() => {
      if (mockService.onFocusEvent) {
        mockService.onFocusEvent(focusEvent);
      }
    });

    expect(mockOnDetectionEvent).not.toHaveBeenCalled();
  });

  it('should cleanup service on unmount', () => {
    const { result, unmount } = renderHook(() =>
      useFaceDetection({ enabled: true })
    );

    act(() => {
      result.current.cleanup();
    });

    expect(mockService.cleanup).toHaveBeenCalled();
    expect(result.current.isInitialized).toBe(false);
    expect(result.current.currentFocusStatus).toBeNull();

    unmount();
  });
});