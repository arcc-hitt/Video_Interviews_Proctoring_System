import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { InterviewerDashboard } from '../dashboard/InterviewerDashboard';
import { useAuth } from '../../contexts/AuthContext';
import { io } from 'socket.io-client';

// Mock dependencies
vi.mock('../../contexts/AuthContext');
vi.mock('socket.io-client');

// Mock fetch
global.fetch = vi.fn();

// Mock WebRTC APIs
const mockRTCPeerConnectionConstructor = vi.fn().mockImplementation(() => ({
    setRemoteDescription: vi.fn().mockResolvedValue(undefined),
    createAnswer: vi.fn().mockResolvedValue({ type: 'answer', sdp: 'mock-sdp' }),
    setLocalDescription: vi.fn().mockResolvedValue(undefined),
    addIceCandidate: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
    onicecandidate: null,
    ontrack: null
}));

// Add the static generateCertificate method to satisfy TypeScript
(mockRTCPeerConnectionConstructor as any).generateCertificate = vi.fn().mockResolvedValue({});

global.RTCPeerConnection = mockRTCPeerConnectionConstructor as any;

global.RTCSessionDescription = vi.fn().mockImplementation((desc) => desc);
global.RTCIceCandidate = vi.fn().mockImplementation((candidate) => candidate);

// Mock socket.io
const mockSocket = {
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn()
};

const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;
const mockIo = io as ReturnType<typeof vi.fn>;

// Wrapper component that provides routing context
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return (
        <BrowserRouter>
            {children}
        </BrowserRouter>
    );
};

describe('InterviewerDashboard Integration', () => {
    const mockAuthState = {
        user: {
            id: 'interviewer-123',
            name: 'John Interviewer',
            email: 'john@example.com',
            role: 'interviewer' as const,
            createdAt: new Date()
        },
        token: 'mock-jwt-token',
        isAuthenticated: true,
        isLoading: false,
        error: null
    };

    beforeEach(() => {
        vi.clearAllMocks();

        mockUseAuth.mockReturnValue({
            authState: mockAuthState,
            login: vi.fn(),
            signup: vi.fn(),
            logout: vi.fn(),
            clearError: vi.fn()
        });

        mockIo.mockReturnValue(mockSocket);

        // Mock successful sessions fetch
        (global.fetch as any).mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                success: true,
                data: {
                    sessions: [
                        {
                            sessionId: 'session-1',
                            candidateId: 'candidate-1',
                            candidateName: 'Alice Candidate',
                            startTime: new Date('2024-01-01T10:00:00Z'),
                            status: 'active' as const
                        }
                    ],
                    pagination: {
                        total: 1,
                        limit: 50,
                        offset: 0,
                        hasMore: false
                    }
                }
            })
        });
    });

    it('renders successfully within routing context', async () => {
        render(
            <TestWrapper>
                <InterviewerDashboard />
            </TestWrapper>
        );

        // Wait for the component to load
        await waitFor(() => {
            expect(screen.getByText('Interviewer Dashboard')).toBeInTheDocument();
        });
    });

    it('displays user information from auth context', async () => {
        render(
            <TestWrapper>
                <InterviewerDashboard />
            </TestWrapper>
        );

        await waitFor(() => {
            expect(screen.getByText('Welcome, John Interviewer')).toBeInTheDocument();
        });
    });

    it('makes API calls with proper authentication', async () => {
        render(
            <TestWrapper>
                <InterviewerDashboard />
            </TestWrapper>
        );

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith('/api/sessions?status=active', {
                headers: {
                    'Authorization': 'Bearer mock-jwt-token',
                    'Content-Type': 'application/json'
                }
            });
        });
    });

    it('initializes WebSocket with authentication token', async () => {
        render(
            <TestWrapper>
                <InterviewerDashboard />
            </TestWrapper>
        );

        await waitFor(() => {
            expect(mockIo).toHaveBeenCalledWith(
                'http://localhost:5000',
                {
                    auth: { token: 'mock-jwt-token' },
                    transports: ['websocket', 'polling']
                }
            );
        });
    });

    it('handles API errors gracefully', async () => {
        // Mock fetch to return error
        (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

        render(
            <TestWrapper>
                <InterviewerDashboard />
            </TestWrapper>
        );

        await waitFor(() => {
            expect(screen.getByText('Network error')).toBeInTheDocument();
        });
    });

    it('displays session data when available', async () => {
        render(
            <TestWrapper>
                <InterviewerDashboard />
            </TestWrapper>
        );

        await waitFor(() => {
            expect(screen.getByText('Alice Candidate')).toBeInTheDocument();
            expect(screen.getByText('active')).toBeInTheDocument();
            expect(screen.getByText('Monitor')).toBeInTheDocument();
        });
    });

    it('shows empty state when no sessions exist', async () => {
        // Mock empty sessions response
        (global.fetch as any).mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
                success: true,
                data: { sessions: [] }
            })
        });

        render(
            <TestWrapper>
                <InterviewerDashboard />
            </TestWrapper>
        );

        await waitFor(() => {
            expect(screen.getByText('No active sessions found')).toBeInTheDocument();
        });
    });
});