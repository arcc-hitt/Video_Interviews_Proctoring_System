import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { CandidateInterface } from '../CandidateInterface';

export const CandidateDashboard: React.FC = () => {
  const { authState, logout } = useAuth();
  const [sessionId, setSessionId] = useState<string>('');
  const [showInterface, setShowInterface] = useState(false);

  const handleLogout = () => {
    logout();
  };

  const handleJoinSession = () => {
    if (sessionId.trim()) {
      console.log('CandidateDashboard: Joining session with ID:', sessionId);
      setShowInterface(true);
    } else {
      console.log('CandidateDashboard: No session ID provided');
    }
  };

  const handleSessionEnd = () => {
    console.log('CandidateDashboard: handleSessionEnd called - returning to dashboard');
    console.log('CandidateDashboard: Before state change - showInterface:', showInterface, 'sessionId:', sessionId);
    setShowInterface(false);
    setSessionId('');
    console.log('CandidateDashboard: State change triggered - should return to dashboard');
  };

  // If showing the interview interface, render it
  if (showInterface) {
    console.log('CandidateDashboard: Rendering CandidateInterface with sessionId:', sessionId);
    return (
      <CandidateInterface 
        sessionId={sessionId}
        onSessionEnd={handleSessionEnd}
      />
    );
  }

  console.log('CandidateDashboard: Rendering dashboard, showInterface:', showInterface);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Candidate Dashboard
              </h1>
              <p className="text-sm text-gray-600">
                Welcome, {authState.user?.name}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              Join Interview Session
            </h2>
            <p className="text-gray-600 mb-6">
              Enter the session ID provided by your interviewer to join the interview session.
            </p>
            
            <div className="max-w-md">
              <label htmlFor="sessionId" className="block text-sm font-medium text-gray-700 mb-2">
                Session ID
              </label>
              <div className="flex gap-3">
                <input
                  type="text"
                  id="sessionId"
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value)}
                  placeholder="Enter session ID..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  onClick={handleJoinSession}
                  disabled={!sessionId.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Join Session
                </button>
              </div>
            </div>
            
            <div className="mt-8 p-4 bg-blue-50 rounded-md">
              <h3 className="text-sm font-medium text-blue-800 mb-2">
                Before You Start:
              </h3>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• Ensure your camera and microphone are working</li>
                <li>• Find a quiet, well-lit room</li>
                <li>• Remove any unauthorized items from your workspace</li>
                <li>• Test your internet connection</li>
                <li>• Have a valid government ID ready if required</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};