import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { LoginForm } from '../LoginForm';
import { AuthProvider } from '../../../contexts/AuthContext';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
});

// Test wrapper with AuthProvider
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AuthProvider>{children}</AuthProvider>
);

describe('LoginForm', () => {
  const mockOnSuccess = vi.fn();
  const mockOnSwitchToSignup = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  it('renders login form with all required fields', () => {
    render(
      <TestWrapper>
        <LoginForm onSuccess={mockOnSuccess} onSwitchToSignup={mockOnSwitchToSignup} />
      </TestWrapper>
    );

    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByText(/don't have an account/i)).toBeInTheDocument();
  });

  it('validates email field correctly', async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <LoginForm onSuccess={mockOnSuccess} onSwitchToSignup={mockOnSwitchToSignup} />
      </TestWrapper>
    );

    const submitButton = screen.getByRole('button', { name: /sign in/i });
    
    // Submit without email
    await user.click(submitButton);
    expect(screen.getByText(/email is required/i)).toBeInTheDocument();

    // Enter invalid email
    const emailInput = screen.getByLabelText(/email address/i);
    await user.type(emailInput, 'invalid-email');
    await user.click(submitButton);
    expect(screen.getByText(/please enter a valid email address/i)).toBeInTheDocument();

    // Enter valid email
    await user.clear(emailInput);
    await user.type(emailInput, 'test@example.com');
    await user.click(submitButton);
    expect(screen.queryByText(/please enter a valid email address/i)).not.toBeInTheDocument();
  });

  it('validates password field correctly', async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <LoginForm onSuccess={mockOnSuccess} onSwitchToSignup={mockOnSwitchToSignup} />
      </TestWrapper>
    );

    const submitButton = screen.getByRole('button', { name: /sign in/i });
    
    // Submit without password
    await user.click(submitButton);
    expect(screen.getByText(/password is required/i)).toBeInTheDocument();

    // Enter short password
    const passwordInput = screen.getByLabelText(/password/i);
    await user.type(passwordInput, '123');
    await user.click(submitButton);
    expect(screen.getByText(/password must be at least 6 characters/i)).toBeInTheDocument();

    // Enter valid password
    await user.clear(passwordInput);
    await user.type(passwordInput, 'password123');
    await user.click(submitButton);
    expect(screen.queryByText(/password must be at least 6 characters/i)).not.toBeInTheDocument();
  });

  it('clears field errors when user starts typing', async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <LoginForm onSuccess={mockOnSuccess} onSwitchToSignup={mockOnSwitchToSignup} />
      </TestWrapper>
    );

    const submitButton = screen.getByRole('button', { name: /sign in/i });
    const emailInput = screen.getByLabelText(/email address/i);

    // Trigger validation error
    await user.click(submitButton);
    expect(screen.getByText(/email is required/i)).toBeInTheDocument();

    // Start typing to clear error
    await user.type(emailInput, 't');
    expect(screen.queryByText(/email is required/i)).not.toBeInTheDocument();
  });

  it('handles successful login', async () => {
    const user = userEvent.setup();
    const mockResponse = {
      user: { id: '1', email: 'test@example.com', name: 'Test User', role: 'candidate' },
      token: 'mock-token',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    render(
      <TestWrapper>
        <LoginForm onSuccess={mockOnSuccess} onSwitchToSignup={mockOnSwitchToSignup} />
      </TestWrapper>
    );

    // Fill form with valid data
    await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    
    // Submit form
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
      });
    });

    await waitFor(() => {
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('auth_token', 'mock-token');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('auth_user', JSON.stringify(mockResponse.user));
      expect(mockOnSuccess).toHaveBeenCalled();
    });
  });

  it('handles login failure', async () => {
    const user = userEvent.setup();
    const mockError = { message: 'Invalid credentials' };

    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => mockError,
    });

    render(
      <TestWrapper>
        <LoginForm onSuccess={mockOnSuccess} onSwitchToSignup={mockOnSwitchToSignup} />
      </TestWrapper>
    );

    // Fill form with valid data
    await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'wrongpassword');
    
    // Submit form
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
    });

    expect(mockOnSuccess).not.toHaveBeenCalled();
  });

  it('calls onSwitchToSignup when signup link is clicked', async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <LoginForm onSuccess={mockOnSuccess} onSwitchToSignup={mockOnSwitchToSignup} />
      </TestWrapper>
    );

    const signupLink = screen.getByText(/sign up here/i);
    await user.click(signupLink);

    expect(mockOnSwitchToSignup).toHaveBeenCalled();
  });

  it('disables form during loading state', async () => {
    const user = userEvent.setup();
    
    // Mock a slow response to test loading state
    mockFetch.mockImplementationOnce(() => new Promise(resolve => setTimeout(resolve, 1000)));

    render(
      <TestWrapper>
        <LoginForm onSuccess={mockOnSuccess} onSwitchToSignup={mockOnSwitchToSignup} />
      </TestWrapper>
    );

    // Fill form
    await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    
    // Submit form
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    // Check loading state
    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
    expect(screen.getByLabelText(/email address/i)).toBeDisabled();
    expect(screen.getByLabelText(/password/i)).toBeDisabled();
  });
});