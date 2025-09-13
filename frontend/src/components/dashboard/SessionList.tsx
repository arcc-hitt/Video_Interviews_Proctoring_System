import React from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import type { InterviewSession } from '../../types';

interface SessionListProps {
  sessions: InterviewSession[];
  onJoinSession: (session: InterviewSession) => void;
  onCreateSession: () => void;
  onRefresh: () => void;
  isLoading?: boolean;
}

export const SessionList: React.FC<SessionListProps> = ({
  sessions,
  onJoinSession,
  onCreateSession,
  onRefresh,
  isLoading = false
}) => {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-500">Loading sessions...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Active Sessions</CardTitle>
          <div className="flex space-x-3">
            <Button onClick={onCreateSession} variant="default">
              Create New Session
            </Button>
            <Button onClick={onRefresh} variant="outline">
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">No active sessions found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sessions.map((session) => (
              <div
                key={session.sessionId}
                className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-medium text-gray-900">
                      {session.candidateName}
                    </h3>
                    <p className="text-sm text-gray-500">
                      Started: {new Date(session.startTime).toLocaleString()}
                    </p>
                    <p className="text-sm text-gray-500">
                      Session ID: {session.sessionId}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={session.status === 'active' ? 'default' : 'secondary'}>
                      {session.status}
                    </Badge>
                    <Button
                      onClick={() => onJoinSession(session)}
                      size="sm"
                    >
                      Monitor
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};