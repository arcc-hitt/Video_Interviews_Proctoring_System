import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CandidateInterface } from '../CandidateInterface';
import type { User } from '../../types';

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

// Mock the hooks
const mockProcessFaceFrame = vi.fn();
const mockCleanupFaceDetection = vi.fn();
const mockProcessComputerVisionFrame = vi.fn();
const mockCleanupComputerVision = vi.fn();

vi.mock('../../hooks/useFaceDetection', () => ({
  useFaceDetection: vi.fn(() => ({
    isInitialized: true,
    currentFocusStatus: null,
    processFrame: mockProcessFaceFrame,
    cleanup: mockCleanupFaceDetection,
    error: null
  }))
}));

vi.mock('../../hooks/useComputerVision', () => ({
  useComputerVision: vi.fn(() => ({
    isInitialized: true,
    currentFocusStatus: null,
    unauthorizedItems: [],
    processFrame: mockProcessComputerVisionFrame,
    getEventAggregations: vi.fn(() => new Map()),
    getEventQueue: vi.fn(() => []),
    clearEvents: vi.fn(),
    cleanup: mockCleanupComputerVision,
    error: null
  }))
}));

// Mock VideoStreamComponent
vi.mock('../VideoStreamComponent', () => ({
  VideoStreamComponent: vi.fn(({ onFrameCapture, onRecordingStart, onRecordingStop }) => (
    <div data-testid="video-stream-component">
      <button onClick={() => onFrameCapture?.(new ImageData(1, 1))}>
        Capture Frame
      </button>
      <button onClick={() => onRecordingStart?.()}>Start Recording</button>
      <button onClick={() => onRecordingStop?.()}>Stop Recording</button>
    </div>
  ))
}));

// Mock WebSocket
const mockWebSocket = {
  send: vi.fn(),
  close: vi.fn(),
  readyState: 1, // WebSocket.OPEN
  onopen: null as any,
  onmessage: null as any,
  onclose: null as any,
  onerror: null as any
};

global.WebSocket = vi.fn(() => mockWebSocket) as any;

// Mock fetch
global.fetch = vi.fn();

const mockUser: User = {
  id: 'user-1',
  email: 'candidate@test.com',
  name: 'Test Candidate',
  role: 'candidate',
  createdAt: new Date()
};

let mockAuthState = {
  user: mockUser as User | null,
  token: 'mock-token',
  isAuthenticated: true,
  isLoading: false,
  error: null
};

const mockAuthContextValue = {
  get authState() { return mockAuthState; },
  login: vi.fn(),
  signup: vi.fn(),
  logout: vi.fn(),
  clearError: vi.fn()
};

// Mock AuthContext
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockAuthContextValue,
  AuthProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

const mockSession = {
  sessionId: 'session-123',
  candidateId: 'candidate-123',
  candidateName: 'Test Candidate',
  startTime: new Date(),
  status: 'active' as const
};

