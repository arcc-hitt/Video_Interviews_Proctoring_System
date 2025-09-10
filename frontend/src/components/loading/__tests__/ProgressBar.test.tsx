import React from 'react';
import { render, screen } from '@testing-library/react';
import { ProgressBar } from '../ProgressBar';

describe('ProgressBar', () => {
  it('renders with default props', () => {
    render(<ProgressBar progress={50} />);
    
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toBeInTheDocument();
    expect(progressBar).toHaveAttribute('aria-valuenow', '50');
    expect(progressBar).toHaveAttribute('aria-valuemin', '0');
    expect(progressBar).toHaveAttribute('aria-valuemax', '100');
  });

  it('renders with custom progress value', () => {
    render(<ProgressBar progress={75} />);
    
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '75');
  });

  it('renders with custom size', () => {
    render(<ProgressBar progress={50} size="large" />);
    
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveClass('progress-bar--large');
  });

  it('renders with custom color', () => {
    render(<ProgressBar progress={50} color="success" />);
    
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveClass('progress-bar--success');
  });

  it('renders with custom className', () => {
    render(<ProgressBar progress={50} className="custom-class" />);
    
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveClass('custom-class');
  });

  it('renders with custom label', () => {
    render(<ProgressBar progress={50} label="Uploading files..." />);
    
    expect(screen.getByText('Uploading files...')).toBeInTheDocument();
  });

  it('renders with showPercentage', () => {
    render(<ProgressBar progress={50} showPercentage label="Test" />);
    
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('renders with all custom props', () => {
    render(
      <ProgressBar 
        progress={80} 
        size="small" 
        color="success" 
        className="test-class"
        label="Processing..."
        showPercentage
      />
    );
    
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveClass('progress-bar--small');
    expect(progressBar).toHaveClass('progress-bar--success');
    expect(progressBar).toHaveClass('test-class');
    expect(progressBar).toHaveAttribute('aria-valuenow', '80');
    expect(screen.getByText('Processing...')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
  });

  it('handles progress values outside 0-100 range', () => {
    render(<ProgressBar progress={150} />);
    
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '100');
  });

  it('handles negative progress values', () => {
    render(<ProgressBar progress={-10} />);
    
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '0');
  });
});
