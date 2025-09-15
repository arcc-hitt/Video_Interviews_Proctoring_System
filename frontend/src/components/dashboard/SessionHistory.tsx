import React, { useEffect, useState } from 'react';
import apiService from '../../services/apiService';

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

	const formatDuration = (seconds?: number) => {
		if (!seconds && seconds !== 0) return '-';
		const m = Math.floor(seconds / 60);
		const s = seconds % 60;
		return `${m}:${s.toString().padStart(2, '0')}`;
		};

	return (
		<div className="bg-white shadow rounded-lg p-6 mt-6">
			<div className="flex justify-between items-center mb-4">
				<h2 className="text-lg font-medium text-gray-900">Session History</h2>
				<button
					onClick={() => fetchHistory(0)}
					className="px-3 py-1 text-sm font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100"
				>
					Refresh
				</button>
			</div>

			{error && (
				<div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded mb-4">
					{error}
				</div>
			)}

			{isLoading && sessions.length === 0 ? (
				<div className="text-center py-8 text-gray-500">Loading history...</div>
			) : sessions.length === 0 ? (
				<div className="text-center py-8 text-gray-500">No past sessions found</div>
			) : (
				<div className="space-y-3">
					{sessions.map((s) => (
						<div key={s.sessionId} className="border border-gray-200 rounded p-4">
							<div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
								<div>
									<div className="font-medium text-gray-900">{s.candidateName}</div>
									<div className="text-sm text-gray-500">{new Date(s.startTime).toLocaleString()} → {s.endTime ? new Date(s.endTime).toLocaleString() : '-'}</div>
									<div className="text-xs text-gray-500">Session: {s.sessionId}</div>
								</div>
								<div className="flex items-center gap-2">
									<span className={`px-2 py-1 text-xs rounded-full ${s.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{s.status}</span>
									<span className="text-xs text-gray-600">Duration: {formatDuration(s.duration)}</span>
								</div>
								<div className="flex items-center gap-2">
														{s.recordingUrl ? (
															<a
																href={s.recordingUrl.startsWith('http') ? s.recordingUrl : `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'}${s.recordingUrl}`}
											target="_blank"
											rel="noopener noreferrer"
											className="px-3 py-1 text-sm font-medium text-white bg-gray-700 rounded hover:bg-gray-800"
										>
											Download Recording
										</a>
									) : (
										<button className="px-3 py-1 text-sm font-medium text-gray-500 bg-gray-100 rounded cursor-not-allowed" disabled>
											No Recording
										</button>
									)}
									{s.reportId ? (
																		<button
																			onClick={() => handleDownloadReport(s.reportId!)}
																			className="px-3 py-1 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
																		>
																			Download Report (PDF)
																		</button>
									) : (
										<button className="px-3 py-1 text-sm font-medium text-gray-500 bg-gray-100 rounded cursor-not-allowed" disabled>
											No Report
										</button>
									)}
								</div>
							</div>
						</div>
					))}
				</div>
			)}

			{hasMore && (
				<div className="mt-4 flex justify-center">
					<button
						onClick={() => fetchHistory(offset + limit)}
						className="px-4 py-2 text-sm font-medium text-white bg-gray-800 rounded hover:bg-black disabled:opacity-50"
						disabled={isLoading}
					>
						{isLoading ? 'Loading...' : 'Load More'}
					</button>
				</div>
			)}
		</div>
	);
};

export default SessionHistory;
