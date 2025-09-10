import React from 'react';
import { LoadingSpinner } from './LoadingSpinner';
import { ProgressBar } from './ProgressBar';

interface LoadingStatesProps {
  type: 'initializing' | 'processing' | 'uploading' | 'connecting' | 'custom';
  progress?: number;
  message?: string;
  subMessage?: string;
  showSpinner?: boolean;
  showProgress?: boolean;
  className?: string;
}

const LOADING_MESSAGES: Record<string, { message: string; subMessage: string }> = {
  initializing: {
    message: 'Initializing monitoring system...',
    subMessage: 'Setting up computer vision and detection services'
  },
  processing: {
    message: 'Processing video frame...',
    subMessage: 'Analyzing for potential violations'
  },
  uploading: {
    message: 'Uploading session data...',
    subMessage: 'Saving your interview session'
  },
  connecting: {
    message: 'Connecting to server...',
    subMessage: 'Establishing secure connection'
  },
  custom: {
    message: 'Loading...',
    subMessage: ''
  }
};

export const LoadingStates: React.FC<LoadingStatesProps> = ({
  type,
  progress,
  message,
  subMessage,
  showSpinner = true,
  showProgress = false,
  className = ''
}) => {
  const defaultConfig = LOADING_MESSAGES[type] || { message: 'Loading...', subMessage: '' };
  const displayMessage = message || defaultConfig.message;
  const displaySubMessage = subMessage || defaultConfig.subMessage;

  return (
    <div className={`loading-states ${className}`} data-testid="loading-states">
      <div className="loading-states__container">
        {showSpinner && (
          <div className="loading-states__spinner">
            <LoadingSpinner size="large" />
          </div>
        )}
        
        <div className="loading-states__content">
          <h3 className="loading-states__message">{displayMessage}</h3>
          {displaySubMessage && (
            <p className="loading-states__sub-message">{displaySubMessage}</p>
          )}
        </div>

        {(showProgress || progress !== undefined) && (
          <div className="loading-states__progress">
            <ProgressBar
              progress={progress || 0}
              showPercentage={true}
              animated={true}
            />
          </div>
        )}
      </div>
    </div>
  );
};

// Specific loading components for common scenarios
export const CVInitializingLoader: React.FC<{ progress?: number }> = ({ progress }) => (
  <LoadingStates
    type="initializing"
    progress={progress}
    showProgress={progress !== undefined}
  />
);

export const VideoProcessingLoader: React.FC<{ progress?: number }> = ({ progress }) => (
  <LoadingStates
    type="processing"
    progress={progress}
    showProgress={progress !== undefined}
  />
);

export const SessionUploadLoader: React.FC<{ progress?: number }> = ({ progress }) => (
  <LoadingStates
    type="uploading"
    progress={progress}
    showProgress={progress !== undefined}
  />
);

export const ConnectionLoader: React.FC<{ progress?: number }> = ({ progress }) => (
  <LoadingStates
    type="connecting"
    progress={progress}
    showProgress={progress !== undefined}
  />
);

export default LoadingStates;
