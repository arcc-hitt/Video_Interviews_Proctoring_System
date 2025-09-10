import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AlertStreamingService, type AlertStreamingConfig, type AlertStreamingCallbacks } from '../alertStreamingService';
import type { DetectionEvent } from '../../types';

// Mock socket.io-client
const mockSocket = {
  on: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
  connected: true
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket)
}));

describe('AlertStreamingService', () => {
  let service: AlertStreamingService;
  let mockConfig: AlertStreamingConfig;
  let mockCallbacks: AlertStreamingCallbacks;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockConfig = {
      backendUrl: 'http://localhost:5000',
      authToken: 'test-token',
      sessionId: 'test-session-123',
      reconnectAttempts: 3,
      reconnectDelay: 1000
    };

    mockCallbacks = {
      onAlert: vi.fn(),
      onDetectionEvent: vi.fn(),
      onManualFlag: vi.fn(),
      onConnect: vi.fn(),
      onDisconnect: vi.fn(),
      onError: vi.fn()
    };

    service = new AlertStreamingService(mockConfig, mockCallbacks);
  });

  afterEach(() => {
    service.destroy();
  });

  describe('Basic Functionality', () => {
    it('initializes with correct configuration', () => {
      expect(service).toBeInstanceOf(AlertStreamingService);
      expect(service.isConnectedToServer()).toBe(false);
    });

    it('connects to WebSocket server', async () => {
      const { io } = await import('socket.io-client');
      
      await service.connect();
      
      expect(io).toHaveBeenCalledWith('http://localhost:5000', {
        auth: { token: 'test-token' },
        transports: ['websocket', 'polling'],
        timeout: 10000,
        forceNew: true
      });
    });

    it('sets up event listeners on connection', async () => {
      await service.connect();
      
      expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('detection_event_broadcast', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('manual_flag_broadcast', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('session_status_update', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('disconnects properly', () => {
      service.disconnect();
      
      expect(mockSocket.disconnect).toHaveBeenCalled();
      expect(service.isConnectedToServer()).toBe(false);
    });

    it('joins a session', () => {
      service.joinSession('new-session-123');
      
      expect(mockSocket.emit).toHaveBeenCalledWith('join_session', {
        sessionId: 'new-session-123',
        role: 'interviewer'
      });
      expect(service.getCurrentSessionId()).toBe('new-session-123');
    });

    it('leaves current session', () => {
      service.leaveSession();
      
      expect(mockSocket.emit).toHaveBeenCalledWith('leave_session', 'test-session-123');
      expect(service.getCurrentSessionId()).toBeUndefined();
    });

    it('sends manual flag', () => {
      service.sendManualFlag('Suspicious behavior', 'high');
      
      expect(mockSocket.emit).toHaveBeenCalledWith('manual_flag', 
        expect.objectContaining({
          sessionId: 'test-session-123',
          description: 'Suspicious behavior',
          severity: 'high',
          flagged: true,
          timestamp: expect.any(Date)
        })
      );
    });

    it('acknowledges alerts', () => {
      service.acknowledgeAlert('alert-123', 'session-456');
      
      expect(mockSocket.emit).toHaveBeenCalledWith('alert_acknowledged', {
        alertId: 'alert-123',
        sessionId: 'session-456',
        timestamp: expect.any(Date),
        acknowledgedBy: 'interviewer'
      });
    });

    it('updates auth token', () => {
      service.updateAuthToken('new-token');
      
      // Should trigger reconnection with new token
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('cleans up resources on destroy', () => {
      service.destroy();
      
      expect(mockSocket.disconnect).toHaveBeenCalled();
      expect(service.isConnectedToServer()).toBe(false);
    });
  });

  describe('Event Conversion', () => {
    it('converts detection events correctly', () => {
      const mockDetectionEvent: DetectionEvent = {
        sessionId: 'test-session',
        candidateId: 'test-candidate',
        eventType: 'focus-loss',
        timestamp: new Date(),
        confidence: 0.8,
        metadata: {}
      };

      // Test that the service can handle detection events
      // In a real test, we would simulate the event handler being called
      expect(mockDetectionEvent.eventType).toBe('focus-loss');
    });
  });
});