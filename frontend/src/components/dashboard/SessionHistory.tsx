import React, { useEffect, useState } from 'react';
import { RefreshCw, History } from 'lucide-react';
import apiService from '../../services/apiService';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  Button,
  SessionCard,
  LoadingState,
  EmptyState,
  ErrorState
} from '../ui';

type HistorySession = {
	sessionId: string;
	candidateName: string;
	startTime: string | Date;
	endTime?: string | Date;
	duration?: number;
	status: 'completed' | 'terminated' | 'active';
	recordingUrl?: string | null;
	reportId?: string | null;
};

interface HistoryResponse {
	sessions: HistorySession[];
	pagination: {
		total: number;
		limit: number;
		offset: number;
		hasMore: boolean;
	};
}

export const SessionHistory: React.FC = () => {
	const [sessions, setSessions] = useState<HistorySession[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [hasMore, setHasMore] = useState(false);
	const [offset, setOffset] = useState(0);
	const limit = 10;

	const handleDownloadReport = async (reportId: string) => {
		try {
			const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
			const token = localStorage.getItem('auth_token');
			const resp = await fetch(`${baseURL}/api/reports/${reportId}/export?format=pdf`, {
				method: 'GET',
				headers: token ? { Authorization: `Bearer ${token}` } : {}
			});
			if (!resp.ok) {
				// Try to parse error for better feedback
				let msg = `Failed to download report (HTTP ${resp.status})`;
				try {
					const data = await resp.json();
					msg = data?.error || data?.message || msg;
				} catch {
					// ignore json parse errors
				}
				throw new Error(msg);
			}
			const blob = await resp.blob();
			const url = window.URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `proctoring-report-${reportId}.pdf`;
			document.body.appendChild(a);
			a.click();
			a.remove();
			window.URL.revokeObjectURL(url);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Failed to download report');
		}
	};

	const fetchHistory = async (newOffset = 0) => {
		try {
			setIsLoading(true);
			const resp = await apiService.get<{ data: HistoryResponse }>(`/api/sessions/history/self?limit=${limit}&offset=${newOffset}`);
			if ((resp as any).success) {
				const payload = (resp as any).data as HistoryResponse;
				setSessions(newOffset === 0 ? payload.sessions : [...sessions, ...payload.sessions]);
				setHasMore(payload.pagination.hasMore);
				setOffset(newOffset);
			} else {
				throw new Error((resp as any).error || 'Failed to load history');
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Failed to load history');
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		fetchHistory(0);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

		// Auto-refresh a few times in the background to surface recording URLs
		// shortly after a session ends and the backend completes processing/upload.
	useEffect(() => {
			if (sessions.length === 0) return;
			const maxAttempts = Number(import.meta.env.VITE_HISTORY_REFRESH_ATTEMPTS ?? 3);
			const intervalMs = Number(import.meta.env.VITE_HISTORY_REFRESH_INTERVAL_MS ?? 4000);
			let attempts = 0;
			const timer = setInterval(async () => {
				attempts += 1;
			try {
				const resp = await apiService.get<{ data: HistoryResponse }>(`/api/sessions/history/self?limit=${limit}&offset=0`);
				if ((resp as any).success) {
					const payload = (resp as any).data as HistoryResponse;
					setSessions(payload.sessions);
					setHasMore(payload.pagination.hasMore);
				}
			} catch {
				// ignore background refresh errors
			}
				if (attempts >= maxAttempts) {
				clearInterval(timer);
			}
			}, intervalMs);
		return () => clearInterval(timer);
	// Only run this after initial load
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [sessions.length]);

	return (
		<Card className="mt-6">
			<CardHeader>
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<History className="h-5 w-5 text-muted-foreground" />
						<CardTitle className="text-lg">Session History</CardTitle>
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={() => fetchHistory(0)}
						disabled={isLoading}
						className="flex items-center gap-2"
					>
						<RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
						Refresh
					</Button>
				</div>
			</CardHeader>

			<CardContent>
				{error && (
					<div className="mb-4">
						<ErrorState error={error} onDismiss={() => setError(null)} />
					</div>
				)}

				{isLoading && sessions.length === 0 ? (
					<LoadingState text="Loading session history..." />
				) : sessions.length === 0 ? (
					<EmptyState 
						icon="calendar"
						title="No past sessions found"
						description="Interview sessions you've completed will appear here."
					/>
				) : (
					<div className="space-y-4">
						{sessions.map((session) => (
							<SessionCard
								key={session.sessionId}
								session={session}
								onDownloadReport={handleDownloadReport}
							/>
						))}
					</div>
				)}

				{hasMore && (
					<div className="mt-6 flex justify-center">
						<Button
							variant="outline"
							onClick={() => fetchHistory(offset + limit)}
							disabled={isLoading}
							className="flex items-center gap-2"
						>
							{isLoading ? (
								<>
									<RefreshCw className="h-4 w-4 animate-spin" />
									Loading...
								</>
							) : (
								'Load More Sessions'
							)}
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	);
};

export default SessionHistory;
