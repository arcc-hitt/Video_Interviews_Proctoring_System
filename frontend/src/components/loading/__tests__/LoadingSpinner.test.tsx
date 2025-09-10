import React from 'react';
import { render, screen } from '@testing-library/react';
import { LoadingSpinner } from '../LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders with default props', () => {
    render(<LoadingSpinner />);
    
    const spinner = screen.getByRole('status');
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveClass('loading-spinner');
  });

  it('renders with custom size', () => {
    render(<LoadingSpinner size="large" />);
    
    const spinner = screen.getByRole('status');
    expect(spinner).toHaveClass('loading-spinner--large');
  });

  it('renders with custom color', () => {
    render(<LoadingSpinner color="secondary" />);
    
    const spinner = screen.getByRole('status');
    expect(spinner).toHaveClass('loading-spinner--secondary');
  });

  it('renders with custom className', () => {
    render(<LoadingSpinner className="custom-class" />);
    
    const spinner = screen.getByRole('status');
    expect(spinner).toHaveClass('custom-class');
  });

  it('renders with custom message', () => {
    render(<LoadingSpinner text="Loading data..." />);
    
    expect(screen.getByText('Loading data...')).toBeInTheDocument();
  });

  it('renders with all custom props', () => {
    render(
      <LoadingSpinner 
        size="small" 
        color="secondary" 
        className="test-class"
        text="Processing..."
      />
    );
    
    const spinner = screen.getByRole('status');
    expect(spinner).toHaveClass('loading-spinner--small');
    expect(spinner).toHaveClass('loading-spinner--secondary');
    expect(spinner).toHaveClass('test-class');
    expect(screen.getByText('Processing...')).toBeInTheDocument();
  });
});
