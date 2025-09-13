import React from 'react';
import { Button } from '../ui/button';
import type { User } from '../../types';

interface DashboardHeaderProps {
  user: User | null;
  selectedSession?: {
    sessionId: string;
    candidateName: string;
  } | null;
  onViewReport?: () => void;
  onLeaveSession?: () => void;
  onLogout: () => void;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  user,
  selectedSession,
  onViewReport,
  onLeaveSession,
  onLogout
}) => {
  return (
    <header className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Interviewer Dashboard
            </h1>
            <p className="text-sm text-gray-600">
              Welcome, {user?.name}
            </p>
          </div>
          <div className="flex items-center space-x-4">
            {selectedSession && (
              <>
                {onViewReport && (
                  <Button onClick={onViewReport}>
                    View Report
                  </Button>
                )}
                {onLeaveSession && (
                  <Button onClick={onLeaveSession} variant="outline">
                    Leave Session
                  </Button>
                )}
              </>
            )}
            <Button onClick={onLogout} variant="outline">
              Logout
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};