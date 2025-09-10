import React from 'react';
import { useAuth } from '../../contexts/AuthContext';

export const InterviewerDashboard: React.FC = () => {
  const { authState, logout } = useAuth();

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Interviewer Dashboard
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
              Active Sessions
            </h2>
            <p className="text-gray-600">
              Your monitoring interface will be available here. This is a placeholder for the interviewer monitoring interface that will be implemented in future tasks.
            </p>
            
            <div className="mt-6 p-4 bg-green-50 rounded-md">
              <h3 className="text-sm font-medium text-green-800 mb-2">
                Next Steps:
              </h3>
              <ul className="text-sm text-green-700 space-y-1">
                <li>• Real-time video monitoring interface</li>
                <li>• Alert system for suspicious activities</li>
                <li>• Report generation and export</li>
                <li>• Session management controls</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};