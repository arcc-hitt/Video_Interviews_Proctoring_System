// Computer Vision Configuration
// Centralized configuration for all CV-related services

export const CV_CONFIG = {
  // Face Detection Configuration
  faceDetection: {
    // MediaPipe settings
    maxNumFaces: 3, // Allow up to 3 faces to detect multiple faces scenarios
    refineLandmarks: false, // Disable for better performance
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.5,
    
    // Focus detection thresholds
    focusLossThreshold: 5000, // 5 seconds
    absenceThreshold: 10000, // 10 seconds
    gazeThreshold: 0.3, // Gaze direction threshold
    
    // Processing settings
    processingInterval: 100, // Process every 100ms
    maxProcessingTime: 50, // Max time per frame processing
    
    // CDN URL for MediaPipe models
    modelPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/',
  },

  // Object Detection Configuration
  objectDetection: {
    // TensorFlow.js model settings
    modelType: 'lite_mobilenet_v2', // Lightweight model for better performance
    confidenceThreshold: 0.5,
    maxDetections: 20,
    
    // Persistence settings
    persistenceThreshold: 2000, // 2 seconds
    itemExpiryTime: 5000, // 5 seconds without detection
    
    // Unauthorized item categories
    unauthorizedItems: {
      'cell phone': 'phone',
      'mobile phone': 'phone',
      'book': 'book',
      'laptop': 'laptop',
      'tablet': 'tablet',
      'keyboard': 'electronic-device',
      'mouse': 'electronic-device',
      'remote': 'electronic-device',
      'tv': 'electronic-device'
    }
  },

  // Processing Configuration
  processing: {
    // Frame processing settings
    frameProcessingInterval: 100, // Process every 100ms
    maxFrameQueueSize: 5, // Max frames in processing queue
    enableWebWorker: true, // Use web workers for processing
    
    // Event deduplication
    deduplicationWindow: 5000, // 5 seconds
    confidenceThreshold: 0.1, // Min confidence difference for new events
    
    // Batch processing
    eventBatchSize: 10,
    batchFlushInterval: 2000, // 2 seconds
    
    // Error handling
    maxRetryAttempts: 3,
    retryDelay: 1000, // 1 second
    fallbackProcessing: true // Enable fallback when services fail
  },

  // Drowsiness/Audio Enhanced Monitoring
  enhancedMonitoring: {
    // Face mesh sampling interval in ms for EAR computations
    faceMeshSampleInterval: Number(import.meta.env.VITE_DROWSINESS_SAMPLE_MS ?? 300),
    // Eye Aspect Ratio thresholds
    earClosedThreshold: Number(import.meta.env.VITE_EAR_CLOSED_THRESHOLD ?? 0.22),
    earLongBlinkMs: Number(import.meta.env.VITE_EAR_LONG_BLINK_MS ?? 350),
    // Audio anomaly smoothing
    audioEventDebounceMs: Number(import.meta.env.VITE_AUDIO_EVENT_DEBOUNCE_MS ?? 1000)
  },

  // Real-time Communication
  realtime: {
    // WebSocket settings
    reconnectAttempts: 5,
    reconnectDelay: 1000,
    heartbeatInterval: 30000, // 30 seconds
    
    // Alert settings
    maxAlertsInMemory: 100,
    alertExpiryTime: 300000, // 5 minutes
    
    // Event broadcasting
    broadcastDelay: 100, // Small delay to batch events
    maxBroadcastQueue: 50
  },

  // Performance Optimization
  performance: {
    // Resource management
    maxMemoryUsage: 100 * 1024 * 1024, // 100MB
    gcInterval: 60000, // Garbage collect every minute
    
    // Adaptive processing
    enableAdaptiveProcessing: true,
    minProcessingInterval: 50, // Minimum 50ms between frames
    maxProcessingInterval: 500, // Maximum 500ms between frames
    
    // Quality settings
    adaptiveQuality: true,
    minVideoQuality: 0.5, // 50% quality minimum
    maxVideoQuality: 1.0 // 100% quality maximum
  },

  // Development/Debug settings
  debug: {
    enableLogging: process.env.NODE_ENV === 'development',
    logLevel: process.env.NODE_ENV === 'development' ? 'debug' : 'error',
    enablePerformanceMetrics: process.env.NODE_ENV === 'development',
    showDebugOverlay: false,
    
    // Testing overrides
    mockDetections: false,
    simulateNetworkDelay: 0,
    forceProcessingErrors: false
  }
};

// Environment-specific overrides
if (process.env.NODE_ENV === 'production') {
  CV_CONFIG.debug.enableLogging = false;
  CV_CONFIG.debug.enablePerformanceMetrics = false;
  CV_CONFIG.processing.fallbackProcessing = true;
}

// Export specific configurations for easier imports
export const FACE_DETECTION_CONFIG = CV_CONFIG.faceDetection;
export const OBJECT_DETECTION_CONFIG = CV_CONFIG.objectDetection;
export const PROCESSING_CONFIG = CV_CONFIG.processing;
export const REALTIME_CONFIG = CV_CONFIG.realtime;
export const PERFORMANCE_CONFIG = CV_CONFIG.performance;
export const DEBUG_CONFIG = CV_CONFIG.debug;
export const ENHANCED_MONITORING_CONFIG = CV_CONFIG.enhancedMonitoring;
