import { useCallback, useEffect, useRef, useState } from 'react';

interface UseScreenRecordingOptions {
	sessionId: string;
	candidateId: string;
	filenamePrefix?: string;
	chunkSizeBytes?: number; // default 8MB (kept below backend default 10MB)
}

interface RecordingState {
	isRecording: boolean;
	error: string | null;
	progress: number; // upload progress percentage
	bytesRecorded: number;
}

export function useScreenRecording(options: UseScreenRecordingOptions) {
	const { sessionId, candidateId, filenamePrefix = 'recording', chunkSizeBytes = 8 * 1024 * 1024 } = options;

	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const recordedChunksRef = useRef<Blob[]>([]);
	const metaRef = useRef<{ sessionId: string; candidateId: string }>({ sessionId, candidateId });
	const [state, setState] = useState<RecordingState>({ isRecording: false, error: null, progress: 0, bytesRecorded: 0 });

	// keep latest ids
	useEffect(() => {
		metaRef.current = { sessionId, candidateId };
	}, [sessionId, candidateId]);

	const start = useCallback((stream: MediaStream) => {
		try {
			if (mediaRecorderRef.current) {
				mediaRecorderRef.current.stop();
				mediaRecorderRef.current = null;
			}
			recordedChunksRef.current = [];
			setState({ isRecording: true, error: null, progress: 0, bytesRecorded: 0 });

			const mimeType = getSupportedMimeType();
			const recorder = new MediaRecorder(stream, { mimeType });
			mediaRecorderRef.current = recorder;

			recorder.ondataavailable = (event: BlobEvent) => {
				if (event.data && event.data.size > 0) {
					recordedChunksRef.current.push(event.data);
					setState(prev => ({ ...prev, bytesRecorded: prev.bytesRecorded + event.data.size }));
				}
			};

			recorder.onerror = (e) => {
				setState(prev => ({ ...prev, error: (e as any).error?.message || 'Recording error' }));
			};

			recorder.start(); // collect as one blob; we will slice on stop
		} catch (e) {
			setState({ isRecording: false, error: e instanceof Error ? e.message : 'Failed to start recording', progress: 0, bytesRecorded: 0 });
		}
	}, []);

		const stop = useCallback(async () => {
		if (!mediaRecorderRef.current) return { success: false };
		const recorder = mediaRecorderRef.current;
		return new Promise<{ success: boolean; url?: string }>((resolve) => {
			recorder.onstop = async () => {
				try {
					const isMp4 = !!(recorder.mimeType && recorder.mimeType.includes('mp4'));
					const containerType = isMp4 ? 'video/mp4' : 'video/webm';
					const blob = new Blob(recordedChunksRef.current, { type: containerType });
					const filename = `${filenamePrefix}_${sessionId}_${Date.now()}.${isMp4 ? 'mp4' : 'webm'}`;
					const token = localStorage.getItem('auth_token');
					const { sessionId: sid, candidateId: cid } = metaRef.current;
					if (!sid || !cid) {
						throw new Error('Missing session or candidate information for upload');
					}
					const totalChunks = Math.ceil(blob.size / chunkSizeBytes);
					let uploaded = 0;
					for (let i = 0; i < totalChunks; i++) {
						const start = i * chunkSizeBytes;
						const end = Math.min(start + chunkSizeBytes, blob.size);
						const chunkBlob = blob.slice(start, end, containerType);
						const form = new FormData();
						form.append('chunk', new File([chunkBlob], filename, { type: containerType }));
						form.append('sessionId', sid);
						form.append('candidateId', cid);
						form.append('chunkIndex', String(i));
						form.append('totalChunks', String(totalChunks));
						form.append('filename', filename);

						const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'}/api/videos/upload`, {
							method: 'POST',
							headers: token ? { Authorization: `Bearer ${token}` } : undefined,
							body: form
						});
						if (!res.ok) {
							if (res.status === 413) {
								const data = await res.json().catch(() => ({}));
								const maxMb = data?.maxChunkBytes ? Math.round(data.maxChunkBytes / (1024 * 1024)) : undefined;
								throw new Error(`Chunk too large for server.${maxMb ? ` Max ${maxMb}MB per chunk.` : ''} Please retry.`);
							}
							const data = await res.json().catch(() => ({}));
							throw new Error(data.error || data.message || `Upload failed at chunk ${i + 1}/${totalChunks}`);
						}

						uploaded += chunkBlob.size;
						setState(prev => ({ ...prev, progress: Math.round((uploaded / blob.size) * 100) }));
					}

					setState(prev => ({ ...prev, isRecording: false }));
					resolve({ success: true });
				} catch (e) {
					setState(prev => ({ ...prev, isRecording: false, error: e instanceof Error ? e.message : 'Upload failed' }));
					resolve({ success: false });
				} finally {
					recordedChunksRef.current = [];
				}
			};

			recorder.stop();
			mediaRecorderRef.current = null;
		});
		}, [chunkSizeBytes, filenamePrefix]);

	return {
		...state,
		start,
		stop
	};
}

// local util duplicated here to avoid extra imports
function getSupportedMimeType(): string {
	const types = [
		// Prefer MP4 if the browser supports it (Safari/iOS). This avoids server conversion.
		'video/mp4;codecs=h264',
		'video/mp4',
		// Fallbacks for Chromium/Firefox where MP4 via MediaRecorder is typically unsupported
		'video/webm;codecs=vp9',
		'video/webm;codecs=vp8',
		'video/webm'
	];
	for (const type of types) {
		if ((window as any).MediaRecorder && (window as any).MediaRecorder.isTypeSupported(type)) {
			return type;
		}
	}
	return 'video/webm';
}

export default useScreenRecording;
