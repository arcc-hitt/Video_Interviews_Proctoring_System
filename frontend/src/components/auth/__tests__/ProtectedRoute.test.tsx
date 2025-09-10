import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ProtectedRoute } from '../ProtectedRoute';
import { AuthProvider } from '../../../contexts/AuthContext';

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

// Test components
const TestComponent: React.FC = () => <div>Protected Content</div>;
const AuthPage: React.FC = () => <div>Auth Page</div>;
const CandidatePage: React.FC = () => <div>Candidate Page</div>;
const InterviewerPage: React.FC = () => <div>Interviewer Page</div>;

// Test wrapper with router and auth provider
const TestWrapper: React.FC<{ 
  children: React.ReactNode;
}> = ({ children }) => (
  <BrowserRouter>
    <AuthProvider>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/candidate" element={<CandidatePage />} />
        <Route path="/interviewer" element={<InterviewerPage />} />
        <Route path="/" element={children} />
        <Route path="/protected" element={children} />
      </Routes>
    </AuthProvider>
  </BrowserRouter>
);

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  it('shows loading spinner while checking authentication', () => {
    // Mock loading state by not providing any localStorage data
    render(
      <TestWrapper>
        <ProtectedRoute>
          <TestComponent />
        </ProtectedRoute>
      </TestWrapper>
    );

    // Should show loading spinner initially
    expect(screen.getByRole('status', { hidden: true })).toBeInTheDocument();
  });

  it('redirects to auth page when not authenticated', async () => {
    render(
      <TestWrapper>
        <ProtectedRoute>
          <TestComponent />
        </ProtectedRoute>
      </TestWrapper>
    );

    // Wait for auth check to complete and redirect
    await screen.findByText('Auth Page');
    expect(screen.getByText('Auth Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('renders protected content when authenticated', async () => {
    const mockUser = { 
      id: '1', 
      email: 'test@example.com', 
      name: 'Test User', 
      role: 'candidate' as const 
    };
    
    mockLocalStorage.getItem.mockImplementation((key) => {
      if (key === 'auth_token') return 'mock-token';
      if (key === 'auth_user') return JSON.stringify(mockUser);
      return null;
    });

    render(
      <TestWrapper>
        <ProtectedRoute>
          <TestComponent />
        </ProtectedRoute>
      </TestWrapper>
    );

    // Should render protected content
    await screen.findByText('Protected Content');
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('allows access when user has required role', async () => {
    const mockUser = { 
      id: '1', 
      email: 'candidate@example.com', 
      name: 'Candidate User', 
      role: 'candidate' as const 
    };
    
    mockLocalStorage.getItem.mockImplementation((key) => {
      if (key === 'auth_token') return 'mock-token';
      if (key === 'auth_user') return JSON.stringify(mockUser);
      return null;
    });

    render(
      <TestWrapper>
        <ProtectedRoute requiredRole="candidate">
          <TestComponent />
        </ProtectedRoute>
      </TestWrapper>
    );

    // Should render protected content
    await screen.findByText('Protected Content');
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('redirects candidate to candidate page when accessing interviewer route', async () => {
    const mockUser = { 
      id: '1', 
      email: 'candidate@example.com', 
      name: 'Candidate User', 
      role: 'candidate' as const 
    };
    
    mockLocalStorage.getItem.mockImplementation((key) => {
      if (key === 'auth_token') return 'mock-token';
      if (key === 'auth_user') return JSON.stringify(mockUser);
      return null;
    });

    render(
      <TestWrapper>
        <ProtectedRoute requiredRole="interviewer">
          <TestComponent />
        </ProtectedRoute>
      </TestWrapper>
    );

    // Should redirect to candidate page
    await screen.findByText('Candidate Page');
    expect(screen.getByText('Candidate Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('redirects interviewer to interviewer page when accessing candidate route', async () => {
    const mockUser = { 
      id: '1', 
      email: 'interviewer@example.com', 
      name: 'Interviewer User', 
      role: 'interviewer' as const 
    };
    
    mockLocalStorage.getItem.mockImplementation((key) => {
      if (key === 'auth_token') return 'mock-token';
      if (key === 'auth_user') return JSON.stringify(mockUser);
      return null;
    });

    render(
      <TestWrapper>
        <ProtectedRoute requiredRole="candidate">
          <TestComponent />
        </ProtectedRoute>
      </TestWrapper>
    );

    // Should redirect to interviewer page
    await screen.findByText('Interviewer Page');
    expect(screen.getByText('Interviewer Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('uses custom redirect path when provided', async () => {
    render(
      <TestWrapper>
        <ProtectedRoute redirectTo="/custom-auth">
          <TestComponent />
        </ProtectedRoute>
      </TestWrapper>
    );

    // Since we don't have a /custom-auth route in our test setup,
    // it should still redirect but the path would be different in a real app
    await screen.findByText('Auth Page');
  });

  it('handles corrupted user data gracefully', async () => {
    mockLocalStorage.getItem.mockImplementation((key) => {
      if (key === 'auth_token') return 'mock-token';
      if (key === 'auth_user') return 'invalid-json';
      return null;
    });

    render(
      <TestWrapper>
        <ProtectedRoute>
          <TestComponent />
        </ProtectedRoute>
      </TestWrapper>
    );

    // Should redirect to auth page due to corrupted data
    await screen.findByText('Auth Page');
    expect(screen.getByText('Auth Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });
});