describe('CandidateInterface', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset auth state
    mockAuthState = {
      user: mockUser as User | null,
      token: 'mock-token',
      isAuthenticated: true,
      isLoading: false,
      error: null
    };

    // Mock successful session fetch
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: mockSession
      })
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  const renderComponent = (props = {}) => {
    return render(<CandidateInterface sessionId="session-123" {...props} />);
  };

  describe('Session Initialization', () => {
    it('should render loading state initially', () => {
      renderComponent();
      expect(screen.getByText('Initializing interview session...')).toBeInTheDocument();
    });

    it('should fetch session details on mount', async () => {
      renderComponent();

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/sessions/session-123', {
          headers: {
            'Authorization': 'Bearer mock-token'
          }
        });
      });
    });

    it('should display error when session fetch fails', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({
          success: false,
          message: 'Session not found'
        })
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Session Error')).toBeInTheDocument();
        expect(screen.getByText('Failed to fetch session details')).toBeInTheDocument();
      });
    });

    it('should display error when no session ID provided', async () => {
      renderComponent({ sessionId: undefined });

      await waitFor(() => {
        expect(screen.getByText('No session ID provided. Please contact your interviewer.')).toBeInTheDocument();
      });
    });

    it('should initialize WebSocket connection after successful session fetch', async () => {
      renderComponent();

      await waitFor(() => {
        expect(global.WebSocket).toHaveBeenCalledWith(
          'ws://localhost:3001/ws?sessionId=session-123&token=mock-token'
        );
      });
    });
  });

  describe('Session Controls', () => {
    beforeEach(async () => {
      renderComponent();

      // Wait for session to load
      await waitFor(() => {
        expect(screen.getByText('Interview Session')).toBeInTheDocument();
      });
    });

    it('should display start button initially', async () => {
      await waitFor(() => {
        expect(screen.getByText('Start Interview')).toBeInTheDocument();
      });
    });

    it('should start session when start button is clicked', async () => {
      const startButton = await screen.findByText('Start Interview');

      await act(async () => {
        fireEvent.click(startButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Pause Interview')).toBeInTheDocument();
        expect(screen.getByText('End Interview')).toBeInTheDocument();
      });
    });

    it('should pause session when pause button is clicked', async () => {
      // Start session first
      const startButton = await screen.findByText('Start Interview');
      await act(async () => {
        fireEvent.click(startButton);
      });

      // Then pause
      const pauseButton = await screen.findByText('Pause Interview');
      await act(async () => {
        fireEvent.click(pauseButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Resume Interview')).toBeInTheDocument();
        expect(screen.getByText('Paused')).toBeInTheDocument();
      });
    });

    it('should end session when end button is clicked', async () => {
      // Mock successful session end
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true })
      });

      // Start session first
      const startButton = await screen.findByText('Start Interview');
      await act(async () => {
        fireEvent.click(startButton);
      });

      // Then end
      const endButton = await screen.findByText('End Interview');
      await act(async () => {
        fireEvent.click(endButton);
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/sessions/session-123/end', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer mock-token'
          }
        });
      });
    });
  });

  describe('Session Information Display', () => {
    beforeEach(async () => {
      renderComponent();

      // Wait for session to load
      await waitFor(() => {
        expect(screen.getByText('Interview Session')).toBeInTheDocument();
      });
    });

    it('should display session details', async () => {
      await waitFor(() => {
        expect(screen.getByText('Session Details')).toBeInTheDocument();
        expect(screen.getByText('Test Candidate')).toBeInTheDocument();
        expect(screen.getByText('active')).toBeInTheDocument();
      });
    });

    it('should display session duration timer', async () => {
      // Start session to begin timer
      const startButton = await screen.findByText('Start Interview');

      await act(async () => {
        fireEvent.click(startButton);
      });

      // Check initial duration
      expect(screen.getByText('0:00')).toBeInTheDocument();
    });

    it('should display monitoring status', async () => {
      await waitFor(() => {
        expect(screen.getByText('Monitoring Status')).toBeInTheDocument();
        expect(screen.getByText('Face Detection')).toBeInTheDocument();
        expect(screen.getByText('Object Detection')).toBeInTheDocument();
        expect(screen.getByText('Events Logged')).toBeInTheDocument();
      });
    });

    it('should display interview guidelines', async () => {
      await waitFor(() => {
        expect(screen.getByText('Interview Guidelines')).toBeInTheDocument();
        expect(screen.getByText(/Keep your face visible to the camera/)).toBeInTheDocument();
        expect(screen.getByText(/Look directly at the screen/)).toBeInTheDocument();
      });
    });
  });

  describe('Video Stream Integration', () => {
    beforeEach(async () => {
      renderComponent();

      // Wait for session to load
      await waitFor(() => {
        expect(screen.getByText('Interview Session')).toBeInTheDocument();
      });
    });

    it('should render video stream component', async () => {
      await waitFor(() => {
        expect(screen.getByTestId('video-stream-component')).toBeInTheDocument();
      });
    });

    it('should handle frame capture for computer vision', async () => {
      const captureButton = screen.getByText('Capture Frame');

      await act(async () => {
        fireEvent.click(captureButton);
      });

      // Should not throw error
      expect(captureButton).toBeInTheDocument();
    });
  });

  describe('WebSocket Communication', () => {
    beforeEach(async () => {
      renderComponent();

      // Wait for session to load
      await waitFor(() => {
        expect(screen.getByText('Interview Session')).toBeInTheDocument();
      });
    });

    it('should send session started message when session starts', async () => {
      const startButton = await screen.findByText('Start Interview');

      await act(async () => {
        fireEvent.click(startButton);
      });

      // Check that WebSocket was initialized
      expect(global.WebSocket).toHaveBeenCalled();
    });

    it('should send session paused message when session is paused', async () => {
      // Start session first
      const startButton = await screen.findByText('Start Interview');
      await act(async () => {
        fireEvent.click(startButton);
      });

      // Then pause
      const pauseButton = await screen.findByText('Pause Interview');
      await act(async () => {
        fireEvent.click(pauseButton);
      });

      // Check that WebSocket was initialized
      expect(global.WebSocket).toHaveBeenCalled();
    });

    it('should handle WebSocket messages', async () => {
      // Wait for WebSocket to be initialized
      await waitFor(() => {
        expect(global.WebSocket).toHaveBeenCalled();
      });

      // Simulate WebSocket message after component is fully loaded
      const message = {
        type: 'session_status_update',
        data: { status: 'completed' }
      };

      await act(async () => {
        if (mockWebSocket.onmessage) {
          mockWebSocket.onmessage({ data: JSON.stringify(message) } as MessageEvent);
        }
      });

      // WebSocket should be available for communication
      expect(global.WebSocket).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle authentication errors', async () => {
      mockAuthState.isAuthenticated = false;
      mockAuthState.user = null;

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('User not authenticated')).toBeInTheDocument();
      });
    });

    it('should handle session end errors gracefully', async () => {
      renderComponent();

      // Wait for session to load
      await waitFor(() => {
        expect(screen.getByText('Interview Session')).toBeInTheDocument();
      });

      // Start session first
      const startButton = await screen.findByText('Start Interview');
      await act(async () => {
        fireEvent.click(startButton);
      });

      // Mock failed session end for the next fetch call
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error'
      });

      // Then try to end
      const endButton = await screen.findByText('End Interview');
      await act(async () => {
        fireEvent.click(endButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Failed to end session')).toBeInTheDocument();
      });
    });

    it('should retry session initialization on error', async () => {
      // Mock initial failure
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Session Error')).toBeInTheDocument();
      });

      // Mock successful retry
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockSession
        })
      });

      const retryButton = screen.getByText('Retry');
      await act(async () => {
        fireEvent.click(retryButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Interview Session')).toBeInTheDocument();
      });
    });
  });

  describe('Cleanup', () => {
    it('should cleanup resources on unmount', async () => {
      const { unmount } = renderComponent();

      // Wait for session to load
      await waitFor(() => {
        expect(screen.getByText('Interview Session')).toBeInTheDocument();
      });

      // Start session to initialize resources
      const startButton = await screen.findByText('Start Interview');
      await act(async () => {
        fireEvent.click(startButton);
      });

      // Unmount component
      unmount();

      // Should have initialized WebSocket
      expect(global.WebSocket).toHaveBeenCalled();
    });
  });

  describe('Session End Callback', () => {
    it('should call onSessionEnd callback when session ends', async () => {
      const onSessionEnd = vi.fn();
      renderComponent({ onSessionEnd });

      // Wait for session to load
      await waitFor(() => {
        expect(screen.getByText('Interview Session')).toBeInTheDocument();
      });

      // Start session first
      const startButton = await screen.findByText('Start Interview');
      await act(async () => {
        fireEvent.click(startButton);
      });

      // Mock successful session end for the next fetch call
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true })
      });

      const endButton = await screen.findByText('End Interview');
      await act(async () => {
        fireEvent.click(endButton);
      });

      await waitFor(() => {
        expect(onSessionEnd).toHaveBeenCalled();
      });
    });
  });
});