import React from 'react';

interface ProgressBarProps {
  progress: number; // 0-100
  label?: string;
  showPercentage?: boolean;
  color?: 'primary' | 'success' | 'warning' | 'error';
  size?: 'small' | 'medium' | 'large';
  animated?: boolean;
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  label,
  showPercentage = true,
  color = 'primary',
  size = 'medium',
  animated = true,
  className = ''
}) => {
  const clampedProgress = Math.max(0, Math.min(100, progress));
  
  const colorClasses = {
    primary: 'progress-bar--primary',
    success: 'progress-bar--success',
    warning: 'progress-bar--warning',
    error: 'progress-bar--error'
  };

  const sizeClasses = {
    small: 'progress-bar--small',
    medium: 'progress-bar--medium',
    large: 'progress-bar--large'
  };

  return (
    <div 
      className={`progress-bar ${colorClasses[color]} ${sizeClasses[size]} ${className}`}
      role="progressbar"
      aria-valuenow={clampedProgress}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label || `Progress: ${clampedProgress}%`}
    >
      {label && (
        <div className="progress-bar__label">
          <span className="progress-bar__label-text">{label}</span>
          {showPercentage && (
            <span className="progress-bar__percentage">{Math.round(clampedProgress)}%</span>
          )}
        </div>
      )}
      <div className="progress-bar__track">
        <div
          className={`progress-bar__fill ${animated ? 'progress-bar__fill--animated' : ''}`}
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
    </div>
  );
};

export default ProgressBar;
