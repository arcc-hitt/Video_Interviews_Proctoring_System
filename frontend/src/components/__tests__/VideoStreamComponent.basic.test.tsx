import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import VideoStreamComponent from '../VideoStreamComponent';

describe('VideoStreamComponent - Basic Tests', () => {
  it('renders without crashing', () => {
    render(<VideoStreamComponent />);
    expect(screen.getByRole('button', { name: /start camera/i })).toBeInTheDocument();
  });

  it('displays video element', () => {
    render(<VideoStreamComponent />);
    const videoElement = document.querySelector('video');
    expect(videoElement).toBeInTheDocument();
  });

  it('has proper CSS classes', () => {
    render(<VideoStreamComponent />);
    const videoElement = document.querySelector('video');
    expect(videoElement).toHaveClass('w-full', 'h-auto', 'rounded-lg', 'shadow-lg');
  });
});