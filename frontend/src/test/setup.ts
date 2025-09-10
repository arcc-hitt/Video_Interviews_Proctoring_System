import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock MediaDevices API
Object.defineProperty(navigator, 'mediaDevices', {
  writable: true,
  configurable: true,
  value: {
    getUserMedia: vi.fn(),
    enumerateDevices: vi.fn(),
  },
});

// Mock MediaRecorder
const MockMediaRecorder: any = vi.fn().mockImplementation(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  ondataavailable: null,
  onstop: null,
  onerror: null,
  state: 'inactive',
}));

MockMediaRecorder.isTypeSupported = vi.fn().mockReturnValue(true);
globalThis.MediaRecorder = MockMediaRecorder;

// Mock RTCPeerConnection
const MockRTCPeerConnection: any = vi.fn().mockImplementation(() => ({}));
MockRTCPeerConnection.generateCertificate = vi.fn().mockResolvedValue({});
globalThis.RTCPeerConnection = MockRTCPeerConnection;

// Mock URL.createObjectURL and revokeObjectURL
globalThis.URL.createObjectURL = vi.fn().mockReturnValue('mock-url');
globalThis.URL.revokeObjectURL = vi.fn();

// Mock HTMLVideoElement methods
Object.defineProperty(HTMLVideoElement.prototype, 'play', {
  writable: true,
  value: vi.fn().mockResolvedValue(undefined),
});

Object.defineProperty(HTMLVideoElement.prototype, 'pause', {
  writable: true,
  value: vi.fn(),
});

// Mock canvas context
HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
  drawImage: vi.fn(),
  getImageData: vi.fn().mockReturnValue({
    data: new Uint8ClampedArray(4),
    width: 1,
    height: 1,
  }),
});

// Mock FileReader
const MockFileReader: any = vi.fn().mockImplementation(() => ({
  readAsDataURL: vi.fn(),
  onload: null,
  onerror: null,
  result: 'data:video/webm;base64,mock-data',
}));

MockFileReader.EMPTY = 0;
MockFileReader.LOADING = 1;
MockFileReader.DONE = 2;
globalThis.FileReader = MockFileReader;