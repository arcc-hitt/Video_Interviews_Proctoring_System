import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { VideoStreamComponent } from './VideoStreamComponent';
import { useFaceDetection } from '../hooks/useFaceDetection';
import { useComputerVision } from '../hooks/useComputerVision';
import { apiService } from '../services/apiService';
import { useEnhancedMonitoring } from '../hooks/useEnhancedMonitoring';
import { faceMeshService } from '../services/faceMeshService';
import type { FaceLandmarks } from '../types';
import { ENHANCED_MONITORING_CONFIG } from '../config/cvConfig';
import type { CVWorkerLightResult } from '../types';
import { useScreenRecording } from '../hooks/useScreenRecording';
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
  const lastCandidateNoticeRef = useRef<Record<string, number>>({});
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
  const lastDrowsinessAtRef = useRef<number>(0);
  const lastWorkerLandmarksAtRef = useRef<number>(0);

  // Enhanced monitoring (drowsiness + audio)
  const {
    startMonitoring: startEnhancedMonitoring,
    stopMonitoring: stopEnhancedMonitoring,
    processFaceLandmarks: processDrowsinessLandmarks,
    isMonitoring: isEnhancedMonitoring
  } = useEnhancedMonitoring({
    sessionId: sessionState.session?.sessionId || '',
    candidateId: sessionState.session?.candidateId || '',
    onDetectionEvent: handleDetectionEvent
  });

  // Screen recording hook (uploads chunks to backend)
  const recording = useScreenRecording({
    sessionId: (sessionState.session?.sessionId as string) || '',
    candidateId: (sessionState.session?.candidateId as string) || ''
  });

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
  const showNotification = (message: string, type: 'info' | 'warning' | 'error' | 'success', autoDismissMs?: number, key?: string, minIntervalMs: number = 2000) => {
    const k = key || `${type}:${message}`;
    const now = Date.now();
    const last = lastCandidateNoticeRef.current[k] || 0;
    if (now - last < minIntervalMs) return;
    lastCandidateNoticeRef.current[k] = now;
    setNotification({ message, type });
    if (autoDismissMs) {
      setTimeout(() => setNotification(null), autoDismissMs);
    }
  };

  // Handle detection events
  function handleDetectionEvent(event: DetectionEvent) {
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
      
      wsRef.current.emit('detection_event', wsPayload);
    } else {
      console.warn('WebSocket not connected, detection event not broadcasted. WebSocket state:', {
        connected: wsRef.current?.connected,
        hasSession: !!sessionState.session,
        sessionId: sessionState.session?.sessionId
      });
    }

    // Provide real-time feedback to candidate
    if (event.eventType === 'absence') {
      showNotification('Please ensure your face is visible to the camera', 'warning', 5000, 'absence', 6000);
    } else if (event.eventType === 'multiple-faces') {
      showNotification('Multiple faces detected. Please ensure only you are visible', 'warning', 5000, 'multiple-faces', 8000);
    } else if (event.eventType === 'focus-loss') {
      showNotification('Please look at the screen during the interview', 'info', 3000, 'focus-loss', 5000);
    } else if (event.eventType === 'face-visible') {
      showNotification('Great! Your face is now visible to the interviewer', 'success', 2000);
    } else if (event.eventType === 'unauthorized-item') {
      showNotification('Unauthorized item detected. Please remove any prohibited items', 'error', 7000, 'unauthorized-item', 7000);
    } else if (event.eventType === 'drowsiness') {
      showNotification('Signs of drowsiness detected. Please stay attentive.', 'warning', 5000, 'drowsiness', 8000);
    } else if (event.eventType === 'eye-closure') {
      showNotification('Prolonged eye closure detected. Please keep your eyes open.', 'warning', 5000, 'eye-closure', 6000);
    } else if (event.eventType === 'excessive-blinking') {
      showNotification('Excessive blinking detected. Please focus on the screen.', 'info', 4000, 'excessive-blinking', 6000);
    } else if (event.eventType === 'background-voice') {
      showNotification('Background voice detected. Ensure you are alone in a quiet room.', 'warning', 6000, 'background-voice', 10000);
    } else if (event.eventType === 'multiple-voices') {
      showNotification('Multiple voices detected simultaneously. This is not allowed.', 'error', 7000, 'multiple-voices', 10000);
    } else if (event.eventType === 'excessive-noise') {
      showNotification('High background noise detected. Please move to a quieter place.', 'info', 5000, 'excessive-noise', 8000);
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
    } catch (error) {
      console.error('Failed to send event to backend:', error);
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
      
      // First, try to join the session as a candidate
      // This will update the session's candidateId to match the current user
      try {
        await apiService.post(`/api/sessions/${sessionId}/join`);
      } catch (joinError) {
        // Continue anyway - the user might already be in the session or this might be an interviewer
      }
      
      // Now fetch the session details
      const sessionData = await apiService.get(`/api/sessions/${sessionId}`);
      
      if (!sessionData.success) {
        throw new Error(sessionData.error || 'Failed to fetch session');
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
        canStartCamera: session.status === 'active',
        canStopCamera: false,
        canLeaveInterview: session.status === 'active',
        isSessionActive: session.status === 'active'
      });

      // Initialize WebSocket connection for real-time communication
      initializeWebSocket(sessionId);

      // Defer enhanced monitoring startup to an effect when session is ready

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
      // Handle connection failures
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        // Connection failed/disconnected, will recreate on next stream start
      }
    };

    pc.oniceconnectionstatechange = () => {
      // Handle ICE connection failures
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        // ICE connection failed/disconnected
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  }, [sessionState.session]);

  const handleVideoOffer = async (data: any) => {
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
    localStreamRef.current = stream;

    if (wsRef.current && sessionState.session) {
      // Clean up existing peer connection if it exists
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }

      // Setup peer connection
      const pc = setupPeerConnection();
      
      // Add stream to peer connection
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      // Create and send offer to interviewer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      wsRef.current.emit('video_stream_offer', {
        sessionId: sessionState.session.sessionId,
        toUserId: 'interviewer', // Will be handled by backend to route to interviewers
        offer: offer
      });
      
    } else {
      console.warn('Cannot start video stream: missing WebSocket or session', {
        hasWebSocket: !!wsRef.current,
        hasSession: !!sessionState.session
      });
    }
  };

  // Initialize WebSocket connection
  const initializeWebSocket = (sessionId: string) => {
    try {
      const socketUrl = import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
      const socket = io(socketUrl, {
        auth: {
          token: authState.token
        },
        transports: ['websocket', 'polling'],
        timeout: 10000,
        forceNew: true
      });

      socket.on('connect', () => {
        wsRef.current = socket as any; // Store socket reference for compatibility
        
        // Join session as candidate
        socket.emit('join_session', {
          sessionId,
          role: 'candidate'
        });
      });

      socket.on('disconnect', () => {
        wsRef.current = null;
      });

      socket.on('session_joined', () => {
        // Session joined successfully
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
        // Ensure enhanced monitoring is running when session starts
        (async () => {
          try {
            await startEnhancedMonitoring();
          } catch {}
        })();
        break;
      case 'session_ended':
        // Interviewer has ended the session
        showNotification(
          'Interview session has been ended by the interviewer. You will be redirected to the dashboard.',
          'info'
        );
  // Ensure any ongoing recording is stopped and uploaded
  (async () => { try { await recording.stop(); } catch {} })();
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
  // Ensure any ongoing recording is stopped and uploaded
  (async () => { try { await recording.stop(); } catch {} })();
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
        // Start local recording if stream is available
        if (localStreamRef.current) {
          recording.start(localStreamRef.current);
        } else {
          console.warn('Cannot start recording: no active camera stream');
          setNotification({
            message: 'Recording could not start because the camera is not active. Please start camera.',
            type: 'warning'
          });
        }
        break;
      case 'recording_stopped':
        // Interviewer has stopped recording
        setNotification({
          message: 'Recording has been stopped by the interviewer.',
          type: 'info'
        });
        // Stop and upload
        recording.stop();
        break;
      case 'session_status_update':
        // Handle session status updates from interviewer
        if (message.data && (message.data.status === 'completed' || message.data.status === 'terminated')) {
          // Check if we're already in the process of leaving to avoid duplicates
          if (isLeavingRef.current) {
            break;
          }
          
          isLeavingRef.current = true; // Mark that we're starting the leave process
          
          if (message.data.status === 'completed') {
            showNotification(
              'Interview session has been completed by the interviewer. You will be redirected to the dashboard.',
              'info'
            );
          } else if (message.data.status === 'terminated') {
            showNotification(
              'Interview session has been terminated by the interviewer. You will be redirected to the dashboard.',
              'warning'
            );
          }
          
          // Attempt to stop and upload any ongoing recording before leaving
          (async () => { try { await recording.stop(); } catch {} })();

          setTimeout(() => {
            leaveInterview();
          }, 3000);
        }
        break;
      case 'interviewer_message':
        // Handle messages from interviewer if needed
        break;
      default:
        // Unknown message type
        break;
    }
  };

  // Leave interview (candidate can only leave, not control session)
  const leaveInterview = async () => {
    // Always proceed with cleanup and callback, even if session is null
    try {
      
      // Cleanup resources
      cleanupFaceDetection();
      cleanupComputerVision();
      stopEnhancedMonitoring();
      
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

      if (onSessionEnd) {
        onSessionEnd();
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

        // Drowsiness detection via Face Mesh landmarks (if enhanced monitoring active)
        try {
          const nowTs = performance.now();
          const interval = ENHANCED_MONITORING_CONFIG.faceMeshSampleInterval || 300;
          const workerFreshnessMs = 2 * interval; // if we received worker landmarks recently, skip main-thread path
          const hasRecentWorkerLandmarks = (nowTs - lastWorkerLandmarksAtRef.current) < workerFreshnessMs;
          if (isEnhancedMonitoring && sessionState.session && (nowTs - lastDrowsinessAtRef.current) >= interval && !hasRecentWorkerLandmarks) {
            lastDrowsinessAtRef.current = nowTs;
            // Lazily initialize face mesh and estimate landmarks
            const landmarks: FaceLandmarks[] = await faceMeshService.estimateLandmarks(imageData);
            if (landmarks && landmarks.length > 0) {
              await processDrowsinessLandmarks(landmarks);
            }
          }
        } catch (e) {
          // Fail-soft; continue other processing
          if (import.meta.env.DEV) console.debug('Enhanced monitoring frame process error:', e);
        }
        
        // Log processing performance for monitoring
        const processingTime = performance.now() - startTime;
        
        // Update processing metrics
        setProcessingMetrics(prev => ({
          ...prev,
          processingTime,
          frameRate: Math.round(1000 / Math.max(processingTime, 16.67)) // Cap at 60 FPS
        }));
        
      } catch (error) {
        console.error('Critical error processing frame:', error);
        // Don't stop the entire system for processing errors
      }
    }
  }, [isDetecting, sessionControls.isSessionActive, processFaceFrame, processComputerVisionFrame, isEnhancedMonitoring, processDrowsinessLandmarks, sessionState.session]);

  // Start enhanced monitoring when session is available and active
  useEffect(() => {
    if (!isEnhancedMonitoring && sessionState.session && sessionControls.isSessionActive) {
      (async () => {
        try {
          await startEnhancedMonitoring();
        } catch (e) {
          // Non-fatal; UI continues without enhanced monitoring
        }
      })();
    }
  }, [isEnhancedMonitoring, sessionState.session, sessionControls.isSessionActive, startEnhancedMonitoring]);

  // Memoized callbacks for VideoStreamComponent
  const handleStreamStart = useCallback((stream: MediaStream) => {
    startVideoStream(stream);
  }, [startVideoStream]);

  const handleStreamStop = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current = null;
    }
  }, []);

  const handleRecordingStart = useCallback(() => {
  }, []);

  const handleRecordingStop = useCallback(() => {
  }, []);

  const handleVideoError = useCallback((error: any) => {
    console.error('Video error:', error);
  }, []);

  // Handle CV worker lightweight results (e.g., face landmarks for drowsiness)
  const handleWorkerResult = useCallback(async (result: CVWorkerLightResult) => {
    try {
      if (!isEnhancedMonitoring || !sessionState.session) return;
      const nowTs = performance.now();
      const interval = ENHANCED_MONITORING_CONFIG.faceMeshSampleInterval || 300;
      if ((nowTs - lastDrowsinessAtRef.current) < interval) return;
      if (result.faceDetection && result.faceDetection.landmarks?.length) {
        lastDrowsinessAtRef.current = nowTs;
        lastWorkerLandmarksAtRef.current = nowTs;
        await processDrowsinessLandmarks(result.faceDetection.landmarks);
      }
    } catch (e) {
      if (import.meta.env.DEV) console.debug('Worker result handling failed:', e);
    }
  }, [isEnhancedMonitoring, sessionState.session, processDrowsinessLandmarks]);

  // Initialize session on mount
  useEffect(() => {
    initializeSession();

    // Cleanup on unmount - but don't call onSessionEnd during cleanup
    return () => {
      cleanupFaceDetection();
      cleanupComputerVision();
      stopEnhancedMonitoring();
      
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
                  onWorkerResult={handleWorkerResult}
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