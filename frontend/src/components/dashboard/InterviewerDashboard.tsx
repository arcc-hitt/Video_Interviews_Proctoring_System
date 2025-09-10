import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import type { InterviewSession } from '../../types';
import { io, Socket } from 'socket.io-client';
import { AlertPanel, AlertHistory } from '../alerts';
import { useAlertStreaming } from '../../hooks/useAlertStreaming';

interface SessionNote {
  id: string;
  timestamp: Date;
  note: string;
  severity: 'low' | 'medium' | 'high';
}

interface ConnectedUsers {
  candidates: Array<{
    userId: string;
    name: string;
    email: string;
    connectedAt: Date;
  }>;
  interviewers: Array<{
    userId: string;
    name: string;
    email: string;
    connectedAt: Date;
  }>;
}

export const InterviewerDashboard: React.FC = () => {
  const { authState, logout } = useAuth();
  const [activeSessions, setActiveSessions] = useState<InterviewSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<InterviewSession | null>(null);
  const [connectedUsers, setConnectedUsers] = useState<ConnectedUsers | null>(null);
  const [sessionNotes, setSessionNotes] = useState<SessionNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const [noteSeverity, setNoteSeverity] = useState<'low' | 'medium' | 'high'>('medium');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAlertHistory, setShowAlertHistory] = useState(false);

  // WebSocket and WebRTC refs
  const socketRef = useRef<Socket | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

  // Alert streaming hook
  const {
    alerts,
    isConnected: alertStreamConnected,
    joinSession: joinAlertSession,
    leaveSession: leaveAlertSession,
    sendManualFlag,
    acknowledgeAlert,
    clearAlerts
  } = useAlertStreaming({
    authToken: authState.token || '',
    sessionId: selectedSession?.sessionId,
    autoConnect: true,
    maxAlerts: 50,
    onError: (err) => setError(`Alert streaming error: ${err.message}`)
  });

  // Fetch active sessions
  const fetchActiveSessions = useCallback(async () => {
    try {
      const response = await fetch('/api/sessions?status=active', {
        headers: {
          'Authorization': `Bearer ${authState.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch sessions');
      }

      const data = await response.json();
      if (data.success) {
        setActiveSessions(data.data.sessions || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch sessions');
    } finally {
      setIsLoading(false);
    }
  }, [authState.token]);

  // Initialize WebSocket connection
  const initializeWebSocket = useCallback(() => {
    if (!authState.token) return;

    const socket = io(process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000', {
      auth: {
        token: authState.token
      },
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
      console.log('Connected to WebSocket server');
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from WebSocket server');
    });

    socket.on('session_joined', (data) => {
      setConnectedUsers(data.connectedUsers);
    });

    socket.on('session_left', (data) => {
      setConnectedUsers(data.connectedUsers);
    });

    // Note: Alert handling is now managed by useAlertStreaming hook

    socket.on('session_status_update', (data) => {
      setActiveSessions(prev =>
        prev.map(session =>
          session.sessionId === data.sessionId
            ? { ...session, status: data.status }
            : session
        )
      );
    });

    // WebRTC signaling events
    socket.on('video_stream_offer', handleVideoOffer);
    socket.on('video_stream_answer', handleVideoAnswer);
    socket.on('video_stream_ice_candidate', handleIceCandidate);

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [authState.token]);

  // WebRTC handlers
  const handleVideoOffer = async (data: any) => {
    if (!peerConnectionRef.current) {
      setupPeerConnection();
    }

    const pc = peerConnectionRef.current!;
    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socketRef.current?.emit('video_stream_answer', {
      sessionId: selectedSession?.sessionId,
      toUserId: data.fromUserId,
      answer: answer
    });
  };

  const handleVideoAnswer = async (data: any) => {
    if (peerConnectionRef.current) {
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
  };

  const handleIceCandidate = async (data: any) => {
    if (peerConnectionRef.current) {
      await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  };

  const setupPeerConnection = () => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && selectedSession) {
        socketRef.current?.emit('video_stream_ice_candidate', {
          sessionId: selectedSession.sessionId,
          toUserId: connectedUsers?.candidates[0]?.userId,
          candidate: event.candidate
        });
      }
    };

    pc.ontrack = (event) => {
      if (videoRef.current) {
        videoRef.current.srcObject = event.streams[0];
      }
    };

    peerConnectionRef.current = pc;
  };

  // Join session for monitoring
  const joinSession = async (session: InterviewSession) => {
    if (!socketRef.current) return;

    setSelectedSession(session);
    clearAlerts();
    setSessionNotes([]);

    socketRef.current.emit('join_session', {
      sessionId: session.sessionId,
      role: 'interviewer'
    });

    // Join alert streaming for this session
    joinAlertSession(session.sessionId);

    // Fetch session details
    try {
      const response = await fetch(`/api/sessions/${session.sessionId}`, {
        headers: {
          'Authorization': `Bearer ${authState.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setConnectedUsers(data.data.connectedUsers);
        }
      }
    } catch (err) {
      console.error('Failed to fetch session details:', err);
    }
  };

  // Leave current session
  const leaveSession = () => {
    if (selectedSession && socketRef.current) {
      socketRef.current.emit('leave_session', selectedSession.sessionId);
    }

    // Leave alert streaming
    leaveAlertSession();

    setSelectedSession(null);
    setConnectedUsers(null);
    clearAlerts();
    setSessionNotes([]);
    setShowAlertHistory(false);

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
  };

  // End session
  const endSession = async () => {
    if (!selectedSession) return;

    try {
      const response = await fetch(`/api/sessions/${selectedSession.sessionId}/end`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authState.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        leaveSession();
        fetchActiveSessions();
      }
    } catch (err) {
      setError('Failed to end session');
    }
  };

  // Terminate session
  const terminateSession = async () => {
    if (!selectedSession) return;

    try {
      const response = await fetch(`/api/sessions/${selectedSession.sessionId}/terminate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authState.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        leaveSession();
        fetchActiveSessions();
      }
    } catch (err) {
      setError('Failed to terminate session');
    }
  };

  // Add session note
  const addSessionNote = async () => {
    if (!newNote.trim() || !selectedSession) return;

    try {
      const response = await fetch(`/api/sessions/${selectedSession.sessionId}/observations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authState.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          observationType: 'manual_note',
          description: newNote,
          severity: noteSeverity,
          flagged: noteSeverity === 'high'
        })
      });

      if (response.ok) {
        const note: SessionNote = {
          id: Date.now().toString(),
          timestamp: new Date(),
          note: newNote,
          severity: noteSeverity
        };
        setSessionNotes(prev => [note, ...prev]);

        // Also send as manual flag for real-time alerts
        sendManualFlag(newNote, noteSeverity);

        setNewNote('');
      }
    } catch (err) {
      setError('Failed to add note');
    }
  };

  // Helper functions
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'low':
        return 'text-yellow-600 bg-yellow-50';
      case 'medium':
        return 'text-orange-600 bg-orange-50';
      case 'high':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString();
  };

  // Effects
  useEffect(() => {
    fetchActiveSessions();
    const cleanup = initializeWebSocket();

    return cleanup;
  }, [fetchActiveSessions, initializeWebSocket]);

  const handleLogout = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    logout();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

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
            <div className="flex items-center space-x-4">
              {selectedSession && (
                <button
                  onClick={leaveSession}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Leave Session
                </button>
              )}
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <p className="text-red-800">{error}</p>
            <button
              onClick={() => setError(null)}
              className="mt-2 text-sm text-red-600 hover:text-red-800"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {!selectedSession ? (
            // Session List View
            <div className="bg-white shadow rounded-lg p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-medium text-gray-900">
                  Active Sessions
                </h2>
                <button
                  onClick={fetchActiveSessions}
                  className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100"
                >
                  Refresh
                </button>
              </div>

              {activeSessions.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">No active sessions found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {activeSessions.map((session) => (
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
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${session.status === 'active'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                            }`}>
                            {session.status}
                          </span>
                          <button
                            onClick={() => joinSession(session)}
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                          >
                            Monitor
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            // Session Monitoring View
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Video Stream */}
              <div className="lg:col-span-2">
                <div className="bg-white shadow rounded-lg p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium text-gray-900">
                      Candidate Video Stream
                    </h3>
                    <div className="flex space-x-2">
                      <button
                        onClick={endSession}
                        className="px-3 py-1 text-sm font-medium text-white bg-green-600 rounded hover:bg-green-700"
                      >
                        End Session
                      </button>
                      <button
                        onClick={terminateSession}
                        className="px-3 py-1 text-sm font-medium text-white bg-red-600 rounded hover:bg-red-700"
                      >
                        Terminate
                      </button>
                    </div>
                  </div>

                  <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover"
                    />
                    {!videoRef.current?.srcObject && (
                      <div className="flex items-center justify-center h-full">
                        <p className="text-white">Waiting for video stream...</p>
                      </div>
                    )}
                  </div>

                  {/* Session Info */}
                  <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Candidate:</span> {selectedSession.candidateName}
                    </div>
                    <div>
                      <span className="font-medium">Started:</span> {formatTime(new Date(selectedSession.startTime))}
                    </div>
                    <div>
                      <span className="font-medium">Status:</span>
                      <span className={`ml-2 px-2 py-1 text-xs rounded-full ${selectedSession.status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                        }`}>
                        {selectedSession.status}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium">Connected Users:</span>
                      {connectedUsers ? (
                        <span className="ml-2">
                          {connectedUsers.candidates.length} candidate(s), {connectedUsers.interviewers.length} interviewer(s)
                        </span>
                      ) : (
                        <span className="ml-2">Loading...</span>
                      )}
                    </div>
                    <div>
                      <span className="font-medium">Alert Stream:</span>
                      <span className={`ml-2 px-2 py-1 text-xs rounded-full ${alertStreamConnected
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                        }`}>
                        {alertStreamConnected ? 'Connected' : 'Disconnected'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Alerts and Controls */}
              <div className="space-y-6">
                {/* Real-time Alerts */}
                {!showAlertHistory ? (
                  <AlertPanel
                    alerts={alerts}
                    onAlertAcknowledge={acknowledgeAlert}
                    onManualFlag={sendManualFlag}
                    sessionId={selectedSession?.sessionId}
                    className="h-96"
                  />
                ) : (
                  <AlertHistory
                    sessionId={selectedSession?.sessionId || ''}
                    alerts={alerts}
                    className="h-96"
                  />
                )}

                {/* Toggle between live alerts and history */}
                <div className="flex justify-center">
                  <button
                    onClick={() => setShowAlertHistory(!showAlertHistory)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
                  >
                    {showAlertHistory ? 'Show Live Alerts' : 'Show Alert History'}
                  </button>
                </div>

                {/* Session Notes */}
                <div className="bg-white shadow rounded-lg p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    Session Notes
                  </h3>

                  {/* Add Note Form */}
                  <div className="space-y-3 mb-4">
                    <textarea
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Add a note about the candidate's behavior..."
                      className="w-full p-2 border border-gray-300 rounded-md text-sm"
                      rows={3}
                    />
                    <div className="flex justify-between items-center">
                      <select
                        value={noteSeverity}
                        onChange={(e) => setNoteSeverity(e.target.value as 'low' | 'medium' | 'high')}
                        className="text-sm border border-gray-300 rounded-md px-2 py-1"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                      <button
                        onClick={addSessionNote}
                        disabled={!newNote.trim()}
                        className="px-3 py-1 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:bg-gray-400"
                      >
                        Add Note
                      </button>
                    </div>
                  </div>

                  {/* Notes List */}
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {sessionNotes.length === 0 ? (
                      <p className="text-gray-500 text-sm">No notes yet</p>
                    ) : (
                      sessionNotes.map((note) => (
                        <div
                          key={note.id}
                          className={`p-2 rounded-md ${getSeverityColor(note.severity)}`}
                        >
                          <p className="text-sm">{note.note}</p>
                          <p className="text-xs mt-1">{formatTime(note.timestamp)}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};