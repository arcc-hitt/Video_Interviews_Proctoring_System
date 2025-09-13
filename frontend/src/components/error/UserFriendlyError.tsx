import React from 'react';
import { Video, X, Search, Wifi, Settings, Camera } from 'lucide-react';
import type { VideoStreamError } from '../../types';

interface UserFriendlyErrorProps {
  error: VideoStreamError;
  onRetry?: () => void;
  onDismiss?: () => void;
  showDetails?: boolean;
}

interface ErrorMessage {
  title: string;
  description: string;
  suggestions: string[];
  icon: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

const ERROR_MESSAGES: Record<string, ErrorMessage> = {
  CAMERA_ACCESS_DENIED: {
    title: 'Camera Access Required',
    description: 'We need access to your camera to monitor the interview session.',
    suggestions: [
      'Click the camera icon in your browser\'s address bar',
      'Select "Allow" for camera permissions',
      'Refresh the page and try again',
      'Check if another application is using your camera'
    ],
    icon: 'camera',
    severity: 'high'
  },
  DEVICE_NOT_FOUND: {
    title: 'Camera Not Found',
    description: 'We couldn\'t find a camera connected to your device.',
    suggestions: [
      'Make sure your camera is properly connected',
      'Check if your camera is being used by another application',
      'Try refreshing the page',
      'Contact support if the problem persists'
    ],
    icon: 'search',
    severity: 'high'
  },
  RECORDING_FAILED: {
    title: 'Recording Failed',
    description: 'We encountered an issue while recording your session.',
    suggestions: [
      'Check your internet connection',
      'Ensure you have enough storage space',
      'Try refreshing the page',
      'Contact support if the problem continues'
    ],
    icon: 'video',
    severity: 'medium'
  },
  STREAM_FAILED: {
    title: 'Video Stream Failed',
    description: 'We couldn\'t establish a stable video connection.',
    suggestions: [
      'Check your internet connection',
      'Try refreshing the page',
      'Close other applications that might be using bandwidth',
      'Contact support if the problem persists'
    ],
    icon: 'wifi',
    severity: 'high'
  },
  PROCESSING_ERROR: {
    title: 'Processing Error',
    description: 'The monitoring system encountered a technical issue.',
    suggestions: [
      'Try refreshing the page',
      'Check if your browser supports the required features',
      'Contact support if the problem continues',
      'The interview can continue with basic monitoring'
    ],
    icon: 'settings',
    severity: 'medium'
  }
};

const renderIcon = (iconName: string) => {
  const iconProps = { size: 24, className: "error-icon" };
  
  switch (iconName) {
    case 'camera': return <Camera {...iconProps} />;
    case 'search': return <Search {...iconProps} />;
    case 'video': return <Video {...iconProps} />;
    case 'wifi': return <Wifi {...iconProps} />;
    case 'settings': return <Settings {...iconProps} />;
    case 'error': return <X {...iconProps} />;
    default: return <X {...iconProps} />;
  }
};

export const UserFriendlyError: React.FC<UserFriendlyErrorProps> = ({
  error,
  onRetry,
  onDismiss,
  showDetails = false
}) => {
  const errorInfo = ERROR_MESSAGES[error.type] || {
    title: 'Unknown Error',
    description: 'An unexpected error occurred.',
    suggestions: ['Try refreshing the page', 'Contact support if the problem persists'],
    icon: 'error',
    severity: 'medium' as const
  };

  const getSeverityClass = (severity: string) => {
    switch (severity) {
      case 'low': return 'error-low';
      case 'medium': return 'error-medium';
      case 'high': return 'error-high';
      case 'critical': return 'error-critical';
      default: return 'error-medium';
    }
  };

  return (
    <div className={`user-friendly-error ${getSeverityClass(errorInfo.severity)}`}>
      <div className="user-friendly-error__container">
        <div className="user-friendly-error__header">
          <div className="user-friendly-error__icon">{renderIcon(errorInfo.icon)}</div>
          <div className="user-friendly-error__content">
            <h3 className="user-friendly-error__title">{errorInfo.title}</h3>
            <p className="user-friendly-error__description">{errorInfo.description}</p>
          </div>
        </div>

        <div className="user-friendly-error__suggestions">
          <h4 className="user-friendly-error__suggestions-title">Try these solutions:</h4>
          <ul className="user-friendly-error__suggestions-list">
            {errorInfo.suggestions.map((suggestion, index) => (
              <li key={index} className="user-friendly-error__suggestion">
                {suggestion}
              </li>
            ))}
          </ul>
        </div>

        {showDetails && error.originalError && (
          <details className="user-friendly-error__details">
            <summary className="user-friendly-error__details-summary">
              Technical Details
            </summary>
            <div className="user-friendly-error__details-content">
              <p><strong>Error Type:</strong> {error.type}</p>
              <p><strong>Message:</strong> {error.message}</p>
              {error.originalError && (
                <pre className="user-friendly-error__error-stack">
                  {error.originalError.stack}
                </pre>
              )}
            </div>
          </details>
        )}

        <div className="user-friendly-error__actions">
          {onRetry && (
            <button
              className="user-friendly-error__retry-btn"
              onClick={onRetry}
            >
              Try Again
            </button>
          )}
          {onDismiss && (
            <button
              className="user-friendly-error__dismiss-btn"
              onClick={onDismiss}
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Hook for easy error handling
export const useUserFriendlyError = () => {
  const [error, setError] = React.useState<VideoStreamError | null>(null);

  const showError = (error: VideoStreamError) => {
    setError(error);
  };

  const clearError = () => {
    setError(null);
  };

  const handleRetry = () => {
    clearError();
    // Additional retry logic can be added here
  };

  return {
    error,
    showError,
    clearError,
    handleRetry,
    ErrorComponent: error ? (
      <UserFriendlyError
        error={error}
        onRetry={handleRetry}
        onDismiss={clearError}
        showDetails={import.meta.env.DEV}
      />
    ) : null
  };
};

export default UserFriendlyError;
