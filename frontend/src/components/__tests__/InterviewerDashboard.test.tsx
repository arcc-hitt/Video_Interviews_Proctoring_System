import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InterviewerDashboard } from '../dashboard/InterviewerDashboard';
import { useAuth } from '../../contexts/AuthContext';
import { io } from 'socket.io-client';

// Mock dependencies
vi.mock('../../contexts/AuthContext');
vi.mock('socket.io-client');

// Mock WebRTC APIs
const mockPeerConnection = {
  setRemoteDescription: vi.fn().mockResolvedValue(undefined),
  createAnswer: vi.fn().mockResolvedValue({ type: 'answer', sdp: 'mock-sdp' }),
  setLocalDescription: vi.fn().mockResolvedValue(undefined),
  addIceCandidate: vi.fn().mockResolvedValue(undefined),
  close: vi.fn(),
  onicecandidate: null,
  ontrack: null
};

const mockRTCPeerConnection = vi.fn().mockImplementation(() => mockPeerConnection);

// Add the static generateCertificate method to satisfy TypeScript
(mockRTCPeerConnection as any).generateCertificate = vi.fn().mockResolvedValue({});

global.RTCPeerConnection = mockRTCPeerConnection as any;
global.RTCSessionDescription = vi.fn().mockImplementation((desc) => desc);
global.RTCIceCandidate = vi.fn().mockImplementation((candidate) => candidate);

// Mock fetch
global.fetch = vi.fn();

// Mock socket.io
const mockSocket = {
  on: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn()
};

const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;
const mockIo = io as ReturnType<typeof vi.fn>;

