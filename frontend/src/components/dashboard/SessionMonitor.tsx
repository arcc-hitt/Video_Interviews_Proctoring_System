import React from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Play, Pause, Square, StopCircle, AlertTriangle } from 'lucide-react';
import type { InterviewSession } from '../../types';

interface SessionControlState {
  isSessionStarted: boolean;
  isSessionPaused: boolean;
  isRecording: boolean;
  sessionDuration: number;
}

interface SessionMonitorProps {
  session: InterviewSession;
  sessionControlState: SessionControlState;
  videoStreamStatus: 'waiting' | 'connecting' | 'connected' | 'disconnected';
  isVideoStreamActive: boolean;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  connectedUsers?: {
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
  } | null;
  onStartSession: () => void;
  onPauseSession: () => void;
  onResumeSession: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onEndSession: () => void;
  onTerminateSession: () => void;
}

export const SessionMonitor: React.FC<SessionMonitorProps> = ({
  session,
  sessionControlState,
  videoStreamStatus,
  isVideoStreamActive,
  videoRef,
  connectedUsers,
  onStartSession,
  onPauseSession,
  onResumeSession,
  onStartRecording,
  onStopRecording,
  onEndSession,
  onTerminateSession
}) => {
  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return hours > 0 
      ? `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
      : `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'connected':
        return <Badge variant="default">Connected</Badge>;
      case 'connecting':
        return <Badge variant="secondary">Connecting</Badge>;
      case 'disconnected':
        return <Badge variant="destructive">Disconnected</Badge>;
      default:
        return <Badge variant="outline">Waiting</Badge>;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Session Info */}
      <div className="lg:col-span-1">
        <Card>
          <CardHeader>
            <CardTitle>Session Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-medium text-gray-900">{session.candidateName}</h3>
              <p className="text-sm text-gray-500">
                Started: {new Date(session.startTime).toLocaleString()}
              </p>
              <p className="text-sm text-gray-500">
                Session ID: {session.sessionId}
              </p>
            </div>

            {/* Session Status */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Duration:</span>
                <span className="text-sm">{formatDuration(sessionControlState.sessionDuration)}</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Status:</span>
                <Badge variant={sessionControlState.isSessionStarted ? 'default' : 'secondary'}>
                  {sessionControlState.isSessionStarted 
                    ? (sessionControlState.isSessionPaused ? 'Paused' : 'Active')
                    : 'Not Started'
                  }
                </Badge>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Recording:</span>
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

              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Video Stream:</span>
                {getStatusBadge(videoStreamStatus)}
              </div>
            </div>

            {/* Connected Users */}
            {connectedUsers && (
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium mb-2">Connected Users</h4>
                <div className="space-y-1">
                  <p className="text-xs text-gray-600">
                    Candidates: {connectedUsers.candidates.length}
                  </p>
                  <p className="text-xs text-gray-600">
                    Interviewers: {connectedUsers.interviewers.length}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Video Stream */}
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Candidate Video Stream</CardTitle>
              <div className="flex space-x-2">
                {/* Session Controls */}
                {!sessionControlState.isSessionStarted ? (
                  <Button onClick={onStartSession} size="sm">
                    <Play className="w-4 h-4 mr-1" />
                    Start Interview
                  </Button>
                ) : (
                  <>
                    {!sessionControlState.isSessionPaused ? (
                      <Button onClick={onPauseSession} variant="outline" size="sm">
                        <Pause className="w-4 h-4 mr-1" />
                        Pause
                      </Button>
                    ) : (
                      <Button onClick={onResumeSession} size="sm">
                        <Play className="w-4 h-4 mr-1" />
                        Resume
                      </Button>
                    )}
                    
                    {/* Recording Controls */}
                    {!sessionControlState.isRecording ? (
                      <Button onClick={onStartRecording} variant="destructive" size="sm">
                        <Square className="w-4 h-4 mr-1" />
                        Start Recording
                      </Button>
                    ) : (
                      <Button onClick={onStopRecording} variant="outline" size="sm">
                        <StopCircle className="w-4 h-4 mr-1" />
                        Stop Recording
                      </Button>
                    )}
                  </>
                )}
                
                {/* Session Management */}
                <Button onClick={onEndSession} variant="outline" size="sm">
                  End Session
                </Button>
                <Button onClick={onTerminateSession} variant="destructive" size="sm">
                  <AlertTriangle className="w-4 h-4 mr-1" />
                  Terminate
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
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
                        <p className="text-lg font-medium">Waiting for candidate video stream</p>
                        <p className="text-sm text-gray-400 mt-2">The candidate needs to join and enable their camera</p>
                      </>
                    )}
                    
                    {videoStreamStatus === 'connecting' && (
                      <>
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                        <p className="text-lg font-medium">Connecting to video stream...</p>
                        <p className="text-sm text-gray-400 mt-2">Establishing WebRTC connection</p>
                      </>
                    )}
                    
                    {videoStreamStatus === 'disconnected' && (
                      <>
                        <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center border-2 border-red-600 rounded-full">
                          <AlertTriangle className="w-8 h-8 text-red-400" />
                        </div>
                        <p className="text-lg font-medium text-red-400">Video stream disconnected</p>
                        <p className="text-sm text-gray-400 mt-2">The candidate's video stream has been lost</p>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};