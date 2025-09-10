import React from 'react';
import { render, screen } from '@testing-library/react';
import { LoadingStates } from '../LoadingStates';

describe('LoadingStates', () => {
  it('renders with initializing state', () => {
    render(<LoadingStates type="initializing" />);
    
    expect(screen.getByText('Initializing monitoring system...')).toBeInTheDocument();
    expect(screen.getByText('Setting up computer vision and detection services')).toBeInTheDocument();
  });

  it('renders with processing state', () => {
    render(<LoadingStates type="processing" />);
    
    expect(screen.getByText('Processing video frame...')).toBeInTheDocument();
    expect(screen.getByText('Analyzing for potential violations')).toBeInTheDocument();
  });

  it('renders with uploading state', () => {
    render(<LoadingStates type="uploading" />);
    
    expect(screen.getByText('Uploading session data...')).toBeInTheDocument();
    expect(screen.getByText('Saving your interview session')).toBeInTheDocument();
  });

  it('renders with connecting state', () => {
    render(<LoadingStates type="connecting" />);
    
    expect(screen.getByText('Connecting to server...')).toBeInTheDocument();
    expect(screen.getByText('Establishing secure connection')).toBeInTheDocument();
  });

  it('renders with custom state', () => {
    render(<LoadingStates type="custom" />);
    
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders with custom message', () => {
    render(<LoadingStates type="custom" message="Custom loading message" />);
    
    expect(screen.getByText('Custom loading message')).toBeInTheDocument();
  });

  it('renders with custom subMessage', () => {
    render(<LoadingStates type="custom" subMessage="Custom sub message" />);
    
    expect(screen.getByText('Custom sub message')).toBeInTheDocument();
  });

  it('renders with progress', () => {
    render(<LoadingStates type="processing" progress={75} />);
    
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toBeInTheDocument();
    expect(progressBar).toHaveAttribute('aria-valuenow', '75');
  });

  it('renders with custom className', () => {
    render(<LoadingStates type="initializing" className="custom-class" />);
    
    const container = screen.getByTestId('loading-states');
    expect(container).toHaveClass('custom-class');
  });

  it('renders with all custom props', () => {
    render(
      <LoadingStates 
        type="custom" 
        message="Custom message" 
        subMessage="Custom sub message"
        progress={50}
        className="test-class"
      />
    );
    
    expect(screen.getByText('Custom message')).toBeInTheDocument();
    expect(screen.getByText('Custom sub message')).toBeInTheDocument();
    
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '50');
    
    const container = screen.getByTestId('loading-states');
    expect(container).toHaveClass('test-class');
  });
});
