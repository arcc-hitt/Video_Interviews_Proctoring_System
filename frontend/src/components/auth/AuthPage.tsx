import React, { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { LoginForm } from './LoginForm';
import { SignupForm } from './SignupForm';

type AuthMode = 'login' | 'signup';

export const AuthPage: React.FC = () => {
  const { authState } = useAuth();
  const location = useLocation();
  const [authMode, setAuthMode] = useState<AuthMode>('login');

  // Get the intended destination from location state
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  // Redirect if already authenticated
  if (authState.isAuthenticated && authState.user) {
    // Redirect based on user role
    const roleBasedRedirect = authState.user.role === 'candidate' ? '/candidate' : '/interviewer';
    const redirectTo = from === '/' ? roleBasedRedirect : from;
    return <Navigate to={redirectTo} replace />;
  }

  // Handle successful authentication
  const handleAuthSuccess = () => {
    // Navigation will be handled by the redirect logic above
    // since authState.isAuthenticated will become true
  };

  // Switch between login and signup modes
  const switchToLogin = () => setAuthMode('login');
  const switchToSignup = () => setAuthMode('signup');

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Video Proctoring System
          </h1>
          <p className="text-gray-600">
            Secure interview monitoring platform
          </p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        {authMode === 'login' ? (
          <LoginForm
            onSuccess={handleAuthSuccess}
            onSwitchToSignup={switchToSignup}
          />
        ) : (
          <SignupForm
            onSuccess={handleAuthSuccess}
            onSwitchToLogin={switchToLogin}
          />
        )}
      </div>

      {/* Footer */}
      <div className="mt-8 text-center">
        <p className="text-sm text-gray-500">
          Secure • Reliable • Professional
        </p>
      </div>
    </div>
  );
};