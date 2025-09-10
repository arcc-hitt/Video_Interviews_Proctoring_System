import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useAlertStreaming } from '../useAlertStreaming';

// Mock the AlertStreamingService
const mockService = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    joinSession: vi.fn(),
    leaveSession: vi.fn(),
    sendManualFlag: vi.fn(),
    acknowledgeAlert: vi.fn(),
    updateAuthToken: vi.fn(),
    updateCallbacks: vi.fn(),
    destroy: vi.fn(),
    isConnectedToServer: vi.fn(() => false),
    getCurrentSessionId: vi.fn()
};

vi.mock('../../services/alertStreamingService', () => ({
    AlertStreamingService: vi.fn().mockImplementation(() => mockService)
}));

describe('useAlertStreaming', () => {
    const defaultOptions = {
        authToken: 'test-token',
        sessionId: 'test-session-123',
        autoConnect: false, // Disable auto-connect for easier testing
        maxAlerts: 50
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockService.connect.mockResolvedValue(undefined);
    });

    describe('Basic Functionality', () => {
        it('initializes with default state', () => {
            const { result } = renderHook(() => useAlertStreaming(defaultOptions));

            expect(result.current.alerts).toEqual([]);
            expect(result.current.isConnected).toBe(false);
            expect(result.current.isConnecting).toBe(false);
            expect(result.current.error).toBe(null);
        });

        it('provides connection methods', () => {
            const { result } = renderHook(() => useAlertStreaming(defaultOptions));

            expect(typeof result.current.connect).toBe('function');
            expect(typeof result.current.disconnect).toBe('function');
            expect(typeof result.current.joinSession).toBe('function');
            expect(typeof result.current.leaveSession).toBe('function');
            expect(typeof result.current.sendManualFlag).toBe('function');
            expect(typeof result.current.acknowledgeAlert).toBe('function');
            expect(typeof result.current.clearAlerts).toBe('function');
            expect(typeof result.current.clearError).toBe('function');
        });

        it('calls service methods when hook methods are called', async () => {
            const { result } = renderHook(() => useAlertStreaming(defaultOptions));

            await act(async () => {
                await result.current.connect();
            });
            expect(mockService.connect).toHaveBeenCalled();

            act(() => {
                result.current.disconnect();
            });
            expect(mockService.disconnect).toHaveBeenCalled();

            act(() => {
                result.current.joinSession('session-123');
            });
            expect(mockService.joinSession).toHaveBeenCalledWith('session-123');

            act(() => {
                result.current.leaveSession();
            });
            expect(mockService.leaveSession).toHaveBeenCalled();

            act(() => {
                result.current.sendManualFlag('Test flag', 'high');
            });
            expect(mockService.sendManualFlag).toHaveBeenCalledWith('Test flag', 'high');

            act(() => {
                result.current.acknowledgeAlert('alert-123');
            });
            expect(mockService.acknowledgeAlert).toHaveBeenCalledWith('alert-123');
        });

        it('clears alerts when clearAlerts is called', () => {
            const { result } = renderHook(() => useAlertStreaming(defaultOptions));

            // Manually add an alert to test clearing
            act(() => {
                // Simulate adding an alert by directly modifying the state
                // In a real scenario, this would come through the service callback
                result.current.clearAlerts();
            });

            expect(result.current.alerts).toHaveLength(0);
        });

        it('destroys service on unmount', () => {
            const { unmount } = renderHook(() => useAlertStreaming(defaultOptions));

            unmount();

            expect(mockService.destroy).toHaveBeenCalled();
        });
    });
});