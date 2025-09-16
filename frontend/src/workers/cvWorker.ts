// Shared CV worker: add face mesh estimation to offload main thread

let detector: any | null = null;
let initializing = false;

async function initDetector() {
	if (detector || initializing) return;
	initializing = true;
	try {
		const tf = await import('@tensorflow/tfjs-core');
		await tf.ready();
		await import('@tensorflow/tfjs-backend-webgl');
		const faceLandmarksDetection = await import('@tensorflow-models/face-landmarks-detection');
		detector = await faceLandmarksDetection.createDetector(
			faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
			{ runtime: 'tfjs', refineLandmarks: true, maxFaces: 1 } as any
		);
		// Signal ready
		(self as any).postMessage({ type: 'INITIALIZED' });
	} catch (err: any) {
		(self as any).postMessage({ type: 'ERROR', error: err?.message || String(err) });
	} finally {
		initializing = false;
	}
}

async function processFrame(id: string, imageData: ImageData) {
	try {
		if (!detector) await initDetector();
		if (!detector) throw new Error('FaceMesh detector not available');

		const tf = await import('@tensorflow/tfjs-core');
		const t = tf.browser.fromPixels(imageData);
		const faces = await detector.estimateFaces(t as any, { flipHorizontal: false });
		t.dispose();

		let landmarks: Array<{ x: number; y: number; z: number }> = [];
		if (faces && faces.length > 0) {
			const kp = (faces[0] as any).keypoints as Array<{ x: number; y: number; z?: number }>;
			const w = imageData.width;
			const h = imageData.height;
			landmarks = kp.map(p => ({ x: p.x / w, y: p.y / h, z: (p.z ?? 0) / Math.max(w, h) }));
		}

		(self as any).postMessage({
			type: 'FRAME_PROCESSED',
			id,
			data: {
				faceDetection: landmarks.length ? { landmarks, confidence: 1, timestamp: new Date() } : undefined,
				processingTime: 0
			}
		});
	} catch (err: any) {
		(self as any).postMessage({ id, error: err?.message || String(err) });
	}
}

(self as any).onmessage = (event: MessageEvent) => {
	const { type, id, data } = event.data || {};
	switch (type) {
		case 'INITIALIZE':
			initDetector();
			break;
		case 'PROCESS_FRAME':
			processFrame(id, data?.imageData);
			break;
		case 'CLEANUP':
			detector = null;
			(self as any).postMessage({ type: 'CLEANUP_COMPLETE' });
			break;
		default:
			break;
	}
};

