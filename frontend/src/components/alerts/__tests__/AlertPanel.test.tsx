import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { AlertPanel } from '../AlertPanel';
import type { Alert } from '../../../types';

// Mock Lucide React icons
vi.mock('lucide-react', () => ({
  AlertTriangle: ({ className }: { className?: string }) => <div data-testid="alert-triangle-icon" className={className} />,
  Eye: ({ className }: { className?: string }) => <div data-testid="eye-icon" className={className} />,
  Users: ({ className }: { className?: string }) => <div data-testid="users-icon" className={className} />,
  Phone: ({ className }: { className?: string }) => <div data-testid="phone-icon" className={className} />,
  Clock: ({ className }: { className?: string }) => <div data-testid="clock-icon" className={className} />,
  CheckCircle: ({ className }: { className?: string }) => <div data-testid="check-circle-icon" className={className} />,
  Flag: ({ className }: { className?: string }) => <div data-testid="flag-icon" className={className} />,
  X: ({ className }: { className?: string }) => <div data-testid="x-icon" className={className} />
}));

describe('AlertPanel', () => {
  const mockAlerts: Alert[] = [
    {
      type: 'focus-loss',
      message: 'Candidate looking away from screen',
      timestamp: new Date('2024-01-15T10:30:00Z'),
      severity: 'low'
    },
    {
      type: 'unauthorized-item',
      message: 'Unauthorized item detected: phone',
      timestamp: new Date('2024-01-15T10:32:00Z'),
      severity: 'high'
    },
    {
      type: 'multiple-faces',
      message: 'Multiple faces detected',
      timestamp: new Date('2024-01-15T10:35:00Z'),
      severity: 'high'
    }
  ];

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
    it('renders the alert panel with header', () => {
      render(<AlertPanel {...mockProps} />);
      
      expect(screen.getByText('Real-time Alerts')).toBeInTheDocument();
      expect(screen.getByTestId('alert-triangle-icon')).toBeInTheDocument();
    });

    it('displays alert count badge when there are unacknowledged alerts', () => {
      render(<AlertPanel {...mockProps} />);
      
      expect(screen.getByText('3 new')).toBeInTheDocument();
    });

    it('renders all alerts with correct information', () => {
      render(<AlertPanel {...mockProps} />);
      
      expect(screen.getByText('Candidate looking away from screen')).toBeInTheDocument();
      expect(screen.getByText('Unauthorized item detected: phone')).toBeInTheDocument();
      expect(screen.getByText('Multiple faces detected')).toBeInTheDocument();
    });

    it('displays correct severity badges', () => {
      render(<AlertPanel {...mockProps} />);
      
      expect(screen.getByText('LOW')).toBeInTheDocument();
      expect(screen.getAllByText('HIGH')).toHaveLength(2);
    });

    it('shows correct icons for different alert types', () => {
      render(<AlertPanel {...mockProps} />);
      
      expect(screen.getByTestId('eye-icon')).toBeInTheDocument(); // focus-loss
      expect(screen.getByTestId('phone-icon')).toBeInTheDocument(); // unauthorized-item
      expect(screen.getByTestId('users-icon')).toBeInTheDocument(); // multiple-faces
    });

    it('displays timestamps in correct format', () => {
      render(<AlertPanel {...mockProps} />);
      
      // Check that all three timestamps are present with correct format (HH:MM:SS)
      const timestamps = screen.getAllByText(/\d{2}:\d{2}:\d{2}/);
      expect(timestamps).toHaveLength(3);
      
      // Verify each timestamp has the correct format
      timestamps.forEach(timestamp => {
        expect(timestamp.textContent).toMatch(/^\d{2}:\d{2}:\d{2}$/);
      });
    });
  });

  describe('Alert Filtering', () => {
    it('filters alerts by severity', async () => {
      render(<AlertPanel {...mockProps} />);
      
      // Click on "High" filter
      fireEvent.click(screen.getByText('High (2)'));
      
      // Should only show high severity alerts
      expect(screen.getByText('Unauthorized item detected: phone')).toBeInTheDocument();
      expect(screen.getByText('Multiple faces detected')).toBeInTheDocument();
      expect(screen.queryByText('Candidate looking away from screen')).not.toBeInTheDocument();
    });

    it('shows unacknowledged alerts filter', async () => {
      render(<AlertPanel {...mockProps} />);
      
      // All alerts should be unacknowledged initially
      fireEvent.click(screen.getByText('New (3)'));
      
      expect(screen.getByText('Candidate looking away from screen')).toBeInTheDocument();
      expect(screen.getByText('Unauthorized item detected: phone')).toBeInTheDocument();
      expect(screen.getByText('Multiple faces detected')).toBeInTheDocument();
    });

    it('updates filter counts correctly', () => {
      render(<AlertPanel {...mockProps} />);
      
      expect(screen.getByText('All (3)')).toBeInTheDocument();
      expect(screen.getByText('New (3)')).toBeInTheDocument();
      expect(screen.getByText('High (2)')).toBeInTheDocument();
      expect(screen.getByText('Medium')).toBeInTheDocument(); // No count shown for 0
      expect(screen.getByText('Low (1)')).toBeInTheDocument();
    });
  });

  describe('Alert Acknowledgment', () => {
    it('shows acknowledge button for unacknowledged alerts', () => {
      render(<AlertPanel {...mockProps} />);
      
      const acknowledgeButtons = screen.getAllByText('Acknowledge');
      expect(acknowledgeButtons).toHaveLength(3); // One for each alert
    });

    it('calls onAlertAcknowledge when acknowledge button is clicked', async () => {
      render(<AlertPanel {...mockProps} />);
      
      const acknowledgeButtons = screen.getAllByText('Acknowledge');
      fireEvent.click(acknowledgeButtons[0]);
      
      await waitFor(() => {
        expect(mockProps.onAlertAcknowledge).toHaveBeenCalledTimes(1);
        expect(mockProps.onAlertAcknowledge).toHaveBeenCalledWith(expect.stringMatching(/^alert-/));
      });
    });

    it('marks alert as acknowledged and hides acknowledge button', async () => {
      render(<AlertPanel {...mockProps} />);
      
      const acknowledgeButtons = screen.getAllByText('Acknowledge');
      fireEvent.click(acknowledgeButtons[0]);
      
      await waitFor(() => {
        expect(screen.getByText('Acknowledged')).toBeInTheDocument();
        expect(screen.getAllByText('Acknowledge')).toHaveLength(2); // One less button
      });
    });

    it('shows acknowledged timestamp', async () => {
      render(<AlertPanel {...mockProps} />);
      
      const acknowledgeButtons = screen.getAllByText('Acknowledge');
      fireEvent.click(acknowledgeButtons[0]);
      
      await waitFor(() => {
        expect(screen.getByText(/Acknowledged at \d{2}:\d{2}:\d{2}/)).toBeInTheDocument();
      });
    });
  });

  describe('Manual Flag Functionality', () => {
    it('shows manual flag form when flag button is clicked', async () => {
      render(<AlertPanel {...mockProps} />);
      
      fireEvent.click(screen.getByText('Flag'));
      
      expect(screen.getByPlaceholderText('Describe the suspicious behavior or concern...')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Medium Priority')).toBeInTheDocument();
    });

    it('allows entering manual flag description and severity', async () => {
      render(<AlertPanel {...mockProps} />);
      
      fireEvent.click(screen.getByText('Flag'));
      
      const textarea = screen.getByPlaceholderText('Describe the suspicious behavior or concern...');
      const severitySelect = screen.getByDisplayValue('Medium Priority');
      
      fireEvent.change(textarea, { target: { value: 'Suspicious behavior observed' } });
      fireEvent.change(severitySelect, { target: { value: 'high' } });
      
      expect(textarea).toHaveValue('Suspicious behavior observed');
      expect(severitySelect).toHaveValue('high');
    });

    it('calls onManualFlag when flag is submitted', async () => {
      render(<AlertPanel {...mockProps} />);
      
      fireEvent.click(screen.getByText('Flag'));
      
      const textarea = screen.getByPlaceholderText('Describe the suspicious behavior or concern...');
      fireEvent.change(textarea, { target: { value: 'Test flag' } });
      
      fireEvent.click(screen.getByText('Add Flag'));
      
      await waitFor(() => {
        expect(mockProps.onManualFlag).toHaveBeenCalledWith('Test flag', 'medium');
      });
    });

    it('adds manual flag as alert to the list', async () => {
      render(<AlertPanel {...mockProps} />);
      
      fireEvent.click(screen.getByText('Flag'));
      
      const textarea = screen.getByPlaceholderText('Describe the suspicious behavior or concern...');
      fireEvent.change(textarea, { target: { value: 'Manual test flag' } });
      
      fireEvent.click(screen.getByText('Add Flag'));
      
      await waitFor(() => {
        expect(screen.getByText('Manual Flag: Manual test flag')).toBeInTheDocument();
      });
    });

    it('disables add flag button when description is empty', () => {
      render(<AlertPanel {...mockProps} />);
      
      fireEvent.click(screen.getByText('Flag'));
      
      const addButton = screen.getByText('Add Flag');
      expect(addButton).toBeDisabled();
    });

    it('hides manual flag form when cancel is clicked', async () => {
      render(<AlertPanel {...mockProps} />);
      
      fireEvent.click(screen.getByText('Flag'));
      expect(screen.getByPlaceholderText('Describe the suspicious behavior or concern...')).toBeInTheDocument();
      
      fireEvent.click(screen.getByText('Cancel'));
      expect(screen.queryByPlaceholderText('Describe the suspicious behavior or concern...')).not.toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('shows empty state when no alerts', () => {
      render(<AlertPanel {...mockProps} alerts={[]} />);
      
      expect(screen.getByText('No alerts yet')).toBeInTheDocument();
    });

    it('shows filtered empty state', async () => {
      render(<AlertPanel {...mockProps} />);
      
      // Filter by medium severity (which has no alerts)
      fireEvent.click(screen.getByText('Medium'));
      
      expect(screen.getByText('No medium alerts')).toBeInTheDocument();
    });
  });

  describe('Footer Summary', () => {
    it('shows total alert count', () => {
      render(<AlertPanel {...mockProps} />);
      
      expect(screen.getByText('Total: 3 alerts')).toBeInTheDocument();
    });

    it('shows unacknowledged count', () => {
      render(<AlertPanel {...mockProps} />);
      
      expect(screen.getByText('3 require attention')).toBeInTheDocument();
    });

    it('shows all acknowledged message when no unacknowledged alerts', async () => {
      render(<AlertPanel {...mockProps} />);
      
      // Acknowledge all alerts
      const acknowledgeButtons = screen.getAllByText('Acknowledge');
      acknowledgeButtons.forEach(button => fireEvent.click(button));
      
      await waitFor(() => {
        expect(screen.getByText('All alerts acknowledged')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels and roles', () => {
      render(<AlertPanel {...mockProps} />);
      
      // Check that buttons have proper focus states
      const flagButton = screen.getByText('Flag');
      expect(flagButton).toHaveClass('focus:outline-none', 'focus:ring-2');
      
      const acknowledgeButtons = screen.getAllByText('Acknowledge');
      acknowledgeButtons.forEach(button => {
        expect(button).toHaveClass('focus:outline-none', 'focus:ring-2');
      });
    });

    it('supports keyboard navigation', () => {
      render(<AlertPanel {...mockProps} />);
      
      const flagButton = screen.getByText('Flag');
      flagButton.focus();
      expect(flagButton).toHaveFocus();
    });
  });

  describe('Props Handling', () => {
    it('handles missing optional props gracefully', () => {
      const minimalProps = { alerts: mockAlerts };
      
      expect(() => render(<AlertPanel {...minimalProps} />)).not.toThrow();
    });

    it('applies custom className', () => {
      const { container } = render(<AlertPanel {...mockProps} className="custom-class" />);
      
      expect(container.firstChild).toHaveClass('custom-class');
    });

    it('handles empty sessionId', () => {
      const propsWithoutSession = { ...mockProps, sessionId: undefined };
      
      expect(() => render(<AlertPanel {...propsWithoutSession} />)).not.toThrow();
    });
  });
});