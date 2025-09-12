import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { AlertManagementPanel } from '../AlertManagementPanel';
import type { Alert } from '../../../types';

// Mock Alert data
const mockAlerts: Alert[] = [
  {
    id: 'alert-1',
    type: 'focus-loss',
    message: 'Candidate looking away from screen',
    timestamp: new Date('2024-01-15T10:00:00Z'),
    severity: 'medium',
    confidence: 0.8
  },
  {
    id: 'alert-2',
    type: 'unauthorized-item',
    message: 'Unauthorized item detected: phone',
    timestamp: new Date('2024-01-15T10:02:00Z'),
    severity: 'high',
    confidence: 0.9
  },
  {
    id: 'alert-3',
    type: 'multiple-faces',
    message: 'Multiple faces detected',
    timestamp: new Date('2024-01-15T10:05:00Z'),
    severity: 'high',
    confidence: 0.95
  }
];

describe('AlertManagementPanel', () => {
  const mockProps = {
    alerts: mockAlerts,
    onAlertAcknowledge: vi.fn(),
    onManualFlag: vi.fn(),
    sessionId: 'test-session-123'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders the alert management panel with header', () => {
      render(<AlertManagementPanel {...mockProps} />);
      
      expect(screen.getByText('Alert Management')).toBeInTheDocument();
      expect(screen.getByText('3 new')).toBeInTheDocument();
    });

    it('shows correct tab counts', () => {
      render(<AlertManagementPanel {...mockProps} />);
      
      expect(screen.getByText('Live Alerts')).toBeInTheDocument();
      expect(screen.getByText('History')).toBeInTheDocument();
      expect(screen.getByText('Notes')).toBeInTheDocument();
      expect(screen.getByText('(3)')).toBeInTheDocument(); // History count
      expect(screen.getByText('(0)')).toBeInTheDocument(); // Notes count
    });

    it('defaults to live alerts view', () => {
      render(<AlertManagementPanel {...mockProps} />);
      
      // Should show live alerts by default
      expect(screen.getByText('Candidate looking away from screen')).toBeInTheDocument();
      expect(screen.getByText('Unauthorized item detected: phone')).toBeInTheDocument();
      expect(screen.getByText('Multiple faces detected')).toBeInTheDocument();
    });
  });

  describe('Tab Navigation', () => {
    it('switches to history view when history tab is clicked', async () => {
      render(<AlertManagementPanel {...mockProps} />);
      
      const historyTab = screen.getByText('History');
      fireEvent.click(historyTab);
      
      // Should now show the AlertHistory component
      await waitFor(() => {
        expect(screen.getByText('Alert History')).toBeInTheDocument();
      });
    });

    it('switches to notes view when notes tab is clicked', async () => {
      render(<AlertManagementPanel {...mockProps} />);
      
      const notesTab = screen.getByText('Notes');
      fireEvent.click(notesTab);
      
      // Should show empty notes state
      await waitFor(() => {
        expect(screen.getByText('No notes yet')).toBeInTheDocument();
      });
    });

    it('switches back to live alerts view', async () => {
      render(<AlertManagementPanel {...mockProps} />);
      
      // Go to history first
      fireEvent.click(screen.getByText('History'));
      await waitFor(() => {
        expect(screen.getByText('Alert History')).toBeInTheDocument();
      });
      
      // Then back to live alerts
      fireEvent.click(screen.getByText('Live Alerts'));
      await waitFor(() => {
        expect(screen.getByText('Candidate looking away from screen')).toBeInTheDocument();
      });
    });
  });

  describe('Live Alerts View', () => {
    it('displays alerts with correct information', () => {
      render(<AlertManagementPanel {...mockProps} />);
      
      expect(screen.getByText('Candidate looking away from screen')).toBeInTheDocument();
      expect(screen.getByText('Unauthorized item detected: phone')).toBeInTheDocument();
      expect(screen.getByText('Multiple faces detected')).toBeInTheDocument();
      
      // Check severity badges
      expect(screen.getAllByText('HIGH')).toHaveLength(2);
      expect(screen.getByText('MEDIUM')).toBeInTheDocument();
    });

    it('shows acknowledge buttons for alerts', () => {
      render(<AlertManagementPanel {...mockProps} />);
      
      const ackButtons = screen.getAllByText('Ack');
      expect(ackButtons).toHaveLength(3);
    });

    it('calls onAlertAcknowledge when acknowledge button is clicked', async () => {
      render(<AlertManagementPanel {...mockProps} />);
      
      const ackButtons = screen.getAllByText('Ack');
      fireEvent.click(ackButtons[0]);
      
      expect(mockProps.onAlertAcknowledge).toHaveBeenCalledWith('alert-1');
    });

    it('shows empty state when no alerts', () => {
      render(<AlertManagementPanel {...mockProps} alerts={[]} />);
      
      expect(screen.getByText('No new alerts')).toBeInTheDocument();
    });

    it('only shows unacknowledged alerts in live view', () => {
      const alertsWithAcknowledged = [
        ...mockAlerts,
        {
          id: 'alert-4',
          type: 'focus-loss',
          message: 'Acknowledged alert',
          timestamp: new Date('2024-01-15T10:07:00Z'),
          severity: 'low' as const,
          confidence: 0.7,
          acknowledged: true,
          acknowledgedAt: new Date('2024-01-15T10:08:00Z'),
          acknowledgedBy: 'Test User'
        }
      ];

      render(<AlertManagementPanel {...mockProps} alerts={alertsWithAcknowledged} />);
      
      // Should only show the 3 unacknowledged alerts
      expect(screen.getByText('Candidate looking away from screen')).toBeInTheDocument();
      expect(screen.getByText('Unauthorized item detected: phone')).toBeInTheDocument();
      expect(screen.getByText('Multiple faces detected')).toBeInTheDocument();
      
      // Should not show the acknowledged alert
      expect(screen.queryByText('Acknowledged alert')).not.toBeInTheDocument();
      
      // Check that header shows correct count
      expect(screen.getByText('3 unacknowledged alerts')).toBeInTheDocument();
    });
  });

  describe('Manual Flag Functionality', () => {
    it('shows manual flag form when Add Flag button is clicked', async () => {
      render(<AlertManagementPanel {...mockProps} />);
      
      fireEvent.click(screen.getByTestId('toggle-manual-flag'));
      
      expect(screen.getByPlaceholderText('Describe the suspicious behavior or concern...')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Medium Priority')).toBeInTheDocument();
    });

    it('allows entering flag description and changing severity', async () => {
      render(<AlertManagementPanel {...mockProps} />);
      
      fireEvent.click(screen.getByTestId('toggle-manual-flag'));
      
      const textarea = screen.getByPlaceholderText('Describe the suspicious behavior or concern...');
      const severitySelect = screen.getByDisplayValue('Medium Priority');
      
      fireEvent.change(textarea, { target: { value: 'Suspicious behavior observed' } });
      fireEvent.change(severitySelect, { target: { value: 'high' } });
      
      expect(textarea).toHaveValue('Suspicious behavior observed');
      expect(severitySelect).toHaveValue('high');
    });

    it('calls onManualFlag when flag is submitted', async () => {
      render(<AlertManagementPanel {...mockProps} />);
      
      fireEvent.click(screen.getByTestId('toggle-manual-flag'));
      
      const textarea = screen.getByPlaceholderText('Describe the suspicious behavior or concern...');
      fireEvent.change(textarea, { target: { value: 'Test flag' } });
      
      fireEvent.click(screen.getByTestId('submit-manual-flag'));
      
      await waitFor(() => {
        expect(mockProps.onManualFlag).toHaveBeenCalledWith('Test flag', 'medium');
      });
    });

    it('adds manual flag to notes after submission', async () => {
      render(<AlertManagementPanel {...mockProps} />);
      
      // Add a flag
      fireEvent.click(screen.getByTestId('toggle-manual-flag'));
      const textarea = screen.getByPlaceholderText('Describe the suspicious behavior or concern...');
      fireEvent.change(textarea, { target: { value: 'Test note' } });
      
      fireEvent.click(screen.getByTestId('submit-manual-flag'));
      
      // Switch to notes view
      fireEvent.click(screen.getByText('Notes'));
      
      await waitFor(() => {
        expect(screen.getByText('Test note')).toBeInTheDocument();
        expect(screen.getByText('(1)')).toBeInTheDocument(); // Updated count
      });
    });

    it('disables add button when description is empty', () => {
      render(<AlertManagementPanel {...mockProps} />);
      
      fireEvent.click(screen.getByTestId('toggle-manual-flag'));
      
      const addButton = screen.getByTestId('submit-manual-flag');
      expect(addButton).toBeDisabled();
    });

    it('hides flag form when cancel is clicked', () => {
      render(<AlertManagementPanel {...mockProps} />);
      
      fireEvent.click(screen.getByTestId('toggle-manual-flag'));
      expect(screen.getByPlaceholderText('Describe the suspicious behavior or concern...')).toBeInTheDocument();
      
      fireEvent.click(screen.getByText('Cancel'));
      expect(screen.queryByPlaceholderText('Describe the suspicious behavior or concern...')).not.toBeInTheDocument();
    });
  });

  describe('Footer Information', () => {
    it('shows correct information in live alerts view', () => {
      render(<AlertManagementPanel {...mockProps} />);
      
      expect(screen.getByText('3 unacknowledged alerts')).toBeInTheDocument();
      expect(screen.getByText('Session: test-session-123')).toBeInTheDocument();
    });

    it('shows correct information in history view', async () => {
      render(<AlertManagementPanel {...mockProps} />);
      
      fireEvent.click(screen.getByText('History'));
      
      await waitFor(() => {
        expect(screen.getByText('3 total events')).toBeInTheDocument();
      });
    });

    it('shows all alerts including acknowledged ones in history view', async () => {
      const alertsWithAcknowledged = [
        ...mockAlerts,
        {
          id: 'alert-4',
          type: 'focus-loss',
          message: 'Acknowledged alert',
          timestamp: new Date('2024-01-15T10:07:00Z'),
          severity: 'low' as const,
          confidence: 0.7,
          acknowledged: true,
          acknowledgedAt: new Date('2024-01-15T10:08:00Z'),
          acknowledgedBy: 'Test User'
        }
      ];

      render(<AlertManagementPanel {...mockProps} alerts={alertsWithAcknowledged} />);
      
      // Switch to history view
      fireEvent.click(screen.getByText('History'));
      
      await waitFor(() => {
        // History should show all 4 alerts including the acknowledged one
        expect(screen.getByText('4 total events')).toBeInTheDocument();
      });
    });

    it('shows correct information in notes view', async () => {
      render(<AlertManagementPanel {...mockProps} />);
      
      fireEvent.click(screen.getByText('Notes'));
      
      await waitFor(() => {
        expect(screen.getByText('0 session notes')).toBeInTheDocument();
      });
    });
  });

  describe('Props Handling', () => {
    it('handles missing sessionId gracefully', () => {
      const propsWithoutSession = { ...mockProps, sessionId: undefined };
      render(<AlertManagementPanel {...propsWithoutSession} />);
      
      expect(screen.getByText('Session: N/A')).toBeInTheDocument();
    });

    it('handles missing onAlertAcknowledge callback', () => {
      const propsWithoutAck = { ...mockProps, onAlertAcknowledge: undefined };
      render(<AlertManagementPanel {...propsWithoutAck} />);
      
      // Should not show acknowledge buttons
      expect(screen.queryByText('Ack')).not.toBeInTheDocument();
    });

    it('handles missing onManualFlag callback', () => {
      const propsWithoutFlag = { ...mockProps, onManualFlag: undefined };
      render(<AlertManagementPanel {...propsWithoutFlag} />);
      
      // Should still show the form but not call the callback
      fireEvent.click(screen.getByTestId('toggle-manual-flag'));
      expect(screen.getByPlaceholderText('Describe the suspicious behavior or concern...')).toBeInTheDocument();
    });
  });
});