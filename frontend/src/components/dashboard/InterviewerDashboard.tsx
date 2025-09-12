import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import type { InterviewSession } from '../../types';
import { io, Socket } from 'socket.io-client';
import { AlertPanel, AlertHistory, RealTimeAlertDisplay } from '../alerts';
import { ReportDashboard } from './ReportDashboard';
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
  const [showReportDashboard, setShowReportDashboard] = useState(false);
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [newSessionData, setNewSessionData] = useState({
    candidateName: '',
    candidateEmail: ''
  });
  const [createdSession, setCreatedSession] = useState<{sessionId: string, candidateName: string} | null>(null);
  const [isVideoStreamActive, setIsVideoStreamActive] = useState(false);
  const [videoStreamStatus, setVideoStreamStatus] = useState<'waiting' | 'connecting' | 'connected' | 'disconnected'>('waiting');
  
  // Session control state
  const [sessionControlState, setSessionControlState] = useState<{
    isSessionStarted: boolean;
    isSessionPaused: boolean;
    isRecording: boolean;
    sessionDuration: number;
  }>({
    isSessionStarted: false,
    isSessionPaused: false,
    isRecording: false,
    sessionDuration: 0
  });
  const sessionTimerRef = useRef<NodeJS.Timeout | null>(null);

  // WebSocket and WebRTC refs
  const socketRef = useRef<Socket | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

  // Alert streaming hook
  const {
    alerts,
    isConnected: alertStreamConnected,
    leaveSession: leaveAlertSession,
    sendManualFlag,
    acknowledgeAlert,
    clearAlerts
  } = useAlertStreaming({
    authToken: authState.token || '',
    sessionId: selectedSession?.sessionId,
    autoConnect: true, // Auto-connect when needed
    maxAlerts: 50,
    onError: (err) => setError(`Alert streaming error: ${err.message}`)
  });

  // Manage alert streaming connection based on session selection
  useEffect(() => {
    // Alert streaming is now handled automatically by the useAlertStreaming hook
    // with autoConnect: true and sessionId updates
    return () => {
      if (selectedSession) {
        leaveAlertSession();
      }
    };
  }, [selectedSession?.sessionId, leaveAlertSession]);

  // Fetch active sessions
  const fetchActiveSessions = useCallback(async () => {
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const response = await fetch(`${backendUrl}/api/sessions?status=active`, {
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

  // Initialize WebSocket connection for WebRTC and session management
  // Note: Alert streaming is handled separately by useAlertStreaming hook
  const initializeWebSocket = useCallback(() => {
    if (!authState.token || socketRef.current?.connected) return;

    const socket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000', {
      auth: {
        token: authState.token
      },
      transports: ['websocket', 'polling'],
      timeout: 10000,
      forceNew: false, // Reuse existing connection if available
      autoConnect: true
    });

    socket.on('connect', () => {
      console.log('Connected to WebSocket server for WebRTC');
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
    try {
      console.log('Handling video offer from:', data.fromUserId);
      setVideoStreamStatus('connecting');
      
      // Always setup a fresh peer connection for new offers
      setupPeerConnection();

      const pc = peerConnectionRef.current!;
      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socketRef.current?.emit('video_stream_answer', {
        sessionId: selectedSession?.sessionId,
        toUserId: data.fromUserId,
        answer: answer
      });
      
      console.log('Video answer sent to:', data.fromUserId);
    } catch (error) {
      console.error('Error handling video offer:', error);
      setVideoStreamStatus('disconnected');
    }
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
    // Clean up existing peer connection if it exists
    if (peerConnectionRef.current) {
      console.log('Cleaning up existing peer connection');
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ],
      iceCandidatePoolSize: 10
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && selectedSession && connectedUsers?.candidates[0]?.userId) {
        socketRef.current?.emit('video_stream_ice_candidate', {
          sessionId: selectedSession.sessionId,
          toUserId: connectedUsers.candidates[0].userId,
          candidate: event.candidate
        });
      }
    };

    pc.ontrack = (event) => {
      console.log('Received remote stream');
      if (videoRef.current && event.streams[0]) {
        // Stop any existing video playback to prevent conflicts
        if (videoRef.current.srcObject) {
          videoRef.current.pause();
          videoRef.current.srcObject = null;
        }
        
        // Set the new stream
        videoRef.current.srcObject = event.streams[0];
        setIsVideoStreamActive(true);
        setVideoStreamStatus('connected');
        
        // Play the video with error handling
        const playPromise = videoRef.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log('Video playback started successfully');
            })
            .catch((error) => {
              console.warn('Video playback failed:', error);
              // Try again after a short delay
              setTimeout(() => {
                if (videoRef.current && videoRef.current.srcObject) {
                  videoRef.current.play().catch(console.error);
                }
              }, 100);
            });
        }
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('Peer connection state:', pc.connectionState);
      
      if (pc.connectionState === 'connecting') {
        setVideoStreamStatus('connecting');
      } else if (pc.connectionState === 'connected') {
        setVideoStreamStatus('connected');
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        console.log('Peer connection failed/disconnected, cleaning up');
        setIsVideoStreamActive(false);
        setVideoStreamStatus('disconnected');
        if (videoRef.current) {
          videoRef.current.pause();
          videoRef.current.srcObject = null;
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState);
      
      // Handle ICE connection failures
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        console.log('ICE connection failed/disconnected');
        setIsVideoStreamActive(false);
        setVideoStreamStatus('disconnected');
      } else if (pc.iceConnectionState === 'connected') {
        setIsVideoStreamActive(true);
        setVideoStreamStatus('connected');
      }
    };

    peerConnectionRef.current = pc;
  };

  // Join session for monitoring
  const joinSession = async (session: InterviewSession) => {
    console.log('Joining session for monitoring:', session.sessionId);
    
    setSelectedSession(session);
    clearAlerts();
    setSessionNotes([]);
    setIsVideoStreamActive(false);
    setVideoStreamStatus('waiting');

    // Only use the regular WebSocket for WebRTC and general session management
    // The alert streaming will handle detection events automatically
    if (socketRef.current) {
      socketRef.current.emit('join_session', {
        sessionId: session.sessionId,
        role: 'interviewer'
      });
    }

    // The alert streaming connection will automatically connect and join the session
    // due to the sessionId being set in selectedSession, which triggers the useEffect
    
    // Fetch session details
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const response = await fetch(`${backendUrl}/api/sessions/${session.sessionId}`, {
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
    setIsVideoStreamActive(false);
    setVideoStreamStatus('waiting');

    // Reset session control state
    setSessionControlState({
      isSessionStarted: false,
      isSessionPaused: false,
      isRecording: false,
      sessionDuration: 0
    });

    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
  };

  // End session
  const endSession = async () => {
    if (!selectedSession) return;

    try {
      // Notify candidate via WebSocket first
      if (socketRef.current) {
        socketRef.current.emit('interviewer_session_control', {
          sessionId: selectedSession.sessionId,
          action: 'end',
          timestamp: new Date().toISOString()
        });
      }

      // Then update backend
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const response = await fetch(`${backendUrl}/api/sessions/${selectedSession.sessionId}/end`, {
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
      // Notify candidate via WebSocket first
      if (socketRef.current) {
        socketRef.current.emit('interviewer_session_control', {
          sessionId: selectedSession.sessionId,
          action: 'terminate',
          timestamp: new Date().toISOString()
        });
      }

      // Then update backend
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const response = await fetch(`${backendUrl}/api/sessions/${selectedSession.sessionId}/terminate`, {
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

  // Start interview session (interviewer controls)
  const startInterviewSession = async () => {
    if (!selectedSession || sessionControlState.isSessionStarted) return;

    try {
      setSessionControlState(prev => ({
        ...prev,
        isSessionStarted: true,
        isSessionPaused: false
      }));

      // Start session timer
      sessionTimerRef.current = setInterval(() => {
        setSessionControlState(prev => ({
          ...prev,
          sessionDuration: prev.sessionDuration + 1
        }));
      }, 1000);

      // Notify candidate via WebSocket
      if (socketRef.current) {
        socketRef.current.emit('interviewer_session_control', {
          sessionId: selectedSession.sessionId,
          action: 'start',
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Error starting interview session:', error);
      setError('Failed to start interview session');
    }
  };

  // Pause interview session
  const pauseInterviewSession = () => {
    if (!selectedSession || !sessionControlState.isSessionStarted) return;

    setSessionControlState(prev => ({
      ...prev,
      isSessionPaused: true
    }));

    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }

    // Notify candidate
    if (socketRef.current) {
      socketRef.current.emit('interviewer_session_control', {
        sessionId: selectedSession.sessionId,
        action: 'pause',
        timestamp: new Date().toISOString()
      });
    }
  };

  // Resume interview session
  const resumeInterviewSession = () => {
    if (!selectedSession || !sessionControlState.isSessionStarted || !sessionControlState.isSessionPaused) return;

    setSessionControlState(prev => ({
      ...prev,
      isSessionPaused: false
    }));

    // Resume timer
    sessionTimerRef.current = setInterval(() => {
      setSessionControlState(prev => ({
        ...prev,
        sessionDuration: prev.sessionDuration + 1
      }));
    }, 1000);

    // Notify candidate
    if (socketRef.current) {
      socketRef.current.emit('interviewer_session_control', {
        sessionId: selectedSession.sessionId,
        action: 'resume',
        timestamp: new Date().toISOString()
      });
    }
  };

  // Start recording
  const startRecording = () => {
    if (!selectedSession) return;

    setSessionControlState(prev => ({
      ...prev,
      isRecording: true
    }));

    // Notify candidate and backend
    if (socketRef.current) {
      socketRef.current.emit('interviewer_recording_control', {
        sessionId: selectedSession.sessionId,
        action: 'start_recording',
        timestamp: new Date().toISOString()
      });
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (!selectedSession) return;

    setSessionControlState(prev => ({
      ...prev,
      isRecording: false
    }));

    // Notify candidate and backend
    if (socketRef.current) {
      socketRef.current.emit('interviewer_recording_control', {
        sessionId: selectedSession.sessionId,
        action: 'stop_recording',
        timestamp: new Date().toISOString()
      });
    }
  };

  // Add session note
  const addSessionNote = async () => {
    if (!newNote.trim() || !selectedSession) return;

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const response = await fetch(`${backendUrl}/api/sessions/${selectedSession.sessionId}/observations`, {
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

  // Create new session
  const createNewSession = async () => {
    if (!newSessionData.candidateName.trim()) {
      setError('Candidate name is required');
      return;
    }

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const response = await fetch(`${backendUrl}/api/sessions/create`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authState.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          candidateName: newSessionData.candidateName,
          candidateEmail: newSessionData.candidateEmail || undefined,
          interviewerUserId: authState.user?.userId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create session');
      }

      const data = await response.json();
      if (data.success) {
        setCreatedSession({
          sessionId: data.data.sessionId,
          candidateName: data.data.candidateName
        });
        setNewSessionData({ candidateName: '', candidateEmail: '' });
        fetchActiveSessions(); // Refresh the sessions list
      } else {
        throw new Error(data.message || 'Failed to create session');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
    }
  };

  const resetCreateSession = () => {
    setShowCreateSession(false);
    setCreatedSession(null);
    setNewSessionData({ candidateName: '', candidateEmail: '' });
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
    // Initialize WebRTC WebSocket connection (separate from alert streaming)
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

  // Show report dashboard if requested
  if (showReportDashboard && selectedSession) {
    return (
      <ReportDashboard
        sessionId={selectedSession.sessionId}
        session={selectedSession}
        alerts={alerts}
        onClose={() => setShowReportDashboard(false)}
      />
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
                <>
                  <button
                    onClick={() => setShowReportDashboard(true)}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-blue-600 rounded-md hover:bg-blue-700"
                  >
                    View Report
                  </button>
                  <button
                    onClick={leaveSession}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Leave Session
                  </button>
                </>
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
                <div className="flex space-x-3">
                  <button
                    onClick={() => setShowCreateSession(true)}
                    className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
                  >
                    Create New Session
                  </button>
                  <button
                    onClick={fetchActiveSessions}
                    className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100"
                  >
                    Refresh
                  </button>
                </div>
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
              {/* Session Status Bar */}
              <div className="lg:col-span-3 mb-4">
                <div className="bg-white shadow rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div>
                        <h3 className="text-sm font-medium text-gray-900">Interview Status</h3>
                        <div className="flex items-center mt-1">
                          {sessionControlState.isSessionStarted ? (
                            sessionControlState.isSessionPaused ? (
                              <div className="flex items-center">
                                <div className="w-2 h-2 bg-yellow-500 rounded-full mr-2"></div>
                                <span className="text-sm text-yellow-700">Paused</span>
                              </div>
                            ) : (
                              <div className="flex items-center">
                                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse mr-2"></div>
                                <span className="text-sm text-green-700">In Progress</span>
                              </div>
                            )
                          ) : (
                            <div className="flex items-center">
                              <div className="w-2 h-2 bg-gray-400 rounded-full mr-2"></div>
                              <span className="text-sm text-gray-600">Not Started</span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {sessionControlState.isSessionStarted && (
                        <div>
                          <h3 className="text-sm font-medium text-gray-900">Duration</h3>
                          <div className="text-sm text-gray-600 mt-1">
                            {Math.floor(sessionControlState.sessionDuration / 60)}:
                            {(sessionControlState.sessionDuration % 60).toString().padStart(2, '0')}
                          </div>
                        </div>
                      )}
                      
                      <div>
                        <h3 className="text-sm font-medium text-gray-900">Recording</h3>
                        <div className="flex items-center mt-1">
                          {sessionControlState.isRecording ? (
                            <div className="flex items-center">
                              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse mr-2"></div>
                              <span className="text-sm text-red-700">Recording</span>
                            </div>
                          ) : (
                            <div className="flex items-center">
                              <div className="w-2 h-2 bg-gray-400 rounded-full mr-2"></div>
                              <span className="text-sm text-gray-600">Not Recording</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Video Stream */}
              <div className="lg:col-span-2">
                <div className="bg-white shadow rounded-lg p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium text-gray-900">
                      Candidate Video Stream
                    </h3>
                    <div className="flex space-x-2">
                      {/* Session Controls */}
                      {!sessionControlState.isSessionStarted ? (
                        <button
                          onClick={startInterviewSession}
                          className="px-3 py-1 text-sm font-medium text-white bg-green-600 rounded hover:bg-green-700"
                        >
                          Start Interview
                        </button>
                      ) : (
                        <>
                          {!sessionControlState.isSessionPaused ? (
                            <button
                              onClick={pauseInterviewSession}
                              className="px-3 py-1 text-sm font-medium text-white bg-yellow-600 rounded hover:bg-yellow-700"
                            >
                              Pause
                            </button>
                          ) : (
                            <button
                              onClick={resumeInterviewSession}
                              className="px-3 py-1 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
                            >
                              Resume
                            </button>
                          )}
                          
                          {/* Recording Controls */}
                          {!sessionControlState.isRecording ? (
                            <button
                              onClick={startRecording}
                              className="px-3 py-1 text-sm font-medium text-white bg-red-600 rounded hover:bg-red-700"
                            >
                              Start Recording
                            </button>
                          ) : (
                            <button
                              onClick={stopRecording}
                              className="px-3 py-1 text-sm font-medium text-white bg-orange-600 rounded hover:bg-orange-700"
                            >
                              Stop Recording
                            </button>
                          )}
                        </>
                      )}
                      
                      {/* Session Management */}
                      <button
                        onClick={endSession}
                        className="px-3 py-1 text-sm font-medium text-white bg-gray-600 rounded hover:bg-gray-700"
                      >
                        End Session
                      </button>
                      <button
                        onClick={terminateSession}
                        className="px-3 py-1 text-sm font-medium text-white bg-red-800 rounded hover:bg-red-900"
                      >
                        Terminate
                      </button>
                    </div>
                  </div>

                  <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden relative">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover"
                    />
                    
                    {/* Video Stream Placeholder/Status */}
                    {!isVideoStreamActive && (
                      <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                        <div className="text-center text-white">
                          {videoStreamStatus === 'waiting' && (
                            <>
                              <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center border-2 border-gray-600 rounded-full">
                                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              </div>
                              <h3 className="text-lg font-medium mb-2">Waiting for Candidate</h3>
                              <p className="text-gray-400 text-sm">
                                The candidate needs to start their camera to begin video streaming
                              </p>
                            </>
                          )}
                          
                          {videoStreamStatus === 'connecting' && (
                            <>
                              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                              <h3 className="text-lg font-medium mb-2">Connecting...</h3>
                              <p className="text-gray-400 text-sm">
                                Establishing video connection with candidate
                              </p>
                            </>
                          )}
                          
                          {videoStreamStatus === 'disconnected' && (
                            <>
                              <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center border-2 border-red-600 rounded-full">
                                <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                </svg>
                              </div>
                              <h3 className="text-lg font-medium mb-2 text-red-400">Connection Lost</h3>
                              <p className="text-gray-400 text-sm">
                                Video connection with candidate has been lost. Waiting for reconnection...
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* Live indicator when streaming */}
                    {isVideoStreamActive && videoStreamStatus === 'connected' && (
                      <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1 bg-red-600 text-white rounded-full text-sm">
                        <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                        LIVE
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
                    <div>
                      <span className="font-medium">Video Stream:</span>
                      <span className={`ml-2 px-2 py-1 text-xs rounded-full ${
                        videoStreamStatus === 'connected' 
                          ? 'bg-green-100 text-green-800'
                          : videoStreamStatus === 'connecting'
                          ? 'bg-yellow-100 text-yellow-800'
                          : videoStreamStatus === 'disconnected'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                        }`}>
                        {videoStreamStatus === 'connected' ? 'Live' : 
                         videoStreamStatus === 'connecting' ? 'Connecting' :
                         videoStreamStatus === 'disconnected' ? 'Disconnected' : 'Waiting'}
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

      {/* Real-time Alert Display Overlay */}
      {selectedSession && (
        <RealTimeAlertDisplay
          alerts={alerts.slice(0, 3)} // Show only the 3 most recent alerts as overlay
          onAlertDismiss={(alertId) => {
            // Just acknowledge the alert
            acknowledgeAlert(alertId);
          }}
          onAlertAcknowledge={acknowledgeAlert}
          autoHideAfter={8}
          maxDisplayAlerts={3}
          showConfidence={true}
        />
      )}

      {/* Create Session Modal */}
      {showCreateSession && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Create New Interview Session
            </h3>
            
            <div className="space-y-4">
              <div>
                <label htmlFor="candidateName" className="block text-sm font-medium text-gray-700 mb-2">
                  Candidate Name *
                </label>
                <input
                  type="text"
                  id="candidateName"
                  value={newSessionData.candidateName}
                  onChange={(e) => setNewSessionData(prev => ({ ...prev, candidateName: e.target.value }))}
                  placeholder="Enter candidate name..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <div>
                <label htmlFor="candidateEmail" className="block text-sm font-medium text-gray-700 mb-2">
                  Candidate Email (Optional)
                </label>
                <input
                  type="email"
                  id="candidateEmail"
                  value={newSessionData.candidateEmail}
                  onChange={(e) => setNewSessionData(prev => ({ ...prev, candidateEmail: e.target.value }))}
                  placeholder="Enter candidate email..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={resetCreateSession}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={createNewSession}
                disabled={!newSessionData.candidateName.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Session Created Success Modal */}
      {createdSession && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg mx-4">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Session Created Successfully!
              </h3>
              
              <p className="text-sm text-gray-600 mb-4">
                Share the session ID below with <strong>{createdSession.candidateName}</strong> to begin the interview.
              </p>
              
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Session ID
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    readOnly
                    value={createdSession.sessionId}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-white text-sm font-mono"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(createdSession.sessionId);
                      // You might want to show a toast notification here
                    }}
                    className="px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100"
                  >
                    Copy
                  </button>
                </div>
              </div>
              
              <p className="text-xs text-gray-500 mb-6">
                The candidate can use this ID to join the interview session from their dashboard.
              </p>
              
              <button
                onClick={resetCreateSession}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};