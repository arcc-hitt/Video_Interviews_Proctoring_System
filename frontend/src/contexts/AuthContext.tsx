import React, { createContext, useContext, useReducer, useEffect, type ReactNode } from 'react';
import type { AuthState, AuthContextType, LoginCredentials, SignupData, User } from '../types';

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
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Login failed');
      }

      // Store token and user data
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('auth_user', JSON.stringify(data.user));

      dispatch({
        type: 'AUTH_SUCCESS',
        payload: { user: data.user, token: data.token },
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Login failed';
      dispatch({ type: 'AUTH_ERROR', payload: errorMessage });
      throw err;
    }
  };

  // Signup function
  const signup = async (data: SignupData): Promise<void> => {
    dispatch({ type: 'AUTH_START' });

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.message || 'Signup failed');
      }

      // Store token and user data
      localStorage.setItem('auth_token', responseData.token);
      localStorage.setItem('auth_user', JSON.stringify(responseData.user));

      dispatch({
        type: 'AUTH_SUCCESS',
        payload: { user: responseData.user, token: responseData.token },
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