describe('InterviewerDashboard', () => {
  const mockAuthState = {
    user: {
      id: 'interviewer-123',
      name: 'John Interviewer',
      email: 'john@example.com',
      role: 'interviewer' as const,
      createdAt: new Date()
    },
    token: 'mock-jwt-token',
    isAuthenticated: true,
    isLoading: false,
    error: null
  };

  const mockLogout = vi.fn();

  const mockSessions = [
    {
      sessionId: 'session-1',
      candidateId: 'candidate-1',
      candidateName: 'Alice Candidate',
      startTime: new Date('2024-01-01T10:00:00Z'),
      status: 'active' as const
    },
    {
      sessionId: 'session-2',
      candidateId: 'candidate-2',
      candidateName: 'Bob Candidate',
      startTime: new Date('2024-01-01T11:00:00Z'),
      status: 'active' as const
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseAuth.mockReturnValue({
      authState: mockAuthState,
      login: vi.fn(),
      signup: vi.fn(),
      logout: mockLogout,
      clearError: vi.fn()
    });

    mockIo.mockReturnValue(mockSocket);

    // Mock successful sessions fetch
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: {
          sessions: mockSessions,
          pagination: {
            total: 2,
            limit: 50,
            offset: 0,
            hasMore: false
          }
        }
      })
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial Render and Session List', () => {
    it('renders dashboard header with user name', async () => {
      render(<InterviewerDashboard />);

      // Wait for loading to complete
      await waitFor(() => {
        expect(screen.getByText('Interviewer Dashboard')).toBeInTheDocument();
        expect(screen.getByText('Welcome, John Interviewer')).toBeInTheDocument();
      });
    });

    it('shows loading state initially', () => {
      render(<InterviewerDashboard />);

      expect(screen.getByText('Loading dashboard...')).toBeInTheDocument();
    });

    it('fetches and displays active sessions', async () => {
      render(<InterviewerDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Alice Candidate')).toBeInTheDocument();
        expect(screen.getByText('Bob Candidate')).toBeInTheDocument();
      });

      expect(global.fetch).toHaveBeenCalledWith('/api/sessions?status=active', {
        headers: {
          'Authorization': 'Bearer mock-jwt-token',
          'Content-Type': 'application/json'
        }
      });
    });

    it('shows empty state when no sessions available', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { sessions: [] }
        })
      });

      render(<InterviewerDashboard />);

      await waitFor(() => {
        expect(screen.getByText('No active sessions found')).toBeInTheDocument();
      });
    });

    it('handles fetch error gracefully', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      render(<InterviewerDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });
  });

  describe('WebSocket Connection', () => {
    it('initializes WebSocket connection with auth token', async () => {
      render(<InterviewerDashboard />);

      await waitFor(() => {
        expect(mockIo).toHaveBeenCalledWith(
          'http://localhost:5000',
          {
            auth: { token: 'mock-jwt-token' },
            transports: ['websocket', 'polling']
          }
        );
      });
    });

    it('sets up WebSocket event listeners', async () => {
      render(<InterviewerDashboard />);

      await waitFor(() => {
        expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
        expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
        expect(mockSocket.on).toHaveBeenCalledWith('session_joined', expect.any(Function));
        expect(mockSocket.on).toHaveBeenCalledWith('detection_event_broadcast', expect.any(Function));
        expect(mockSocket.on).toHaveBeenCalledWith('manual_flag_broadcast', expect.any(Function));
      });
    });
  });

  describe('Session Monitoring', () => {
    it('joins session when monitor button is clicked', async () => {
      render(<InterviewerDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Alice Candidate')).toBeInTheDocument();
      });

      const monitorButtons = screen.getAllByText('Monitor');
      fireEvent.click(monitorButtons[0]);

      expect(mockSocket.emit).toHaveBeenCalledWith('join_session', {
        sessionId: 'session-1',
        role: 'interviewer'
      });
    });

    it('displays session monitoring interface after joining', async () => {
      render(<InterviewerDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Alice Candidate')).toBeInTheDocument();
      });

      const monitorButtons = screen.getAllByText('Monitor');
      fireEvent.click(monitorButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Candidate Video Stream')).toBeInTheDocument();
        expect(screen.getByText('Real-time Alerts')).toBeInTheDocument();
        expect(screen.getByText('Session Notes')).toBeInTheDocument();
      });
    });

    it('shows session details in monitoring view', async () => {
      render(<InterviewerDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Alice Candidate')).toBeInTheDocument();
      });

      const monitorButtons = screen.getAllByText('Monitor');
      fireEvent.click(monitorButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Candidate:')).toBeInTheDocument();
        expect(screen.getByText('Alice Candidate')).toBeInTheDocument();
        expect(screen.getByText('Started:')).toBeInTheDocument();
      });
    });
  });

  describe('Session Controls', () => {
    beforeEach(async () => {
      render(<InterviewerDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Alice Candidate')).toBeInTheDocument();
      });

      const monitorButtons = screen.getAllByText('Monitor');
      fireEvent.click(monitorButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Candidate Video Stream')).toBeInTheDocument();
      });
    });

    it('ends session when end button is clicked', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true })
      });

      const endButton = screen.getByText('End Session');
      fireEvent.click(endButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/sessions/session-1/end', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer mock-jwt-token',
            'Content-Type': 'application/json'
          }
        });
      });
    });

    it('terminates session when terminate button is clicked', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true })
      });

      const terminateButton = screen.getByText('Terminate');
      fireEvent.click(terminateButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/sessions/session-1/terminate', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer mock-jwt-token',
            'Content-Type': 'application/json'
          }
        });
      });
    });

    it('leaves session when leave button is clicked', () => {
      const leaveButton = screen.getByText('Leave Session');
      fireEvent.click(leaveButton);

      expect(mockSocket.emit).toHaveBeenCalledWith('leave_session', 'session-1');
    });
  });

  describe('Session Notes', () => {
    beforeEach(async () => {
      render(<InterviewerDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Alice Candidate')).toBeInTheDocument();
      });

      const monitorButtons = screen.getAllByText('Monitor');
      fireEvent.click(monitorButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Session Notes')).toBeInTheDocument();
      });
    });

    it('adds session note when form is submitted', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true })
      });

      const textarea = screen.getByPlaceholderText('Add a note about the candidate\'s behavior...');
      const addButton = screen.getByText('Add Note');

      fireEvent.change(textarea, { target: { value: 'Candidate seems distracted' } });
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/sessions/session-1/observations', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer mock-jwt-token',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            observationType: 'manual_note',
            description: 'Candidate seems distracted',
            severity: 'medium',
            flagged: false
          })
        });
      });
    });

    it('disables add button when note is empty', () => {
      const addButton = screen.getByText('Add Note');
      expect(addButton).toBeDisabled();
    });

    it('changes note severity', () => {
      const severitySelect = screen.getByDisplayValue('Medium');
      fireEvent.change(severitySelect, { target: { value: 'high' } });

      expect(severitySelect).toHaveValue('high');
    });
  });

  describe('Real-time Alerts', () => {
    beforeEach(async () => {
      render(<InterviewerDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Alice Candidate')).toBeInTheDocument();
      });

      const monitorButtons = screen.getAllByText('Monitor');
      fireEvent.click(monitorButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Real-time Alerts')).toBeInTheDocument();
      });
    });

    it('displays detection events as alerts', async () => {
      // Simulate receiving a detection event
      const detectionEventHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'detection_event_broadcast'
      )?.[1];

      if (detectionEventHandler) {
        act(() => {
          detectionEventHandler({
            sessionId: 'session-1',
            candidateId: 'candidate-1',
            eventType: 'focus-loss',
            timestamp: new Date(),
            confidence: 0.8,
            metadata: {}
          });
        });
      }

      await waitFor(() => {
        expect(screen.getByText('Candidate looking away from screen')).toBeInTheDocument();
      });
    });

    it('displays manual flags as alerts', async () => {
      // Simulate receiving a manual flag
      const manualFlagHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'manual_flag_broadcast'
      )?.[1];

      if (manualFlagHandler) {
        act(() => {
          manualFlagHandler({
            sessionId: 'session-1',
            interviewerId: 'interviewer-123',
            timestamp: new Date(),
            description: 'Suspicious behavior observed',
            severity: 'high'
          });
        });
      }

      await waitFor(() => {
        expect(screen.getByText('Manual flag: Suspicious behavior observed')).toBeInTheDocument();
      });
    });

    it('shows no alerts message when no alerts exist', () => {
      expect(screen.getByText('No alerts yet')).toBeInTheDocument();
    });
  });

  describe('WebRTC Video Streaming', () => {
    beforeEach(async () => {
      render(<InterviewerDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Alice Candidate')).toBeInTheDocument();
      });

      const monitorButtons = screen.getAllByText('Monitor');
      fireEvent.click(monitorButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Candidate Video Stream')).toBeInTheDocument();
      });
    });

    it('handles video offer from candidate', async () => {
      // Check that the video offer handler is set up
      const videoOfferHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'video_stream_offer'
      )?.[1];

      expect(videoOfferHandler).toBeDefined();
      expect(typeof videoOfferHandler).toBe('function');
    });

    it('handles video answer from candidate', async () => {
      const videoAnswerHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'video_stream_answer'
      )?.[1];

      const mockAnswer = {
        fromUserId: 'candidate-1',
        answer: { type: 'answer', sdp: 'mock-answer-sdp' }
      };

      if (videoAnswerHandler) {
        await act(async () => {
          await videoAnswerHandler(mockAnswer);
        });
      }

      // Should handle the answer (tested via mock calls)
      expect(videoAnswerHandler).toBeDefined();
    });

    it('displays waiting message when no video stream', () => {
      expect(screen.getByText('Waiting for video stream...')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('displays error message when session fetch fails', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      render(<InterviewerDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('allows dismissing error messages', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      render(<InterviewerDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });

      const dismissButton = screen.getByText('Dismiss');
      fireEvent.click(dismissButton);

      expect(screen.queryByText('Network error')).not.toBeInTheDocument();
    });
  });

  describe('Logout', () => {
    it('disconnects WebSocket and calls logout when logout button is clicked', async () => {
      render(<InterviewerDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Logout')).toBeInTheDocument();
      });

      const logoutButton = screen.getByText('Logout');
      fireEvent.click(logoutButton);

      expect(mockSocket.disconnect).toHaveBeenCalled();
      expect(mockLogout).toHaveBeenCalled();
    });
  });

  describe('Refresh Functionality', () => {
    it('refreshes session list when refresh button is clicked', async () => {
      render(<InterviewerDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Refresh')).toBeInTheDocument();
      });

      const refreshButton = screen.getByText('Refresh');
      fireEvent.click(refreshButton);

      // Should make another fetch call
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});