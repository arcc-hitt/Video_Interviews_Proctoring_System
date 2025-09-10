import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import VideoStreamComponent from '../VideoStreamComponent';

// Mock stream object
const mockStream = {
  getTracks: vi.fn().mockReturnValue([
    { stop: vi.fn() },
    { stop: vi.fn() }
  ]),
  active: true,
  id: 'mock-stream-id'
};

describe('VideoStreamComponent', () => {
  const mockOnFrameCapture = vi.fn();
  const mockOnRecordingStart = vi.fn();
  const mockOnRecordingStop = vi.fn();
  const mockOnError = vi.fn();

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

  it('renders video element and start camera button', () => {
    render(
      <VideoStreamComponent
        onFrameCapture={mockOnFrameCapture}
        onRecordingStart={mockOnRecordingStart}
        onRecordingStop={mockOnRecordingStop}
        onError={mockOnError}
      />
    );

    expect(screen.getByRole('button', { name: /start camera/i })).toBeInTheDocument();
    const videoElement = document.querySelector('video');
    expect(videoElement).toBeInTheDocument();
  });

  it('starts camera stream when start button is clicked', async () => {
    render(
      <VideoStreamComponent
        onFrameCapture={mockOnFrameCapture}
        onRecordingStart={mockOnRecordingStart}
        onRecordingStop={mockOnRecordingStop}
        onError={mockOnError}
      />
    );

    const startButton = screen.getByRole('button', { name: /start camera/i });
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
          facingMode: 'user'
        },
        audio: true
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Live')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /stop camera/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /start recording/i })).toBeInTheDocument();
    });
  });

  it('handles camera access denied error', async () => {
    const accessDeniedError = new Error('Permission denied');
    accessDeniedError.name = 'NotAllowedError';
    
    navigator.mediaDevices.getUserMedia = vi.fn().mockRejectedValue(accessDeniedError);

    render(
      <VideoStreamComponent
        onFrameCapture={mockOnFrameCapture}
        onRecordingStart={mockOnRecordingStart}
        onRecordingStop={mockOnRecordingStop}
        onError={mockOnError}
      />
    );

    const startButton = screen.getByRole('button', { name: /start camera/i });
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith({
        type: 'CAMERA_ACCESS_DENIED',
        message: 'Permission denied',
        originalError: accessDeniedError
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Camera Error')).toBeInTheDocument();
      expect(screen.getByText('Permission denied')).toBeInTheDocument();
      expect(screen.getByText('Please allow camera access and refresh the page')).toBeInTheDocument();
    });
  });

  it('handles device not found error', async () => {
    const deviceNotFoundError = new Error('No camera found');
    deviceNotFoundError.name = 'NotFoundError';
    
    navigator.mediaDevices.getUserMedia = vi.fn().mockRejectedValue(deviceNotFoundError);

    render(
      <VideoStreamComponent
        onFrameCapture={mockOnFrameCapture}
        onRecordingStart={mockOnRecordingStart}
        onRecordingStop={mockOnRecordingStop}
        onError={mockOnError}
      />
    );

    const startButton = screen.getByRole('button', { name: /start camera/i });
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith({
        type: 'DEVICE_NOT_FOUND',
        message: 'No camera found',
        originalError: deviceNotFoundError
      });
    });
  });

  it('starts and stops recording', async () => {
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

    render(
      <VideoStreamComponent
        onFrameCapture={mockOnFrameCapture}
        onRecordingStart={mockOnRecordingStart}
        onRecordingStop={mockOnRecordingStop}
        onError={mockOnError}
      />
    );

    // Start camera first
    const startButton = screen.getByRole('button', { name: /start camera/i });
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start recording/i })).toBeInTheDocument();
    });

    // Start recording
    const startRecordingButton = screen.getByRole('button', { name: /start recording/i });
    fireEvent.click(startRecordingButton);

    await waitFor(() => {
      expect(MediaRecorder).toHaveBeenCalledWith(mockStream, {
        mimeType: 'video/webm;codecs=vp9'
      });
      expect(mockMediaRecorder.start).toHaveBeenCalledWith(1000);
      expect(mockOnRecordingStart).toHaveBeenCalled();
      expect(screen.getByText('Recording')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /stop recording/i })).toBeInTheDocument();
    });

    // Stop recording
    const stopRecordingBtn = screen.getByRole('button', { name: /stop recording/i });
    fireEvent.click(stopRecordingBtn);

    expect(mockMediaRecorder.stop).toHaveBeenCalled();
  });

  it('handles recording failure', async () => {
    render(
      <VideoStreamComponent
        onFrameCapture={mockOnFrameCapture}
        onRecordingStart={mockOnRecordingStart}
        onRecordingStop={mockOnRecordingStop}
        onError={mockOnError}
      />
    );

    // Try to start recording without camera stream
    const startRecordingButton = screen.queryByRole('button', { name: /start recording/i });
    expect(startRecordingButton).not.toBeInTheDocument();

    // Start camera first
    const startButton = screen.getByRole('button', { name: /start camera/i });
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start recording/i })).toBeInTheDocument();
    });

    // Mock MediaRecorder constructor to throw error
    const MockMediaRecorder: any = vi.fn().mockImplementation(() => {
      throw new Error('Recording not supported');
    });
    MockMediaRecorder.isTypeSupported = vi.fn().mockReturnValue(true);
    globalThis.MediaRecorder = MockMediaRecorder;

    const startRecordingBtn = screen.getByRole('button', { name: /start recording/i });
    fireEvent.click(startRecordingBtn);

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith({
        type: 'RECORDING_FAILED',
        message: 'Recording not supported',
        originalError: expect.any(Error)
      });
    });
  });

  it('stops stream and cleans up on unmount', async () => {
    const { unmount } = render(
      <VideoStreamComponent
        onFrameCapture={mockOnFrameCapture}
        onRecordingStart={mockOnRecordingStart}
        onRecordingStop={mockOnRecordingStop}
        onError={mockOnError}
      />
    );

    // Start camera
    const startButton = screen.getByRole('button', { name: /start camera/i });
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(screen.getByText('Live')).toBeInTheDocument();
    });

    // Unmount component
    unmount();

    // Verify cleanup
    expect(mockStream.getTracks()[0].stop).toHaveBeenCalled();
    expect(mockStream.getTracks()[1].stop).toHaveBeenCalled();
  });

  it('calls onFrameCapture when streaming', async () => {
    // Mock video element properties
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
      writable: true,
      value: 640,
    });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', {
      writable: true,
      value: 480,
    });

    render(
      <VideoStreamComponent
        onFrameCapture={mockOnFrameCapture}
        onRecordingStart={mockOnRecordingStart}
        onRecordingStop={mockOnRecordingStop}
        onError={mockOnError}
      />
    );

    // Start camera
    const startButton = screen.getByRole('button', { name: /start camera/i });
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(screen.getByText('Live')).toBeInTheDocument();
    });

    // Wait for frame capture interval to trigger
    await waitFor(() => {
      expect(mockOnFrameCapture).toHaveBeenCalled();
    }, { timeout: 200 });
  });
});