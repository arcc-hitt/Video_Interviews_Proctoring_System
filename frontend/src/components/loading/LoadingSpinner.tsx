import React from 'react';

interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  color?: 'primary' | 'secondary' | 'white' | 'gray';
  text?: string;
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'medium',
  color = 'primary',
  text,
  className = ''
}) => {
  const sizeClasses = {
    small: 'loading-spinner--small',
    medium: 'loading-spinner--medium',
    large: 'loading-spinner--large'
  };

  const colorClasses = {
    primary: 'loading-spinner--primary',
    secondary: 'loading-spinner--secondary',
    white: 'loading-spinner--white',
    gray: 'loading-spinner--gray'
  };

  return (
    <div 
      className={`loading-spinner ${sizeClasses[size]} ${colorClasses[color]} ${className}`}
      role="status"
      aria-label={text || 'Loading'}
    >
      <div className="loading-spinner__circle">
        <div className="loading-spinner__inner"></div>
      </div>
      {text && (
        <div className="loading-spinner__text">{text}</div>
      )}
    </div>
  );
};

export default LoadingSpinner;
