import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { AlertHistory } from '../AlertHistory';
import type { Alert } from '../../../types';

// Mock Lucide React icons
vi.mock('lucide-react', () => ({
  Calendar: ({ className }: { className?: string }) => <div data-testid="calendar-icon" className={className} />,
  Filter: ({ className }: { className?: string }) => <div data-testid="filter-icon" className={className} />,
  Download: ({ className }: { className?: string }) => <div data-testid="download-icon" className={className} />,
  Search: ({ className }: { className?: string }) => <div data-testid="search-icon" className={className} />,
  Clock: ({ className }: { className?: string }) => <div data-testid="clock-icon" className={className} />,
  AlertTriangle: ({ className }: { className?: string }) => <div data-testid="alert-triangle-icon" className={className} />
}));

// Mock URL.createObjectURL and related APIs
global.URL.createObjectURL = vi.fn(() => 'mock-url');
global.URL.revokeObjectURL = vi.fn();

// Mock document.createElement for download functionality
const mockAnchorElement = {
  href: '',
  download: '',
  click: vi.fn()
};

const originalCreateElement = document.createElement;
vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
  if (tagName === 'a') {
    return mockAnchorElement as any;
  }
  return originalCreateElement.call(document, tagName);
});

describe('AlertHistory', () => {
  const mockAlerts: Alert[] = [
    {
      type: 'focus-loss',
      message: 'Candidate looking away from screen',
      timestamp: new Date('2024-01-15T10:30:00Z'),
      severity: 'low'
    },
    {
      type: 'focus-loss',
      message: 'Candidate looking away from screen',
      timestamp: new Date('2024-01-15T10:31:00Z'),
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
    sessionId: 'test-session-123',
    alerts: mockAlerts,
    onExport: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders the alert history with header', () => {
      render(<AlertHistory {...mockProps} />);
      
      expect(screen.getByText('Alert History')).toBeInTheDocument();
      expect(screen.getByTestId('clock-icon')).toBeInTheDocument();
    });

    it('displays entry count in header', () => {
      render(<AlertHistory {...mockProps} />);
      
      // Should show aggregated entries (focus-loss alerts should be grouped)
      expect(screen.getByText(/\(\d+ of \d+ entries\)/)).toBeInTheDocument();
    });

    it('renders export buttons', () => {
      render(<AlertHistory {...mockProps} />);
      
      expect(screen.getByText('CSV')).toBeInTheDocument();
      expect(screen.getByText('JSON')).toBeInTheDocument();
      expect(screen.getAllByTestId('download-icon')).toHaveLength(2);
    });

    it('renders filter controls', () => {
      render(<AlertHistory {...mockProps} />);
      
      expect(screen.getByPlaceholderText('Search alerts...')).toBeInTheDocument();
      expect(screen.getByDisplayValue('All Time')).toBeInTheDocument();
      expect(screen.getByDisplayValue('All Types')).toBeInTheDocument();
      expect(screen.getByDisplayValue('All Severities')).toBeInTheDocument();
    });
  });

  describe('Alert Aggregation', () => {
    it('aggregates similar alerts into single entries', () => {
      render(<AlertHistory {...mockProps} />);
      
      // Should show "2x" badge for the aggregated focus-loss alerts
      expect(screen.getByText('2x')).toBeInTheDocument();
    });

    it('shows correct event counts for aggregated entries', () => {
      render(<AlertHistory {...mockProps} />);
      
      // Focus loss should appear twice, so should have 2x badge
      expect(screen.getByText('2x')).toBeInTheDocument();
    });

    it('displays duration for aggregated entries', () => {
      render(<AlertHistory {...mockProps} />);
      
      // Should show duration between first and last occurrence
      expect(screen.getByText(/Duration: \d+[ms]/)).toBeInTheDocument();
    });
  });

  describe('Filtering', () => {
    it('filters alerts by search term', async () => {
      render(<AlertHistory {...mockProps} />);
      
      const searchInput = screen.getByPlaceholderText('Search alerts...');
      fireEvent.change(searchInput, { target: { value: 'phone' } });
      
      await waitFor(() => {
        expect(screen.getByText('Unauthorized item detected: phone')).toBeInTheDocument();
        expect(screen.queryByText('Candidate looking away from screen')).not.toBeInTheDocument();
      });
    });

    it('filters alerts by type', async () => {
      render(<AlertHistory {...mockProps} />);
      
      const typeSelect = screen.getByDisplayValue('All Types');
      fireEvent.change(typeSelect, { target: { value: 'unauthorized-item' } });
      
      await waitFor(() => {
        expect(screen.getByText('Unauthorized item detected: phone')).toBeInTheDocument();
        expect(screen.queryByText('Candidate looking away from screen')).not.toBeInTheDocument();
      });
    });

    it('filters alerts by severity', async () => {
      render(<AlertHistory {...mockProps} />);
      
      const severitySelect = screen.getByDisplayValue('All Severities');
      fireEvent.change(severitySelect, { target: { value: 'high' } });
      
      await waitFor(() => {
        expect(screen.getByText('Unauthorized item detected: phone')).toBeInTheDocument();
        expect(screen.getByText('Multiple faces detected')).toBeInTheDocument();
        expect(screen.queryByText('Candidate looking away from screen')).not.toBeInTheDocument();
      });
    });

    it('filters alerts by date range', async () => {
      // Create alerts with different timestamps
      const recentAlerts = [
        {
          type: 'focus-loss' as const,
          message: 'Recent alert',
          timestamp: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
          severity: 'low' as const
        },
        {
          type: 'unauthorized-item' as const,
          message: 'Old alert',
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
          severity: 'high' as const
        }
      ];

      render(<AlertHistory {...mockProps} alerts={recentAlerts} />);
      
      const dateSelect = screen.getByDisplayValue('All Time');
      fireEvent.change(dateSelect, { target: { value: 'last-30min' } });
      
      await waitFor(() => {
        expect(screen.getByText('Recent alert')).toBeInTheDocument();
        expect(screen.queryByText('Old alert')).not.toBeInTheDocument();
      });
    });
  });

  describe('Sorting', () => {
    it('sorts alerts by timestamp by default', () => {
      render(<AlertHistory {...mockProps} />);
      
      const sortSelect = screen.getByDisplayValue('Time');
      expect(sortSelect).toBeInTheDocument();
    });

    it('changes sort order when sort button is clicked', async () => {
      render(<AlertHistory {...mockProps} />);
      
      const sortButton = screen.getByText('↓'); // Default descending
      fireEvent.click(sortButton);
      
      await waitFor(() => {
        expect(screen.getByText('↑')).toBeInTheDocument(); // Now ascending
      });
    });

    it('sorts by severity', async () => {
      render(<AlertHistory {...mockProps} />);
      
      const sortSelect = screen.getByDisplayValue('Time');
      fireEvent.change(sortSelect, { target: { value: 'severity' } });
      
      // Should reorder alerts by severity
      await waitFor(() => {
        expect(sortSelect).toHaveValue('severity');
      });
    });

    it('sorts by type', async () => {
      render(<AlertHistory {...mockProps} />);
      
      const sortSelect = screen.getByDisplayValue('Time');
      fireEvent.change(sortSelect, { target: { value: 'type' } });
      
      await waitFor(() => {
        expect(sortSelect).toHaveValue('type');
      });
    });
  });

  describe('Export Functionality', () => {
    it('calls onExport when CSV button is clicked', async () => {
      render(<AlertHistory {...mockProps} />);
      
      const csvButton = screen.getByText('CSV');
      fireEvent.click(csvButton);
      
      expect(mockProps.onExport).toHaveBeenCalledWith('csv');
    });

    it('calls onExport when JSON button is clicked', async () => {
      render(<AlertHistory {...mockProps} />);
      
      const jsonButton = screen.getByText('JSON');
      fireEvent.click(jsonButton);
      
      expect(mockProps.onExport).toHaveBeenCalledWith('json');
    });

    it('provides default CSV export when no onExport prop', async () => {
      const propsWithoutExport = { ...mockProps, onExport: undefined };
      render(<AlertHistory {...propsWithoutExport} />);
      
      const csvButton = screen.getByText('CSV');
      fireEvent.click(csvButton);
      
      // Should trigger download
      expect(mockAnchorElement.click).toHaveBeenCalled();
      expect(mockAnchorElement.download).toMatch(/alert-history-.*\.csv$/);
    });

    it('provides default JSON export when no onExport prop', async () => {
      const propsWithoutExport = { ...mockProps, onExport: undefined };
      render(<AlertHistory {...propsWithoutExport} />);
      
      const jsonButton = screen.getByText('JSON');
      fireEvent.click(jsonButton);
      
      // Should trigger download
      expect(mockAnchorElement.click).toHaveBeenCalled();
      expect(mockAnchorElement.download).toMatch(/alert-history-.*\.json$/);
    });
  });

  describe('Alert Display', () => {
    it('displays alert type icons and labels', () => {
      render(<AlertHistory {...mockProps} />);
      
      expect(screen.getByText('Focus Loss')).toBeInTheDocument();
      expect(screen.getByText('Unauthorized Item')).toBeInTheDocument();
      expect(screen.getByText('Multiple Faces')).toBeInTheDocument();
    });

    it('displays severity badges with correct styling', () => {
      render(<AlertHistory {...mockProps} />);
      
      expect(screen.getByText('LOW')).toBeInTheDocument();
      expect(screen.getAllByText('HIGH')).toHaveLength(2);
    });

    it('formats timestamps correctly', () => {
      render(<AlertHistory {...mockProps} />);
      
      // Should display formatted timestamps
      expect(screen.getByText(/Jan \d+, \d{2}:\d{2}:\d{2}/)).toBeInTheDocument();
    });

    it('shows first and last occurrence for aggregated entries', () => {
      render(<AlertHistory {...mockProps} />);
      
      // Should show both first and last timestamps for aggregated entries
      expect(screen.getByText(/First:/)).toBeInTheDocument();
      expect(screen.getByText(/Last:/)).toBeInTheDocument();
    });
  });

  describe('Empty States', () => {
    it('shows empty state when no alerts', () => {
      render(<AlertHistory {...mockProps} alerts={[]} />);
      
      expect(screen.getByText('No alerts match your filters')).toBeInTheDocument();
      expect(screen.getByTestId('alert-triangle-icon')).toBeInTheDocument();
    });

    it('shows filtered empty state', async () => {
      render(<AlertHistory {...mockProps} />);
      
      const searchInput = screen.getByPlaceholderText('Search alerts...');
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } });
      
      await waitFor(() => {
        expect(screen.getByText('No alerts match your filters')).toBeInTheDocument();
      });
    });
  });

  describe('Footer Summary', () => {
    it('displays entry count summary', () => {
      render(<AlertHistory {...mockProps} />);
      
      expect(screen.getByText(/Showing \d+ of \d+ alert entries/)).toBeInTheDocument();
    });

    it('displays total event count', () => {
      render(<AlertHistory {...mockProps} />);
      
      expect(screen.getByText(/Total events: \d+/)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper focus management for form controls', () => {
      render(<AlertHistory {...mockProps} />);
      
      const searchInput = screen.getByPlaceholderText('Search alerts...');
      searchInput.focus();
      expect(searchInput).toHaveFocus();
    });

    it('has proper ARIA labels for interactive elements', () => {
      render(<AlertHistory {...mockProps} />);
      
      const exportButtons = screen.getAllByRole('button');
      exportButtons.forEach(button => {
        expect(button).toHaveClass('hover:bg-gray-200');
      });
    });
  });

  describe('Props Handling', () => {
    it('handles missing optional props gracefully', () => {
      const minimalProps = {
        sessionId: 'test-session',
        alerts: mockAlerts
      };
      
      expect(() => render(<AlertHistory {...minimalProps} />)).not.toThrow();
    });

    it('applies custom className', () => {
      const { container } = render(<AlertHistory {...mockProps} className="custom-class" />);
      
      expect(container.firstChild).toHaveClass('custom-class');
    });
  });
});