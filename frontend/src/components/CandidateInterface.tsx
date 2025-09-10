import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { VideoStreamComponent } from './VideoStreamComponent';
import { useFaceDetection } from '../hooks/useFaceDetection';
import { useComputerVision } from '../hooks/useComputerVision';
import { io } from 'socket.io-client';
import type { InterviewSession, DetectionEvent } from '../types';

interface CandidateInterfaceProps {
  sessionId?: string;
  onSessionEnd?: () => void;
}

interface SessionState {
  session: InterviewSession | null;
  isSessionActive: boolean;
  isInitializing: boolean;
  error: string | null;
}

interface SessionControls {
  canStart: boolean;
  canPause: boolean;
  canEnd: boolean;
  isPaused: boolean;
}

export const CandidateInterface: React.FC<CandidateInterfaceProps> = ({
  sessionId: propSessionId,
  onSessionEnd
}) => {
  const { authState } = useAuth();
  const [sessionState, setSessionState] = useState<SessionState>({
    session: null,
    isSessionActive: false,
    isInitializing: false,
    error: null
  });

  const [sessionControls, setSessionControls] = useState<SessionControls>({
    canStart: true,
    canPause: false,
    canEnd: false,
    isPaused: false
  });

  const [detectionEvents, setDetectionEvents] = useState<DetectionEvent[]>([]);
  const [sessionDuration, setSessionDuration] = useState(0);
  const sessionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const wsRef = useRef<any>(null); // Using any for Socket.IO compatibility

  // Computer vision hooks
  const { processFrame: processFaceFrame, isInitialized: isFaceDetectionInitialized, cleanup: cleanupFaceDetection } = useFaceDetection({
    enabled: true,
    onDetectionEvent: handleDetectionEvent,
    sessionId: sessionState.session?.sessionId,
    candidateId: sessionState.session?.candidateId
  });

  const { processFrame: processComputerVisionFrame, isInitialized: isComputerVisionInitialized, cleanup: cleanupComputerVision } = useComputerVision({
    enabled: true,
    sessionId: sessionState.session?.sessionId,
    candidateId: sessionState.session?.candidateId,
    onDetectionEvent: handleDetectionEvent
  });

  // Check if detection services are running
  const isDetecting = isFaceDetectionInitialized && isComputerVisionInitialized;

  // Handle detection events
  function handleDetectionEvent(event: DetectionEvent) {
    setDetectionEvents(prev => [...prev, event]);
    
    // Send event to backend
    sendEventToBackend(event);
    
    // Send event via WebSocket for real-time monitoring
    if (wsRef.current && wsRef.current.connected) {
      wsRef.current.emit('detection_event', {
        sessionId: event.sessionId,
        eventType: event.eventType,
        timestamp: event.timestamp,
        duration: event.duration,
        confidence: event.confidence,
        metadata: event.metadata
      });
    }
  }

  // Send detection event to backend API
  const sendEventToBackend = async (event: DetectionEvent) => {
    try {
      const response = await fetch('/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authState.token}`
        },
        body: JSON.stringify(event)
      });

      if (!response.ok) {
        console.error('Failed to send event to backend:', response.statusText);
      }
    } catch (error) {
      console.error('Error sending event to backend:', error);
    }
  };

  // Initialize session
  const initializeSession = useCallback(async () => {
    if (!authState.isAuthenticated || !authState.user) {
      setSessionState(prev => ({
        ...prev,
        error: 'User not authenticated'
      }));
      return;
    }

    setSessionState(prev => ({ ...prev, isInitializing: true, error: null }));

    try {
      let sessionId = propSessionId;

      // If no session ID provided, check for existing active session or create new one
      if (!sessionId) {
        // For candidates, we might need to join an existing session
        // This would typically be handled by the interviewer creating the session
        // and providing the session ID to the candidate
        setSessionState(prev => ({
          ...prev,
          isInitializing: false,
          error: 'No session ID provided. Please contact your interviewer.'
        }));
        return;
      }

      // Fetch session details
      const response = await fetch(`/api/sessions/${sessionId}`, {
        headers: {
          'Authorization': `Bearer ${authState.token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch session details');
      }

      const sessionData = await response.json();
      
      if (!sessionData.success) {
        throw new Error(sessionData.message || 'Failed to fetch session');
      }

      const session: InterviewSession = sessionData.data;

      setSessionState({
        session,
        isSessionActive: session.status === 'active',
        isInitializing: false,
        error: null
      });

      // Update session controls
      setSessionControls({
        canStart: session.status === 'active',
        canPause: false,
        canEnd: false,
        isPaused: false
      });

      // Initialize WebSocket connection for real-time communication
      initializeWebSocket(sessionId);

    } catch (error) {
      console.error('Error initializing session:', error);
      setSessionState(prev => ({
        ...prev,
        isInitializing: false,
        error: error instanceof Error ? error.message : 'Failed to initialize session'
      }));
    }
  }, [authState, propSessionId]);

  // Initialize WebSocket connection
  const initializeWebSocket = (sessionId: string) => {
    try {
      // Use Socket.IO instead of raw WebSocket for consistency
      const socket = io(process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000', {
        auth: {
          token: authState.token
        },
        transports: ['websocket', 'polling'],
        timeout: 10000,
        forceNew: true
      });

      socket.on('connect', () => {
        console.log('Socket.IO connected');
        wsRef.current = socket as any; // Store socket reference for compatibility
        
        // Join session as candidate
        socket.emit('join_session', {
          sessionId,
          role: 'candidate'
        });
      });

      socket.on('disconnect', () => {
        console.log('Socket.IO disconnected');
        wsRef.current = null;
      });

      socket.on('session_joined', (data) => {
        console.log('Joined session:', data);
      });

      socket.on('session_status_update', (data) => {
        handleWebSocketMessage({ type: 'session_status_update', data });
      });

      socket.on('interviewer_message', (data) => {
        handleWebSocketMessage({ type: 'interviewer_message', data });
      });

      socket.on('error', (error) => {
        console.error('Socket.IO error:', error);
      });

    } catch (error) {
      console.error('Error initializing WebSocket:', error);
    }
  };

  // Handle WebSocket messages
  const handleWebSocketMessage = (message: any) => {
    switch (message.type) {
      case 'session_status_update':
        if (message.data.status !== 'active') {
          handleSessionEnd();
        }
        break;
      case 'interviewer_message':
        // Handle messages from interviewer if needed
        console.log('Message from interviewer:', message.data);
        break;
      default:
        console.log('Unknown WebSocket message:', message);
    }
  };

  // Start interview session
  const startSession = async () => {
    if (!sessionState.session) return;

    try {
      setSessionControls(prev => ({
        ...prev,
        canStart: false,
        canPause: true,
        canEnd: true,
        isPaused: false
      }));

      // Computer vision detection is automatically started when hooks are initialized

      // Start session timer
      sessionTimerRef.current = setInterval(() => {
        setSessionDuration(prev => prev + 1);
      }, 1000);

      // Notify backend that session has started
      if (wsRef.current && wsRef.current.connected) {
        wsRef.current.emit('session_status_update', {
          sessionId: sessionState.session.sessionId,
          status: 'active'
        });
      }

    } catch (error) {
      console.error('Error starting session:', error);
      setSessionState(prev => ({
        ...prev,
        error: 'Failed to start session'
      }));
    }
  };

  // Pause session
  const pauseSession = () => {
    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }

    // Detection will be paused by not processing frames

    setSessionControls(prev => ({
      ...prev,
      canStart: true,
      canPause: false,
      canEnd: true,
      isPaused: true
    }));

    // Notify via WebSocket
    if (wsRef.current && wsRef.current.connected) {
      wsRef.current.emit('session_status_update', {
        sessionId: sessionState.session?.sessionId,
        status: 'paused'
      });
    }
  };

  // End session
  const endSession = async () => {
    if (!sessionState.session) return;

    try {
      // Stop detection and timer
      cleanupFaceDetection();
      cleanupComputerVision();
      if (sessionTimerRef.current) {
        clearInterval(sessionTimerRef.current);
        sessionTimerRef.current = null;
      }

      // Update session status on backend
      const response = await fetch(`/api/sessions/${sessionState.session.sessionId}/end`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authState.token}`
        }
      });

      if (response.ok) {
        handleSessionEnd();
      } else {
        throw new Error('Failed to end session');
      }

    } catch (error) {
      console.error('Error ending session:', error);
      setSessionState(prev => ({
        ...prev,
        error: 'Failed to end session'
      }));
    }
  };

  // Handle session end
  const handleSessionEnd = () => {
    cleanupFaceDetection();
    cleanupComputerVision();
    
    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.disconnect();
      wsRef.current = null;
    }

    setSessionState(prev => ({
      ...prev,
      isSessionActive: false
    }));

    setSessionControls({
      canStart: false,
      canPause: false,
      canEnd: false,
      isPaused: false
    });

    onSessionEnd?.();
  };

  // Handle video frame capture for computer vision
  const handleFrameCapture = async (imageData: ImageData) => {
    if (isDetecting && !sessionControls.isPaused) {
      try {
        // Process frame through both face detection and computer vision
        await Promise.all([
          processFaceFrame(imageData),
          processComputerVisionFrame(imageData)
        ]);
      } catch (error) {
        console.error('Error processing frame:', error);
      }
    }
  };

  // Format duration for display
  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  // Initialize session on mount
  useEffect(() => {
    initializeSession();

    // Cleanup on unmount
    return () => {
      handleSessionEnd();
    };
  }, [initializeSession]);

  // Show loading state
  if (sessionState.isInitializing) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Initializing interview session...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (sessionState.error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            <h3 className="font-bold">Session Error</h3>
            <p>{sessionState.error}</p>
          </div>
          <button
            onClick={initializeSession}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
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
                Interview Session
              </h1>
              <p className="text-sm text-gray-600">
                Candidate: {authState.user?.name}
              </p>
            </div>
            
            {/* Session Status */}
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-sm text-gray-600">Duration</div>
                <div className="text-lg font-mono font-bold">
                  {formatDuration(sessionDuration)}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {sessionState.isSessionActive && !sessionControls.isPaused && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                    <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></div>
                    Active
                  </div>
                )}
                
                {sessionControls.isPaused && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm">
                    <div className="w-2 h-2 bg-yellow-600 rounded-full"></div>
                    Paused
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Video Stream Section */}
            <div className="lg:col-span-2">
              <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">
                  Video Stream
                </h2>
                
                <VideoStreamComponent
                  onFrameCapture={handleFrameCapture}
                  onRecordingStart={() => console.log('Recording started')}
                  onRecordingStop={() => console.log('Recording stopped')}
                  onError={(error) => console.error('Video error:', error)}
                />
                
                {/* Session Controls */}
                <div className="mt-6 flex justify-center gap-4">
                  {sessionControls.canStart && (
                    <button
                      onClick={startSession}
                      className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                    >
                      {sessionControls.isPaused ? 'Resume Interview' : 'Start Interview'}
                    </button>
                  )}
                  
                  {sessionControls.canPause && (
                    <button
                      onClick={pauseSession}
                      className="px-6 py-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors font-medium"
                    >
                      Pause Interview
                    </button>
                  )}
                  
                  {sessionControls.canEnd && (
                    <button
                      onClick={endSession}
                      className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                    >
                      End Interview
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Session Info & Status */}
            <div className="space-y-6">
              
              {/* Session Details */}
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Session Details
                </h3>
                
                {sessionState.session && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-gray-500">Session ID</label>
                      <p className="text-sm text-gray-900 font-mono">
                        {sessionState.session.sessionId.slice(0, 8)}...
                      </p>
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium text-gray-500">Candidate</label>
                      <p className="text-sm text-gray-900">
                        {sessionState.session.candidateName}
                      </p>
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium text-gray-500">Start Time</label>
                      <p className="text-sm text-gray-900">
                        {new Date(sessionState.session.startTime).toLocaleString()}
                      </p>
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium text-gray-500">Status</label>
                      <p className="text-sm text-gray-900 capitalize">
                        {sessionState.session.status}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Detection Status */}
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Monitoring Status
                </h3>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Face Detection</span>
                    <div className={`flex items-center gap-2 ${isDetecting ? 'text-green-600' : 'text-gray-400'}`}>
                      <div className={`w-2 h-2 rounded-full ${isDetecting ? 'bg-green-600 animate-pulse' : 'bg-gray-400'}`}></div>
                      <span className="text-sm">{isDetecting ? 'Active' : 'Inactive'}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Object Detection</span>
                    <div className={`flex items-center gap-2 ${isDetecting ? 'text-green-600' : 'text-gray-400'}`}>
                      <div className={`w-2 h-2 rounded-full ${isDetecting ? 'bg-green-600 animate-pulse' : 'bg-gray-400'}`}></div>
                      <span className="text-sm">{isDetecting ? 'Active' : 'Inactive'}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Events Logged</span>
                    <span className="text-sm font-medium text-gray-900">
                      {detectionEvents.length}
                    </span>
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                <h3 className="text-lg font-medium text-blue-900 mb-3">
                  Interview Guidelines
                </h3>
                <ul className="text-sm text-blue-800 space-y-2">
                  <li>• Keep your face visible to the camera at all times</li>
                  <li>• Look directly at the screen during the interview</li>
                  <li>• Avoid using unauthorized items (phones, notes, etc.)</li>
                  <li>• Ensure you're alone in the room</li>
                  <li>• Maintain good lighting and stable internet</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default CandidateInterface;