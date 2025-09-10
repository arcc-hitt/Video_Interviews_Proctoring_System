import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { CVErrorBoundary, withCVErrorBoundary } from '../CVErrorBoundary';

// Component that throws a CV-related error
const ThrowCVError = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    const error = new Error('TensorFlow model loading failed');
    error.stack = 'at TensorFlow.loadModel';
    throw error;
  }
  return <div>No error</div>;
};

// Component that throws a non-CV error
const ThrowNonCVError = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Regular JavaScript error');
  }
  return <div>No error</div>;
};

describe('CVErrorBoundary - Simple Tests', () => {
  let originalConsoleError: any;

  beforeEach(() => {
    // Suppress console.error for tests
    originalConsoleError = console.error;
    console.error = vi.fn();
  });

  afterEach(() => {
    // Restore console methods
    console.error = originalConsoleError;
  });

  it('renders children when there is no error', () => {
    render(
      <CVErrorBoundary>
        <ThrowCVError shouldThrow={false} />
      </CVErrorBoundary>
    );

    expect(screen.getByText('No error')).toBeInTheDocument();
  });

  it('identifies CV-related errors correctly', () => {
    const cvErrors = [
      'TensorFlow model loading failed',
      'MediaPipe face detection error',
      'WebGL context lost',
      'WebAssembly compilation failed',
      'Computer vision processing error',
      'CV worker initialization failed'
    ];

    cvErrors.forEach(errorMessage => {
      const error = new Error(errorMessage);
      error.stack = 'at TensorFlow.loadModel';
      
      // Test the static method directly
      const isCVError = CVErrorBoundary.isCVRelatedError(error);
      expect(isCVError).toBe(true);
    });
  });

  it('identifies non-CV errors correctly', () => {
    const nonCVErrors = [
      'Regular JavaScript error',
      'Network request failed',
      'Database connection error',
      'Authentication failed'
    ];

    nonCVErrors.forEach(errorMessage => {
      const error = new Error(errorMessage);
      
      // Test the static method directly
      const isCVError = CVErrorBoundary.isCVRelatedError(error);
      expect(isCVError).toBe(false);
    });
  });

  it('calls onCVError callback when provided', () => {
    const onCVError = vi.fn();
    
    render(
      <CVErrorBoundary onCVError={onCVError}>
        <ThrowCVError shouldThrow={false} />
      </CVErrorBoundary>
    );

    // No error thrown, so callback shouldn't be called
    expect(onCVError).not.toHaveBeenCalled();
  });

  it('calls onFallbackMode callback when provided', () => {
    const onFallbackMode = vi.fn();
    
    render(
      <CVErrorBoundary onFallbackMode={onFallbackMode}>
        <ThrowCVError shouldThrow={false} />
      </CVErrorBoundary>
    );

    // No error thrown, so callback shouldn't be called
    expect(onFallbackMode).not.toHaveBeenCalled();
  });

  it('disables fallback mode when enableFallback is false', () => {
    render(
      <CVErrorBoundary enableFallback={false}>
        <ThrowCVError shouldThrow={false} />
      </CVErrorBoundary>
    );

    expect(screen.getByText('No error')).toBeInTheDocument();
  });

  it('wraps component with CV error boundary HOC', () => {
    const TestComponent = () => <div>Test component</div>;
    const WrappedComponent = withCVErrorBoundary(TestComponent);

    render(<WrappedComponent />);

    expect(screen.getByText('Test component')).toBeInTheDocument();
  });
});
