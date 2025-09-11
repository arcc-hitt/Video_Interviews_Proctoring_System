import React, { createContext, useContext, useReducer, useEffect, type ReactNode } from 'react';
import type { AuthState, AuthContextType, LoginCredentials, SignupData, User } from '../types';
import { apiService } from '../services/apiService';

// Initial auth state
const initialAuthState: AuthState = {
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
};

// Auth actions
type AuthAction =
  | { type: 'AUTH_START' }
  | { type: 'AUTH_SUCCESS'; payload: { user: User; token: string } }
  | { type: 'AUTH_ERROR'; payload: string }
  | { type: 'AUTH_LOGOUT' }
  | { type: 'CLEAR_ERROR' };

// Auth reducer
const authReducer = (state: AuthState, action: AuthAction): AuthState => {
  switch (action.type) {
    case 'AUTH_START':
      return {
        ...state,
        isLoading: true,
        error: null,
      };
    case 'AUTH_SUCCESS':
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      };
    case 'AUTH_ERROR':
      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        error: action.payload,
      };
    case 'AUTH_LOGOUT':
      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      };
    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null,
      };
    default:
      return state;
  }
};

// Create context
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Auth provider component
interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [authState, dispatch] = useReducer(authReducer, initialAuthState);

  // Setup API service unauthorized handler
  useEffect(() => {
    apiService.setUnauthorizedHandler(() => {
      dispatch({ type: 'AUTH_LOGOUT' });
    });
  }, []);

  // Check for existing token on mount
  useEffect(() => {
    const checkAuthStatus = () => {
      const token = localStorage.getItem('auth_token');
      const userStr = localStorage.getItem('auth_user');

      if (token && userStr) {
        try {
          const user = JSON.parse(userStr);
          dispatch({
            type: 'AUTH_SUCCESS',
            payload: { user, token },
          });
        } catch {
          // Invalid stored data, clear it
          localStorage.removeItem('auth_token');
          localStorage.removeItem('auth_user');
          dispatch({ type: 'AUTH_LOGOUT' });
        }
      } else {
        dispatch({ type: 'AUTH_LOGOUT' });
      }
    };

    checkAuthStatus();
  }, []);

  // Login function
  const login = async (credentials: LoginCredentials): Promise<void> => {
    dispatch({ type: 'AUTH_START' });

    try {
      console.log('Attempting login for:', credentials.email);
      
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });

      const data = await response.json();
      console.log('Login response:', { status: response.status, data });

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Login failed');
      }

      // Store token and user data (backend returns data.data.token and data.data.user)
      localStorage.setItem('auth_token', data.data.token);
      localStorage.setItem('auth_user', JSON.stringify(data.data.user));

      console.log('Login successful, user:', data.data.user);

      dispatch({
        type: 'AUTH_SUCCESS',
        payload: { user: data.data.user, token: data.data.token },
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Login failed';
      console.error('Login error:', err);
      dispatch({ type: 'AUTH_ERROR', payload: errorMessage });
      throw err;
    }
  };

  // Signup function
  const signup = async (data: SignupData): Promise<void> => {
    dispatch({ type: 'AUTH_START' });

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || responseData.message || 'Signup failed');
      }

      // Store token and user data (backend returns data.data.token and data.data.user)
      localStorage.setItem('auth_token', responseData.data.token);
      localStorage.setItem('auth_user', JSON.stringify(responseData.data.user));

      dispatch({
        type: 'AUTH_SUCCESS',
        payload: { user: responseData.data.user, token: responseData.data.token },
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Signup failed';
      dispatch({ type: 'AUTH_ERROR', payload: errorMessage });
      throw err;
    }
  };

  // Logout function
  const logout = (): void => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    dispatch({ type: 'AUTH_LOGOUT' });
  };

  // Clear error function
  const clearError = (): void => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

  const contextValue: AuthContextType = {
    authState,
    login,
    signup,
    logout,
    clearError,
  };

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};

// Custom hook to use auth context
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};