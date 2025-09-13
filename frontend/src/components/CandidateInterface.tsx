import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { VideoStreamComponent } from './VideoStreamComponent';
import { useFaceDetection } from '../hooks/useFaceDetection';
import { useComputerVision } from '../hooks/useComputerVision';
import { apiService } from '../services/apiService';
import { io } from 'socket.io-client';
import type { InterviewSession, DetectionEvent, FocusStatus, UnauthorizedItem } from '../types';

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
  canStartCamera: boolean;
  canStopCamera: boolean;
  canLeaveInterview: boolean;
  isSessionActive: boolean;
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
    canStartCamera: false,
    canStopCamera: false,
    canLeaveInterview: false,
    isSessionActive: false
  });

  const [notification, setNotification] = useState<{
    message: string;
    type: 'info' | 'warning' | 'error' | 'success';
  } | null>(null);
  const [_currentFocusStatus, _setCurrentFocusStatus] = useState<FocusStatus | null>(null);
  const [_unauthorizedItems, _setUnauthorizedItems] = useState<UnauthorizedItem[]>([]);
  const [_processingMetrics, setProcessingMetrics] = useState({
    frameRate: 0,
    processingTime: 0,
    memoryUsage: 0
  });
  const sessionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const wsRef = useRef<any>(null); // Using any for Socket.IO compatibility
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const isLeavingRef = useRef<boolean>(false); // Track if we're already in the process of leaving

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
    onDetectionEvent: handleDetectionEvent,
    onModelLoadError: (error: string) => {
      console.warn('Object detection model load error:', error);
      setNotification({
        message: 'Object detection unavailable. Basic monitoring will continue.',
        type: 'warning'
      });
      // Auto-dismiss notification after 5 seconds
      setTimeout(() => setNotification(null), 5000);
    }
  });

  // Check if detection services are running
  const isDetecting = isFaceDetectionInitialized && isComputerVisionInitialized;

  // Show notification with optional auto-dismiss timing
  const showNotification = (message: string, type: 'info' | 'warning' | 'error' | 'success', autoDismissMs?: number) => {
    setNotification({ message, type });
    if (autoDismissMs) {
      setTimeout(() => setNotification(null), autoDismissMs);
    }
  };

  // Handle detection events
  function handleDetectionEvent(event: DetectionEvent) {
    console.log('Detection event detected:', event);
    
    // Send event to backend API for storage
    sendEventToBackend(event);
    
    // Send event via WebSocket for real-time monitoring (broadcast to interviewers)
    if (wsRef.current && wsRef.current.connected && sessionState.session) {
      const wsPayload = {
        sessionId: sessionState.session.sessionId,
        candidateId: event.candidateId,
        eventType: event.eventType,
        timestamp: event.timestamp.toISOString(),
        duration: event.duration,
        confidence: event.confidence,
        metadata: event.metadata
      };
      
      console.log('Sending detection event via WebSocket:', wsPayload);
      wsRef.current.emit('detection_event', wsPayload);
      console.log('Detection event broadcasted via WebSocket:', event.eventType);
    } else {
      console.warn('WebSocket not connected, detection event not broadcasted. WebSocket state:', {
        connected: wsRef.current?.connected,
        hasSession: !!sessionState.session,
        sessionId: sessionState.session?.sessionId
      });
    }

    // Provide real-time feedback to candidate
    if (event.eventType === 'absence') {
      showNotification('Please ensure your face is visible to the camera', 'warning', 5000);
    } else if (event.eventType === 'multiple-faces') {
      showNotification('Multiple faces detected. Please ensure only you are visible', 'warning', 5000);
    } else if (event.eventType === 'focus-loss') {
      showNotification('Please look at the screen during the interview', 'info', 3000);
    } else if (event.eventType === 'face-visible') {
      showNotification('Great! Your face is now visible to the interviewer', 'success', 2000);
    } else if (event.eventType === 'unauthorized-item') {
      showNotification('Unauthorized item detected. Please remove any prohibited items', 'error', 7000);
    }
  }

  // Send detection event to backend API
  const sendEventToBackend = async (event: DetectionEvent) => {
    try {
      if (!authState.isAuthenticated || !authState.token) {
        console.warn('Cannot send event to backend: User not authenticated');
        return;
      }

      await apiService.post('/api/events', event);
      console.log('Successfully sent detection event to backend');
    } catch (error) {
      console.error('Failed to send event to backend:', error);
    }
  };

  // Initialize session
  const initializeSession = useCallback(async () => {
    console.log('CandidateInterface: initializeSession called');
    if (!authState.isAuthenticated || !authState.user) {
      console.log('CandidateInterface: User not authenticated');
      setSessionState(prev => ({
        ...prev,
        error: 'User not authenticated'
      }));
      return;
    }

    setSessionState(prev => ({ ...prev, isInitializing: true, error: null }));
    console.log('CandidateInterface: Starting session initialization...');

    try {
      let sessionId = propSessionId;
      console.log('CandidateInterface: Using sessionId:', sessionId);

      // If no session ID provided, check for existing active session or create new one
      if (!sessionId) {
        console.log('CandidateInterface: No session ID provided');
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
      console.log('CandidateInterface: Fetching session details for:', sessionId);
      
      // First, try to join the session as a candidate
      // This will update the session's candidateId to match the current user
      try {
        const joinResponse = await apiService.post(`/api/sessions/${sessionId}/join`);
        console.log('Successfully joined session:', joinResponse);
      } catch (joinError) {
        console.log('Could not join session (may already be joined):', joinError);
        // Continue anyway - the user might already be in the session or this might be an interviewer
      }
      
      // Now fetch the session details
      const sessionData = await apiService.get(`/api/sessions/${sessionId}`);
      console.log('CandidateInterface: Session data received:', sessionData);
      
      if (!sessionData.success) {
        throw new Error(sessionData.error || 'Failed to fetch session');
      }

      const session: InterviewSession = sessionData.data;
      console.log('CandidateInterface: Session initialized successfully:', session);

      setSessionState({
        session,
        isSessionActive: session.status === 'active',
        isInitializing: false,
        error: null
      });

      // Update session controls
      setSessionControls({
        canStartCamera: session.status === 'active',
        canStopCamera: false,
        canLeaveInterview: session.status === 'active',
        isSessionActive: session.status === 'active'
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

  // WebRTC handlers
  const setupPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ],
      iceCandidatePoolSize: 10
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current && sessionState.session) {
        wsRef.current.emit('video_stream_ice_candidate', {
          sessionId: sessionState.session.sessionId,
          toUserId: 'interviewer', // Will be handled by backend to route to interviewers
          candidate: event.candidate
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('Peer connection state:', pc.connectionState);
      
      // Handle connection failures
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        console.log('Peer connection failed/disconnected, will recreate on next stream start');
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState);
      
      // Handle ICE connection failures
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        console.log('ICE connection failed/disconnected');
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  }, [sessionState.session]);

  const handleVideoOffer = async (data: any) => {
    console.log('Received video offer from interviewer');
    
    if (!peerConnectionRef.current) {
      setupPeerConnection();
    }

    const pc = peerConnectionRef.current!;
    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));

    // Add local stream to peer connection if available
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    wsRef.current?.emit('video_stream_answer', {
      sessionId: sessionState.session?.sessionId,
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

  const startVideoStream = async (stream: MediaStream) => {
    console.log('🎥▶️ Starting video stream to interviewer');
    console.log('🎥📊 Stream details:', {
      id: stream.id,
      active: stream.active,
      videoTracks: stream.getVideoTracks().length,
      audioTracks: stream.getAudioTracks().length
    });
    
    localStreamRef.current = stream;

    if (wsRef.current && sessionState.session) {
      console.log('📡 WebSocket available, setting up peer connection...');
      
      // Clean up existing peer connection if it exists
      if (peerConnectionRef.current) {
        console.log('🧹 Cleaning up existing peer connection before creating new one');
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }

      // Setup peer connection
      const pc = setupPeerConnection();
      
      // Add stream to peer connection
      stream.getTracks().forEach(track => {
        console.log('➕ Adding track to peer connection:', {
          kind: track.kind,
          enabled: track.enabled,
          readyState: track.readyState
        });
        pc.addTrack(track, stream);
      });

      // Create and send offer to interviewer
      console.log('📞 Creating WebRTC offer...');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      console.log('📤 Sending video offer to interviewer via WebSocket:', {
        sessionId: sessionState.session.sessionId,
        offerType: offer.type
      });

      wsRef.current.emit('video_stream_offer', {
        sessionId: sessionState.session.sessionId,
        toUserId: 'interviewer', // Will be handled by backend to route to interviewers
        offer: offer
      });
      
      console.log('✅ Video offer sent to interviewer');
    } else {
      console.log('❌ Cannot start video stream: missing WebSocket or session', {
        hasWebSocket: !!wsRef.current,
        hasSession: !!sessionState.session
      });
    }
  };

  // Initialize WebSocket connection
  const initializeWebSocket = (sessionId: string) => {
    try {
      // Use Socket.IO instead of raw WebSocket for consistency
      const socket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000', {
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

      // Listen for session control updates from interviewer
      socket.on('session_control_update', (data) => {
        handleWebSocketMessage({ type: data.type, data });
      });

      socket.on('interviewer_message', (data) => {
        handleWebSocketMessage({ type: 'interviewer_message', data });
      });

      // WebRTC signaling events
      socket.on('video_stream_offer', handleVideoOffer);
      socket.on('video_stream_answer', handleVideoAnswer);
      socket.on('video_stream_ice_candidate', handleIceCandidate);

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
      case 'session_started':
        // Interviewer has started the session
        setSessionControls(prev => ({
          ...prev,
          isSessionActive: true,
          canLeaveInterview: true
        }));
        // Start detection automatically when session starts
        break;
      case 'session_ended':
        // Interviewer has ended the session
        showNotification(
          'Interview session has been ended by the interviewer. You will be redirected to the dashboard.',
          'info'
        );
        setTimeout(() => {
          leaveInterview();
        }, 3000);
        break;
      case 'session_terminated':
        // Interviewer has terminated the session
        showNotification(
          'Interview session has been terminated by the interviewer. You will be redirected to the dashboard.',
          'warning'
        );
        setTimeout(() => {
          leaveInterview();
        }, 3000);
        break;
      case 'session_paused':
        // Interviewer has paused the session
        setSessionControls(prev => ({
          ...prev,
          isSessionActive: false
        }));
        setNotification({
          message: 'Session has been paused by the interviewer.',
          type: 'info'
        });
        break;
      case 'session_resumed':
        // Interviewer has resumed the session  
        setSessionControls(prev => ({
          ...prev,
          isSessionActive: true
        }));
        setNotification({
          message: 'Session has been resumed by the interviewer.',
          type: 'success'
        });
        break;
      case 'recording_started':
        // Interviewer has started recording
        setNotification({
          message: 'Recording has been started by the interviewer.',
          type: 'info'
        });
        break;
      case 'recording_stopped':
        // Interviewer has stopped recording
        setNotification({
          message: 'Recording has been stopped by the interviewer.',
          type: 'info'
        });
        break;
      case 'session_status_update':
        // Handle session status updates from interviewer
        console.log('CandidateInterface: Received session_status_update:', message.data);
        console.log('CandidateInterface: Current sessionControls.isSessionActive:', sessionControls.isSessionActive);
        console.log('CandidateInterface: Current sessionState.isSessionActive:', sessionState.isSessionActive);
        console.log('CandidateInterface: isLeavingRef.current:', isLeavingRef.current);
        
        if (message.data && (message.data.status === 'completed' || message.data.status === 'terminated')) {
          // Check if we're already in the process of leaving to avoid duplicates
          if (isLeavingRef.current) {
            console.log('CandidateInterface: Already in process of leaving, ignoring duplicate message');
            break;
          }
          
          console.log('CandidateInterface: Processing session end/termination');
          isLeavingRef.current = true; // Mark that we're starting the leave process
          
          if (message.data.status === 'completed') {
            console.log('CandidateInterface: Session completed, showing notification and redirecting');
            showNotification(
              'Interview session has been completed by the interviewer. You will be redirected to the dashboard.',
              'info'
            );
          } else if (message.data.status === 'terminated') {
            console.log('CandidateInterface: Session terminated, showing notification and redirecting');
            showNotification(
              'Interview session has been terminated by the interviewer. You will be redirected to the dashboard.',
              'warning'
            );
          }
          
          setTimeout(() => {
            console.log('CandidateInterface: Timeout reached, calling leaveInterview');
            leaveInterview();
          }, 3000);
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

  // Leave interview (candidate can only leave, not control session)
  const leaveInterview = async () => {
    console.log('CandidateInterface: leaveInterview called');
    console.log('CandidateInterface: sessionState.session exists:', !!sessionState.session);
    
    // Always proceed with cleanup and callback, even if session is null
    try {
      console.log('CandidateInterface: Starting cleanup process');
      
      // Cleanup resources
      cleanupFaceDetection();
      cleanupComputerVision();
      
      if (sessionTimerRef.current) {
        clearInterval(sessionTimerRef.current);
        sessionTimerRef.current = null;
      }

      if (wsRef.current) {
        if (sessionState.session) {
          wsRef.current.emit('candidate_left', {
            sessionId: sessionState.session.sessionId,
            candidateId: sessionState.session.candidateId
          });
        }
        wsRef.current.disconnect();
        wsRef.current = null;
      }

      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }

      setSessionState(prev => ({
        ...prev,
        isSessionActive: false
      }));

      setSessionControls({
        canStartCamera: false,
        canStopCamera: false,
        canLeaveInterview: false,
        isSessionActive: false
      });

      // Reset the leaving flag
      isLeavingRef.current = false;

      console.log('CandidateInterface: Calling onSessionEnd callback');
      console.log('CandidateInterface: onSessionEnd type:', typeof onSessionEnd);
      console.log('CandidateInterface: onSessionEnd exists:', !!onSessionEnd);
      
      if (onSessionEnd) {
        console.log('CandidateInterface: Executing onSessionEnd callback...');
        onSessionEnd();
        console.log('CandidateInterface: onSessionEnd callback executed');
      } else {
        console.log('CandidateInterface: onSessionEnd callback is not available');
      }

    } catch (error) {
      console.error('Error leaving interview:', error);
      setSessionState(prev => ({
        ...prev,
        error: 'Failed to leave interview'
      }));
    }
  };

  // Handle video frame capture for computer vision
  const handleFrameCapture = useCallback(async (imageData: ImageData) => {
    if (isDetecting && sessionControls.isSessionActive) {
      try {
        // Process frame through both face detection and computer vision in parallel
        const startTime = performance.now();
        
        await Promise.all([
          processFaceFrame(imageData).catch((err: Error) => {
            console.warn('Face detection processing failed:', err);
            // Continue with other processing even if face detection fails
          }),
          processComputerVisionFrame(imageData).catch(err => {
            console.warn('Object detection processing failed:', err);
            // Continue with other processing even if object detection fails
          })
        ]);
        
        // Log processing performance for monitoring
        const processingTime = performance.now() - startTime;
        
        // Update processing metrics
        setProcessingMetrics(prev => ({
          ...prev,
          processingTime,
          frameRate: Math.round(1000 / Math.max(processingTime, 16.67)) // Cap at 60 FPS
        }));
        
        if (processingTime > 100) { // Log if processing takes more than 100ms
          console.log(`Frame processing took ${processingTime.toFixed(2)}ms`);
        }
      } catch (error) {
        console.error('Critical error processing frame:', error);
        // Don't stop the entire system for processing errors
      }
    }
  }, [isDetecting, sessionControls.isSessionActive, processFaceFrame, processComputerVisionFrame]);

  // Memoized callbacks for VideoStreamComponent
  const handleStreamStart = useCallback((stream: MediaStream) => {
    console.log('Video stream started, setting up WebRTC');
    startVideoStream(stream);
  }, [startVideoStream]);

  const handleStreamStop = useCallback(() => {
    console.log('Video stream stopped, cleaning up WebRTC');
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current = null;
    }
  }, []);

  const handleRecordingStart = useCallback(() => {
    console.log('Recording started');
  }, []);

  const handleRecordingStop = useCallback(() => {
    console.log('Recording stopped');
  }, []);

  const handleVideoError = useCallback((error: any) => {
    console.error('Video error:', error);
  }, []);

  // Initialize session on mount
  useEffect(() => {
    console.log('CandidateInterface: Component mounted with sessionId:', propSessionId);
    initializeSession();

    // Cleanup on unmount - but don't call onSessionEnd during cleanup
    return () => {
      console.log('CandidateInterface: Component unmounting, cleaning up...');
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

      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }
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
                <div className="text-sm text-gray-600">Status</div>
                <div className="text-lg font-semibold">
                  {sessionControls.isSessionActive ? 'In Progress' : 'Waiting'}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {sessionControls.isSessionActive && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                    <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></div>
                    Session Active
                  </div>
                )}
                
                {!sessionControls.isSessionActive && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-sm">
                    <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
                    Waiting for Interviewer
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Notification */}
      {notification && (
        <div className={`mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-2`}>
          <div className={`flex items-center justify-between p-4 rounded-lg border-l-4 ${
            notification.type === 'warning' ? 'bg-yellow-50 border-yellow-400 text-yellow-800' :
            notification.type === 'error' ? 'bg-red-50 border-red-400 text-red-800' :
            notification.type === 'success' ? 'bg-green-50 border-green-400 text-green-800' :
            'bg-blue-50 border-blue-400 text-blue-800'
          }`}>
            <span className="text-sm font-medium">{notification.message}</span>
            <button
              onClick={() => setNotification(null)}
              className="ml-4 text-lg font-bold opacity-70 hover:opacity-100"
            >
              ×
            </button>
          </div>
        </div>
      )}

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
                
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <p className="text-sm text-blue-800">
                    <strong>Instructions:</strong> Click "Start Camera" below to begin video monitoring. 
                    Ensure you're in a well-lit area and looking directly at the camera.
                  </p>
                </div>
                
                <VideoStreamComponent
                  onFrameCapture={handleFrameCapture}
                  onStreamStart={handleStreamStart}
                  onStreamStop={handleStreamStop}
                  onRecordingStart={handleRecordingStart}
                  onRecordingStop={handleRecordingStop}
                  onError={handleVideoError}
                  showRecordingControls={false}
                />
                
                {/* Session Controls */}
                <div className="mt-6 flex justify-center gap-4">
                  {sessionControls.canLeaveInterview && (
                    <button
                      onClick={leaveInterview}
                      className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                    >
                      Leave Interview
                    </button>
                  )}
                  
                  {!sessionControls.isSessionActive && (
                    <div className="px-6 py-3 bg-gray-100 text-gray-600 rounded-lg font-medium">
                      Waiting for interviewer to start session...
                    </div>
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