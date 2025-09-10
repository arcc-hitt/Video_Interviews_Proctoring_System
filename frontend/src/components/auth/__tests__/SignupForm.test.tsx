import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { SignupForm } from '../SignupForm';
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

describe('SignupForm', () => {
  const mockOnSuccess = vi.fn();
  const mockOnSwitchToLogin = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  it('renders signup form with all required fields', () => {
    render(
      <TestWrapper>
        <SignupForm onSuccess={mockOnSuccess} onSwitchToLogin={mockOnSwitchToLogin} />
      </TestWrapper>
    );

    expect(screen.getByRole('heading', { name: /create account/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^role$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
    expect(screen.getByText(/already have an account/i)).toBeInTheDocument();
  });

  it('validates name field correctly', async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <SignupForm onSuccess={mockOnSuccess} onSwitchToLogin={mockOnSwitchToLogin} />
      </TestWrapper>
    );

    const submitButton = screen.getByRole('button', { name: /create account/i });
    
    // Submit without name
    await user.click(submitButton);
    expect(screen.getByText(/name is required/i)).toBeInTheDocument();

    // Enter short name
    const nameInput = screen.getByLabelText(/full name/i);
    await user.type(nameInput, 'A');
    await user.click(submitButton);
    expect(screen.getByText(/name must be at least 2 characters/i)).toBeInTheDocument();

    // Enter valid name
    await user.clear(nameInput);
    await user.type(nameInput, 'John Doe');
    await user.click(submitButton);
    expect(screen.queryByText(/name must be at least 2 characters/i)).not.toBeInTheDocument();
  });

  it('validates email field correctly', async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <SignupForm onSuccess={mockOnSuccess} onSwitchToLogin={mockOnSwitchToLogin} />
      </TestWrapper>
    );

    const submitButton = screen.getByRole('button', { name: /create account/i });
    
    // Submit without email
    await user.click(submitButton);
    expect(screen.getByText(/email is required/i)).toBeInTheDocument();

    // Enter invalid email
    const emailInput = screen.getByLabelText(/email address/i);
    await user.type(emailInput, 'invalid-email');
    await user.click(submitButton);
    expect(screen.getByText(/please enter a valid email address/i)).toBeInTheDocument();
  });

  it('validates password field correctly', async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <SignupForm onSuccess={mockOnSuccess} onSwitchToLogin={mockOnSwitchToLogin} />
      </TestWrapper>
    );

    const submitButton = screen.getByRole('button', { name: /create account/i });
    const passwordInput = screen.getByLabelText(/^password$/i);
    
    // Submit without password
    await user.click(submitButton);
    expect(screen.getByText(/password is required/i)).toBeInTheDocument();

    // Enter short password
    await user.type(passwordInput, '123');
    await user.click(submitButton);
    expect(screen.getByText(/password must be at least 6 characters/i)).toBeInTheDocument();

    // Enter password without complexity requirements
    await user.clear(passwordInput);
    await user.type(passwordInput, 'password');
    await user.click(submitButton);
    expect(screen.getByText(/password must contain at least one uppercase letter/i)).toBeInTheDocument();

    // Enter valid password
    await user.clear(passwordInput);
    await user.type(passwordInput, 'Password123');
    await user.click(submitButton);
    expect(screen.queryByText(/password must contain at least one uppercase letter/i)).not.toBeInTheDocument();
  });

  it('validates password confirmation correctly', async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <SignupForm onSuccess={mockOnSuccess} onSwitchToLogin={mockOnSwitchToLogin} />
      </TestWrapper>
    );

    const submitButton = screen.getByRole('button', { name: /create account/i });
    const passwordInput = screen.getByLabelText(/^password$/i);
    const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
    
    // Submit without confirm password
    await user.click(submitButton);
    expect(screen.getByText(/please confirm your password/i)).toBeInTheDocument();

    // Enter mismatched passwords
    await user.type(passwordInput, 'Password123');
    await user.type(confirmPasswordInput, 'DifferentPassword123');
    await user.click(submitButton);
    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();

    // Enter matching passwords
    await user.clear(confirmPasswordInput);
    await user.type(confirmPasswordInput, 'Password123');
    await user.click(submitButton);
    expect(screen.queryByText(/passwords do not match/i)).not.toBeInTheDocument();
  });

  it('handles role selection correctly', async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <SignupForm onSuccess={mockOnSuccess} onSwitchToLogin={mockOnSwitchToLogin} />
      </TestWrapper>
    );

    const roleSelect = screen.getByLabelText(/role/i);
    
    // Default should be candidate
    expect(roleSelect).toHaveValue('candidate');

    // Change to interviewer
    await user.selectOptions(roleSelect, 'interviewer');
    expect(roleSelect).toHaveValue('interviewer');
  });

  it('handles successful signup', async () => {
    const user = userEvent.setup();
    const mockResponse = {
      user: { id: '1', email: 'test@example.com', name: 'John Doe', role: 'candidate' },
      token: 'mock-token',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    render(
      <TestWrapper>
        <SignupForm onSuccess={mockOnSuccess} onSwitchToLogin={mockOnSwitchToLogin} />
      </TestWrapper>
    );

    // Fill form with valid data
    await user.type(screen.getByLabelText(/full name/i), 'John Doe');
    await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
    await user.selectOptions(screen.getByLabelText(/role/i), 'candidate');
    await user.type(screen.getByLabelText(/^password$/i), 'Password123');
    await user.type(screen.getByLabelText(/confirm password/i), 'Password123');
    
    // Submit form
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'John Doe',
          email: 'test@example.com',
          role: 'candidate',
          password: 'Password123',
        }),
      });
    });

    await waitFor(() => {
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('auth_token', 'mock-token');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('auth_user', JSON.stringify(mockResponse.user));
      expect(mockOnSuccess).toHaveBeenCalled();
    });
  });

  it('handles signup failure', async () => {
    const user = userEvent.setup();
    const mockError = { message: 'Email already exists' };

    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => mockError,
    });

    render(
      <TestWrapper>
        <SignupForm onSuccess={mockOnSuccess} onSwitchToLogin={mockOnSwitchToLogin} />
      </TestWrapper>
    );

    // Fill form with valid data
    await user.type(screen.getByLabelText(/full name/i), 'John Doe');
    await user.type(screen.getByLabelText(/email address/i), 'existing@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'Password123');
    await user.type(screen.getByLabelText(/confirm password/i), 'Password123');
    
    // Submit form
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText(/email already exists/i)).toBeInTheDocument();
    });

    expect(mockOnSuccess).not.toHaveBeenCalled();
  });

  it('calls onSwitchToLogin when login link is clicked', async () => {
    const user = userEvent.setup();
    render(
      <TestWrapper>
        <SignupForm onSuccess={mockOnSuccess} onSwitchToLogin={mockOnSwitchToLogin} />
      </TestWrapper>
    );

    const loginLink = screen.getByText(/sign in here/i);
    await user.click(loginLink);

    expect(mockOnSwitchToLogin).toHaveBeenCalled();
  });

  it('disables form during loading state', async () => {
    const user = userEvent.setup();
    
    // Mock a slow response to test loading state
    mockFetch.mockImplementationOnce(() => new Promise(resolve => setTimeout(resolve, 1000)));

    render(
      <TestWrapper>
        <SignupForm onSuccess={mockOnSuccess} onSwitchToLogin={mockOnSwitchToLogin} />
      </TestWrapper>
    );

    // Fill form
    await user.type(screen.getByLabelText(/full name/i), 'John Doe');
    await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'Password123');
    await user.type(screen.getByLabelText(/confirm password/i), 'Password123');
    
    // Submit form
    await user.click(screen.getByRole('button', { name: /create account/i }));

    // Check loading state
    expect(screen.getByRole('button', { name: /creating account/i })).toBeDisabled();
    expect(screen.getByLabelText(/full name/i)).toBeDisabled();
    expect(screen.getByLabelText(/email address/i)).toBeDisabled();
  });
});