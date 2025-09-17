import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAlertStreaming } from '../../hooks/useAlertStreaming';
import { useAuth } from '../../contexts/AuthContext';
import { ReportDashboard } from './ReportDashboard';
import type { InterviewSession } from '../../types';
import apiService from '../../services/apiService';

export const ReportDashboardPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { authState } = useAuth();
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch session details
  useEffect(() => {
    let active = true;
    const fetchSession = async () => {
      if (!sessionId) return;
      try {
        const data = await apiService.get<{ session: InterviewSession }>(`/api/sessions/${sessionId}`);
        if (active) {
          if (data.success) {
            setSession((data.data as any)?.session || (data.data as any) || null);
          } else {
            setError('Failed to load session');
          }
        }
      } catch (e) {
        if (active) setError('Failed to load session');
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchSession();
    return () => { active = false; };
  }, [sessionId]);

  const { alerts } = useAlertStreaming({
    authToken: authState.token || '',
    sessionId: sessionId,
    autoConnect: true,
    maxAlerts: 100,
    onError: (err) => setError(`Alert stream error: ${err.message}`)
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading report...</p>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4 space-y-4">
        <h1 className="text-xl font-semibold text-gray-800">Report Unavailable</h1>
        <p className="text-gray-600">{error || 'Session not found.'}</p>
        <button
          onClick={() => navigate(-1)}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <ReportDashboard
      sessionId={session.sessionId}
      session={session}
      alerts={alerts}
      onClose={() => navigate(-1)}
    />
  );
};

export default ReportDashboardPage;
