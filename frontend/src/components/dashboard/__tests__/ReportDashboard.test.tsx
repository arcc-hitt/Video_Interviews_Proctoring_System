import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest';
import { ReportDashboard } from '../ReportDashboard';
import { AuthContext } from '../../../contexts/AuthContext';
import type { InterviewSession, Alert, AuthContextType } from '../../../types';

// Mock fetch globally
global.fetch = vi.fn();

// Mock URL.createObjectURL and revokeObjectURL
global.URL.createObjectURL = vi.fn(() => 'mock-url');
global.URL.revokeObjectURL = vi.fn();

// Mock document.createElement and appendChild/removeChild
const mockAnchorElement = {
  href: '',
  download: '',
  click: vi.fn(),
};

const originalCreateElement = document.createElement;
document.createElement = vi.fn((tagName) => {
  if (tagName === 'a') {
    return mockAnchorElement as any;
  }
  return originalCreateElement.call(document, tagName);
});

const mockAppendChild = vi.fn();
const mockRemoveChild = vi.fn();
document.body.appendChild = mockAppendChild;
document.body.removeChild = mockRemoveChild;

// Mock auth context
const mockAuthContext: AuthContextType = {
  authState: {
    user: { id: 'interviewer-1', email: 'interviewer@test.com', name: 'Test Interviewer', role: 'interviewer', createdAt: new Date() },
    token: 'mock-token',
    isAuthenticated: true,
    isLoading: false,
    error: null
  },
  login: vi.fn(),
  signup: vi.fn(),
  logout: vi.fn(),
  clearError: vi.fn()
};

// Mock session data
const mockSession: InterviewSession = {
  sessionId: 'session-123',
  candidateId: 'candidate-456',
  candidateName: 'John Doe',
  startTime: new Date('2024-01-01T10:00:00Z'),
  endTime: undefined,
  status: 'active'
};

// Mock alerts data
const mockAlerts: Alert[] = [
  {
    type: 'focus-loss',
    message: 'Candidate looked away from screen',
    timestamp: new Date('2024-01-01T10:05:00Z'),
    severity: 'medium'
  },
  {
    type: 'unauthorized-item',
    message: 'Phone detected in video frame',
    timestamp: new Date('2024-01-01T10:10:00Z'),
    severity: 'high'
  }
];

const renderReportDashboard = (props = {}) => {
  const defaultProps = {
    sessionId: mockSession.sessionId,
    session: mockSession,
    alerts: mockAlerts,
    onClose: vi.fn(),
    ...props
  };

  return render(
    <AuthContext.Provider value={mockAuthContext}>
      <ReportDashboard {...defaultProps} />
    </AuthContext.Provider>
  );
};

describe('ReportDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (fetch as any).mockClear();
    
    // Setup DOM container
    document.body.innerHTML = '<div id="root"></div>';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('Initial Loading and Data Fetching', () => {
    it('shows loading state initially', () => {
      // Mock pending fetch requests
      (fetch as any).mockImplementation(() => new Promise(() => {}));

      renderReportDashboard();

      expect(screen.getByText('Loading report dashboard...')).toBeInTheDocument();
    });
  });

  describe('Navigation and UI', () => {
    it('calls onClose when close button is clicked', async () => {
      (fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, data: [] })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, data: [] })
        });

      const mockOnClose = vi.fn();
      
      renderReportDashboard({ onClose: mockOnClose });

      await waitFor(() => {
        expect(screen.queryByText('Loading report dashboard...')).not.toBeInTheDocument();
      });

      const closeButton = screen.getByRole('button', { name: /close/i });
      fireEvent.click(closeButton);

      expect(mockOnClose).toHaveBeenCalled();
    });
  });
});