import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuthProvider, useAuth } from '../AuthContext';

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

// Test component that uses the auth context
const TestComponent: React.FC = () => {
  const { authState, login, signup, logout, clearError } = useAuth();

  return (
    <div>
      <div data-testid="auth-state">
        {JSON.stringify({
          isAuthenticated: authState.isAuthenticated,
          isLoading: authState.isLoading,
          error: authState.error,
          user: authState.user,
        })}
      </div>
      <button
        onClick={() => login({ email: 'test@example.com', password: 'password123' })}
        data-testid="login-btn"
      >
        Login
      </button>
      <button
        onClick={() =>
          signup({
            email: 'test@example.com',
            password: 'password123',
            name: 'Test User',
            role: 'candidate',
          })
        }
        data-testid="signup-btn"
      >
        Signup
      </button>
      <button onClick={logout} data-testid="logout-btn">
        Logout
      </button>
      <button onClick={clearError} data-testid="clear-error-btn">
        Clear Error
      </button>
    </div>
  );
};

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('provides initial auth state', () => {
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    const authState = JSON.parse(screen.getByTestId('auth-state').textContent || '{}');
    expect(authState.isAuthenticated).toBe(false);
    expect(authState.isLoading).toBe(false);
    expect(authState.error).toBe(null);
    expect(authState.user).toBe(null);
  });

  it('loads existing auth data from localStorage on mount', async () => {
    const mockUser = { id: '1', email: 'test@example.com', name: 'Test User', role: 'candidate' };
    const mockToken = 'mock-token';

    mockLocalStorage.getItem.mockImplementation((key) => {
      if (key === 'auth_token') return mockToken;
      if (key === 'auth_user') return JSON.stringify(mockUser);
      return null;
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      const authState = JSON.parse(screen.getByTestId('auth-state').textContent || '{}');
      expect(authState.isAuthenticated).toBe(true);
      expect(authState.user).toEqual(mockUser);
    });
  });

  it('handles corrupted localStorage data gracefully', async () => {
    mockLocalStorage.getItem.mockImplementation((key) => {
      if (key === 'auth_token') return 'mock-token';
      if (key === 'auth_user') return 'invalid-json';
      return null;
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('auth_token');
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('auth_user');
      
      const authState = JSON.parse(screen.getByTestId('auth-state').textContent || '{}');
      expect(authState.isAuthenticated).toBe(false);
    });
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
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await user.click(screen.getByTestId('login-btn'));

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
      
      const authState = JSON.parse(screen.getByTestId('auth-state').textContent || '{}');
      expect(authState.isAuthenticated).toBe(true);
      expect(authState.user).toEqual(mockResponse.user);
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
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await user.click(screen.getByTestId('login-btn'));

    await waitFor(() => {
      const authState = JSON.parse(screen.getByTestId('auth-state').textContent || '{}');
      expect(authState.isAuthenticated).toBe(false);
      expect(authState.error).toBe('Invalid credentials');
    });
  });

  it('handles successful signup', async () => {
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
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await user.click(screen.getByTestId('signup-btn'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
          name: 'Test User',
          role: 'candidate',
        }),
      });
    });

    await waitFor(() => {
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('auth_token', 'mock-token');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('auth_user', JSON.stringify(mockResponse.user));
      
      const authState = JSON.parse(screen.getByTestId('auth-state').textContent || '{}');
      expect(authState.isAuthenticated).toBe(true);
      expect(authState.user).toEqual(mockResponse.user);
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
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await user.click(screen.getByTestId('signup-btn'));

    await waitFor(() => {
      const authState = JSON.parse(screen.getByTestId('auth-state').textContent || '{}');
      expect(authState.isAuthenticated).toBe(false);
      expect(authState.error).toBe('Email already exists');
    });
  });

  it('handles logout correctly', async () => {
    const user = userEvent.setup();
    
    // Set up initial authenticated state
    const mockUser = { id: '1', email: 'test@example.com', name: 'Test User', role: 'candidate' };
    mockLocalStorage.getItem.mockImplementation((key) => {
      if (key === 'auth_token') return 'mock-token';
      if (key === 'auth_user') return JSON.stringify(mockUser);
      return null;
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    // Wait for initial auth state to load
    await waitFor(() => {
      const authState = JSON.parse(screen.getByTestId('auth-state').textContent || '{}');
      expect(authState.isAuthenticated).toBe(true);
    });

    // Perform logout
    await user.click(screen.getByTestId('logout-btn'));

    expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('auth_token');
    expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('auth_user');

    const authState = JSON.parse(screen.getByTestId('auth-state').textContent || '{}');
    expect(authState.isAuthenticated).toBe(false);
    expect(authState.user).toBe(null);
  });

  it('clears error when clearError is called', async () => {
    const user = userEvent.setup();
    
    // Trigger an error first
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Test error' }),
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await user.click(screen.getByTestId('login-btn'));

    await waitFor(() => {
      const authState = JSON.parse(screen.getByTestId('auth-state').textContent || '{}');
      expect(authState.error).toBe('Test error');
    });

    // Clear the error
    await user.click(screen.getByTestId('clear-error-btn'));

    const authState = JSON.parse(screen.getByTestId('auth-state').textContent || '{}');
    expect(authState.error).toBe(null);
  });

  it('throws error when useAuth is used outside AuthProvider', () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<TestComponent />);
    }).toThrow('useAuth must be used within an AuthProvider');

    consoleSpy.mockRestore();
  });
});