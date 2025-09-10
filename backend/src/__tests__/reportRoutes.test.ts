import request from 'supertest';
import express from 'express';
import reportRoutes from '../routes/reportRoutes';
import { ReportService } from '../services/reportService';
import { v4 as uuidv4 } from 'uuid';

// Mock the ReportService
jest.mock('../services/reportService');
const mockReportService = ReportService as jest.Mocked<typeof ReportService>;

// Mock auth middleware
jest.mock('../middleware/auth', () => ({
  authenticate: (req: any, res: any, next: any) => {
    req.user = { userId: uuidv4(), role: 'interviewer' };
    next();
  }
}));

const app = express();
app.use(express.json());
app.use('/api/reports', reportRoutes);

describe('Report Routes', () => {
  const mockReportId = uuidv4();
  const mockSessionId = uuidv4();
  const mockObservationId = uuidv4();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/reports/generate', () => {
    it('should generate report successfully', async () => {
      mockReportService.generateReport.mockResolvedValue(mockReportId);

      const response = await request(app)
        .post('/api/reports/generate')
        .send({
          sessionId: mockSessionId,
          includeManualObservations: true
        });

      expect(response.status).toBe(202);
      expect(response.body.success).toBe(true);
      expect(response.body.data.reportId).toBe(mockReportId);
      expect(mockReportService.generateReport).toHaveBeenCalledWith(mockSessionId, true);
    });

    it('should return 400 for invalid session ID', async () => {
      const response = await request(app)
        .post('/api/reports/generate')
        .send({
          sessionId: 'invalid-uuid',
          includeManualObservations: true
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should handle service errors', async () => {
      mockReportService.generateReport.mockRejectedValue(new Error('Service error'));

      const response = await request(app)
        .post('/api/reports/generate')
        .send({
          sessionId: mockSessionId,
          includeManualObservations: true
        });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Service error');
    });
  });

  describe('GET /api/reports/:reportId/status', () => {
    it('should return report status', async () => {
      const mockStatus = {
        reportId: mockReportId,
        status: 'completed' as const,
        progress: 100,
        message: 'Report generation completed'
      };

      mockReportService.getReportStatus.mockReturnValue(mockStatus);

      const response = await request(app)
        .get(`/api/reports/${mockReportId}/status`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockStatus);
    });

    it('should return 404 for non-existent report', async () => {
      mockReportService.getReportStatus.mockReturnValue(null);

      const response = await request(app)
        .get(`/api/reports/${mockReportId}/status`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it('should return 400 for invalid report ID format', async () => {
      const response = await request(app)
        .get('/api/reports/invalid-uuid/status');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/reports/:reportId', () => {
    it('should return report data', async () => {
      const mockReport = {
        reportId: mockReportId,
        sessionId: mockSessionId,
        candidateName: 'John Doe',
        integrityScore: 85,
        suspiciousEvents: [],
        manualObservations: []
      };

      mockReportService.getReport.mockResolvedValue(mockReport);

      const response = await request(app)
        .get(`/api/reports/${mockReportId}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockReport);
    });

    it('should return 404 for non-existent report', async () => {
      mockReportService.getReport.mockRejectedValue(new Error('Report not found'));

      const response = await request(app)
        .get(`/api/reports/${mockReportId}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/reports/:reportId/export', () => {
    it('should export report as PDF', async () => {
      const mockPdfBuffer = Buffer.from('mock-pdf-content');
      mockReportService.exportReportAsPDF.mockResolvedValue(mockPdfBuffer);

      const response = await request(app)
        .get(`/api/reports/${mockReportId}/export`)
        .query({ format: 'pdf', includeManualObservations: true });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('.pdf');
      expect(Buffer.from(response.body)).toEqual(mockPdfBuffer);
    });

    it('should export report as CSV', async () => {
      const mockCsvBuffer = Buffer.from('mock-csv-content');
      mockReportService.exportReportAsCSV.mockResolvedValue(mockCsvBuffer);

      const response = await request(app)
        .get(`/api/reports/${mockReportId}/export`)
        .query({ format: 'csv', includeManualObservations: false });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('text/csv');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('.csv');
      expect(Buffer.from(response.body)).toEqual(mockCsvBuffer);
    });

    it('should return 400 for invalid format', async () => {
      const response = await request(app)
        .get(`/api/reports/${mockReportId}/export`)
        .query({ format: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should handle export errors', async () => {
      mockReportService.exportReportAsPDF.mockRejectedValue(new Error('Export failed'));

      const response = await request(app)
        .get(`/api/reports/${mockReportId}/export`)
        .query({ format: 'pdf' });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/reports/observations', () => {
    it('should add manual observation successfully', async () => {
      const mockObservation = {
        observationId: mockObservationId,
        sessionId: mockSessionId,
        interviewerId: uuidv4(),
        timestamp: new Date().toISOString(),
        observationType: 'suspicious_behavior' as any,
        description: 'Test observation',
        severity: 'medium' as any,
        flagged: false
      };

      mockReportService.addManualObservation.mockResolvedValue(mockObservation);

      const response = await request(app)
        .post('/api/reports/observations')
        .send({
          sessionId: mockSessionId,
          observationType: 'suspicious_behavior',
          description: 'Test observation',
          severity: 'medium',
          flagged: false
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockObservation);
    });

    it('should return 400 for invalid observation data', async () => {
      const response = await request(app)
        .post('/api/reports/observations')
        .send({
          sessionId: 'invalid-uuid',
          observationType: 'invalid_type',
          description: '',
          severity: 'invalid_severity'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should handle service errors', async () => {
      mockReportService.addManualObservation.mockRejectedValue(new Error('Service error'));

      const response = await request(app)
        .post('/api/reports/observations')
        .send({
          sessionId: mockSessionId,
          observationType: 'suspicious_behavior',
          description: 'Test observation',
          severity: 'medium'
        });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/reports/observations/:sessionId', () => {
    it('should return manual observations for session', async () => {
      const mockObservations = [
        {
          observationId: uuidv4(),
          sessionId: mockSessionId,
          interviewerId: uuidv4(),
          timestamp: new Date().toISOString(),
          observationType: 'suspicious_behavior' as any,
          description: 'Test observation 1',
          severity: 'medium' as any,
          flagged: false
        },
        {
          observationId: uuidv4(),
          sessionId: mockSessionId,
          interviewerId: uuidv4(),
          timestamp: new Date().toISOString(),
          observationType: 'general_note' as any,
          description: 'Test observation 2',
          severity: 'low' as any,
          flagged: true
        }
      ];

      mockReportService.getManualObservations.mockResolvedValue(mockObservations);

      const response = await request(app)
        .get(`/api/reports/observations/${mockSessionId}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockObservations);
    });

    it('should return 400 for invalid session ID', async () => {
      const response = await request(app)
        .get('/api/reports/observations/invalid-uuid');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('PATCH /api/reports/observations/:observationId/flag', () => {
    it('should update observation flag successfully', async () => {
      const mockObservation = {
        observationId: mockObservationId,
        sessionId: mockSessionId,
        interviewerId: uuidv4(),
        timestamp: new Date().toISOString(),
        observationType: 'suspicious_behavior' as any,
        description: 'Test observation',
        severity: 'medium' as any,
        flagged: true
      };

      mockReportService.updateObservationFlag.mockResolvedValue(mockObservation);

      const response = await request(app)
        .patch(`/api/reports/observations/${mockObservationId}/flag`)
        .send({ flagged: true });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockObservation);
      expect(mockReportService.updateObservationFlag).toHaveBeenCalledWith(mockObservationId, true);
    });

    it('should return 404 for non-existent observation', async () => {
      mockReportService.updateObservationFlag.mockRejectedValue(new Error('Observation not found'));

      const response = await request(app)
        .patch(`/api/reports/observations/${mockObservationId}/flag`)
        .send({ flagged: true });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it('should return 400 for invalid observation ID', async () => {
      const response = await request(app)
        .patch('/api/reports/observations/invalid-uuid/flag')
        .send({ flagged: true });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should return 400 for invalid flagged value', async () => {
      const response = await request(app)
        .patch(`/api/reports/observations/${mockObservationId}/flag`)
        .send({ flagged: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
});