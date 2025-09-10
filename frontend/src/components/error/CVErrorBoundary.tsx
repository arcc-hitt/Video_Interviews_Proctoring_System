import React, { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface CVErrorBoundaryState {
  hasCVError: boolean;
  cvError: Error | null;
  fallbackMode: boolean;
}

interface CVErrorBoundaryProps {
  children: ReactNode;
  onCVError?: (error: Error) => void;
  onFallbackMode?: (enabled: boolean) => void;
  enableFallback?: boolean;
}

export class CVErrorBoundary extends Component<CVErrorBoundaryProps, CVErrorBoundaryState> {
  constructor(props: CVErrorBoundaryProps) {
    super(props);
    this.state = {
      hasCVError: false,
      cvError: null,
      fallbackMode: false
    };
  }

  static getDerivedStateFromError(error: Error): Partial<CVErrorBoundaryState> {
    // Check if this is a CV-related error
    const isCVError = CVErrorBoundary.isCVRelatedError(error);
    
    return {
      hasCVError: isCVError,
      cvError: isCVError ? error : null,
      fallbackMode: isCVError
    };
  }

  private static isCVRelatedError(error: Error): boolean {
    const cvErrorKeywords = [
      'tensorflow',
      'mediapipe',
      'face detection',
      'object detection',
      'computer vision',
      'cv worker',
      'webgl',
      'webassembly',
      'tensor',
      'model',
      'inference'
    ];

    const errorMessage = error.message.toLowerCase();
    const errorStack = error.stack?.toLowerCase() || '';

    return cvErrorKeywords.some(keyword => 
      errorMessage.includes(keyword) || errorStack.includes(keyword)
    );
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { onCVError, onFallbackMode } = this.props;
    const { hasCVError } = this.state;

    if (hasCVError) {
      // Only log in non-test environments
      if (process.env.NODE_ENV !== 'test') {
        console.error('CV Error Boundary caught a computer vision error:', error, errorInfo);
      }
      
      if (onCVError) {
        onCVError(error);
      }

      if (onFallbackMode) {
        onFallbackMode(true);
      }

      // Log CV-specific error
      this.logCVError(error, errorInfo);
    }
  }

  private logCVError = (error: Error, errorInfo: ErrorInfo) => {
    const cvErrorReport = {
      type: 'CV_ERROR',
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      cvCapabilities: this.getCVCapabilities()
    };

    console.error('CV Error Report:', cvErrorReport);

    // Send to error reporting service
    this.sendErrorReport(cvErrorReport);
  };

  private getCVCapabilities = () => {
    return {
      webgl: !!document.createElement('canvas').getContext('webgl'),
      webgl2: !!document.createElement('canvas').getContext('webgl2'),
      webAssembly: typeof WebAssembly !== 'undefined',
      workers: typeof Worker !== 'undefined',
      mediaDevices: !!navigator.mediaDevices,
      getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
    };
  };

  private sendErrorReport = async (errorReport: any) => {
    try {
      await fetch('/api/errors/cv', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(errorReport)
      });
    } catch (err) {
      console.error('Failed to send CV error report:', err);
    }
  };

  private handleRetry = () => {
    this.setState({
      hasCVError: false,
      cvError: null,
      fallbackMode: false
    });
  };

  private handleEnableFallback = () => {
    const { onFallbackMode } = this.props;
    
    this.setState({
      fallbackMode: true
    });

    if (onFallbackMode) {
      onFallbackMode(true);
    }
  };

  render() {
    const { children, enableFallback = true } = this.props;
    const { hasCVError, cvError, fallbackMode } = this.state;

    if (hasCVError && !fallbackMode) {
      return (
        <div className="cv-error-boundary">
          <div className="cv-error-boundary__container">
            <div className="cv-error-boundary__icon">🤖</div>
            <h2 className="cv-error-boundary__title">Computer Vision Error</h2>
            <p className="cv-error-boundary__message">
              The computer vision system encountered an error. This might be due to:
            </p>
            <ul className="cv-error-boundary__reasons">
              <li>Insufficient browser capabilities</li>
              <li>WebGL or WebAssembly not supported</li>
              <li>Model loading failure</li>
              <li>Memory constraints</li>
            </ul>

            {process.env.NODE_ENV === 'development' && cvError && (
              <details className="cv-error-boundary__details">
                <summary>Technical Details (Development Only)</summary>
                <pre className="cv-error-boundary__error-stack">
                  {cvError.toString()}
                </pre>
              </details>
            )}

            <div className="cv-error-boundary__actions">
              <button
                className="cv-error-boundary__retry-btn"
                onClick={this.handleRetry}
              >
                Try Again
              </button>
              
              {enableFallback && (
                <button
                  className="cv-error-boundary__fallback-btn"
                  onClick={this.handleEnableFallback}
                >
                  Continue with Basic Monitoring
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    // Render children with fallback mode indicator
    return (
      <div className={`cv-error-boundary__content ${fallbackMode ? 'fallback-mode' : ''}`}>
        {fallbackMode && (
          <div className="cv-error-boundary__fallback-notice">
            <span className="cv-error-boundary__fallback-icon">⚠️</span>
            <span>Running in basic monitoring mode</span>
          </div>
        )}
        {children}
      </div>
    );
  }
}

// HOC for easier usage
export function withCVErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  cvErrorBoundaryProps?: Omit<CVErrorBoundaryProps, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <CVErrorBoundary {...cvErrorBoundaryProps}>
      <Component {...props} />
    </CVErrorBoundary>
  );

  WrappedComponent.displayName = `withCVErrorBoundary(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
}

export default CVErrorBoundary;
