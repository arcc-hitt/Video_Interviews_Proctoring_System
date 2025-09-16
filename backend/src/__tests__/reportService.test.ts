import { ReportService } from '../services/reportService';
import { DetectionEvent } from '../models/DetectionEvent';
import { InterviewSession } from '../models/InterviewSession';
import { ProctoringReport } from '../models/ProctoringReport';
import { ManualObservation } from '../models/ManualObservation';
import { EventType, SessionStatus } from '../types';
import { v4 as uuidv4 } from 'uuid';

// Mock puppeteer
jest.mock('puppeteer', () => ({
  launch: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      setContent: jest.fn(),
      pdf: jest.fn().mockResolvedValue(Buffer.from('mock-pdf-content'))
    }),
    close: jest.fn()
  })
}));

describe('ReportService', () => {
  const mockSessionId = uuidv4();
  const mockCandidateId = uuidv4();
  const mockInterviewerId = uuidv4();
  const mockReportId = uuidv4();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateReport', () => {
    it('should generate a report successfully', async () => {
      // Mock session data
      const mockSession = {
        sessionId: mockSessionId,
        candidateId: mockCandidateId,
        candidateName: 'John Doe',
        duration: 3600,
        calculateDuration: jest.fn().mockReturnValue(3600)
      };

      // Mock detection events
      const mockEvents = [
        {
          eventType: EventType.FOCUS_LOSS,
          timestamp: new Date(),
          duration: 5,
          metadata: {}
        },
        {
          eventType: EventType.UNAUTHORIZED_ITEM,
          timestamp: new Date(),
          metadata: { objectType: 'phone' }
        }
      ];

      // Mock database calls
      jest.spyOn(InterviewSession, 'findOne').mockResolvedValue(mockSession as any);
      jest.spyOn(DetectionEvent, 'findBySession').mockResolvedValue(mockEvents as any);
      jest.spyOn(ManualObservation, 'findBySession').mockResolvedValue([] as any);
      jest.spyOn(ProctoringReport.prototype, 'save').mockResolvedValue({} as any);

      const reportId = await ReportService.generateReport(mockSessionId);

      expect(reportId).toBeDefined();
      expect(typeof reportId).toBe('string');
    });

    it('should return reportId even for non-existent session (async processing)', async () => {
      jest.spyOn(InterviewSession, 'findOne').mockResolvedValue(null);

      const reportId = await ReportService.generateReport('invalid-session-id');
      expect(reportId).toBeDefined();
      expect(typeof reportId).toBe('string');
      
      // Wait a bit for async processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check that status shows failed
      const status = ReportService.getReportStatus(reportId);
      expect(status?.status).toBe('failed');
    });
  });

  describe('getReportStatus', () => {
    it('should return null for non-existent report', () => {
      const status = ReportService.getReportStatus('non-existent-id');
      expect(status).toBeNull();
    });
  });

  describe('getReport', () => {
    it('should retrieve report with manual observations', async () => {
      const mockReport = {
        reportId: mockReportId,
        sessionId: mockSessionId,
        candidateName: 'John Doe',
        toJSON: jest.fn().mockReturnValue({
          reportId: mockReportId,
          sessionId: mockSessionId,
          candidateName: 'John Doe'
        })
      };

      const mockObservations = [
        {
          observationId: uuidv4(),
          sessionId: mockSessionId,
          description: 'Test observation',
          toJSON: jest.fn().mockReturnValue({
            observationId: uuidv4(),
            sessionId: mockSessionId,
            description: 'Test observation'
          })
        }
      ];

      jest.spyOn(ProctoringReport, 'findOne').mockResolvedValue(mockReport as any);
      (ManualObservation.findBySession as jest.Mock) = jest.fn().mockResolvedValue(mockObservations);

      const report = await ReportService.getReport(mockReportId);

      expect(report).toBeDefined();
      expect(report.reportId).toBe(mockReportId);
      expect(report.manualObservations).toHaveLength(1);
    });

    it('should throw error for non-existent report', async () => {
      jest.spyOn(ProctoringReport, 'findOne').mockResolvedValue(null);

      await expect(ReportService.getReport('invalid-report-id')).rejects.toThrow('Report not found');
    });
  });

  describe('exportReportAsPDF', () => {
    it('should export report as PDF buffer', async () => {
      const mockReport = {
        reportId: mockReportId,
        candidateName: 'John Doe',
        sessionId: mockSessionId,
        integrityScore: 85,
        suspiciousEvents: [],
        manualObservations: []
      };

      jest.spyOn(ReportService, 'getReport').mockResolvedValue(mockReport);

      const pdfBuffer = await ReportService.exportReportAsPDF(mockReportId);

      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.toString()).toBe('mock-pdf-content');
    });
  });

  describe('exportReportAsCSV', () => {
    it('should export report as CSV buffer', async () => {
      const mockReport = {
        reportId: mockReportId,
        candidateName: 'John Doe',
        sessionId: mockSessionId,
        interviewDuration: 3600,
        integrityScore: 85,
        focusLossCount: 1,
        absenceCount: 0,
        multipleFacesCount: 0,
        unauthorizedItemsCount: 1,
        generatedAt: new Date(),
        suspiciousEvents: [
          {
            eventType: EventType.FOCUS_LOSS,
            timestamp: new Date(),
            duration: 5,
            description: 'Candidate looked away'
          }
        ],
        manualObservations: [
          {
            timestamp: new Date(),
            observationType: 'suspicious_behavior',
            description: 'Manual observation',
            severity: 'medium',
            flagged: true
          }
        ]
      };

      jest.spyOn(ReportService, 'getReport').mockResolvedValue(mockReport);

      const csvBuffer = await ReportService.exportReportAsCSV(mockReportId, true);

      expect(csvBuffer).toBeInstanceOf(Buffer);
      
      const csvContent = csvBuffer.toString();
      expect(csvContent).toContain('Report Summary');
      expect(csvContent).toContain('John Doe');
      expect(csvContent).toContain('Suspicious Event');
      expect(csvContent).toContain('Manual Observation');
    });
  });

  describe('addManualObservation', () => {
    it('should add manual observation successfully', async () => {
      const mockResult = {
        observationId: uuidv4(),
        sessionId: mockSessionId,
        description: 'Test observation'
      };

      const mockObservation = {
        save: jest.fn().mockResolvedValue({}),
        toJSON: jest.fn().mockReturnValue(mockResult)
      };

      jest.spyOn(ManualObservation.prototype, 'save').mockImplementation(mockObservation.save);
      jest.spyOn(ManualObservation.prototype, 'toJSON').mockImplementation(mockObservation.toJSON);

      const result = await ReportService.addManualObservation(
        mockSessionId,
        mockInterviewerId,
        'suspicious_behavior',
        'Test observation',
        'medium',
        false
      );

      expect(result).toBeDefined();
      expect(result).toEqual(mockResult);
    });
  });

  describe('updateObservationFlag', () => {
    it('should update observation flag successfully', async () => {
      const mockObservation = {
        observationId: uuidv4(),
        flagged: false,
        save: jest.fn().mockResolvedValue({}),
        toJSON: jest.fn().mockReturnValue({
          observationId: uuidv4(),
          flagged: true
        })
      };

      jest.spyOn(ManualObservation, 'findOne').mockResolvedValue(mockObservation as any);

      const result = await ReportService.updateObservationFlag(mockObservation.observationId, true);

      expect(mockObservation.flagged).toBe(true);
      expect(mockObservation.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw error for non-existent observation', async () => {
      jest.spyOn(ManualObservation, 'findOne').mockResolvedValue(null);

      await expect(ReportService.updateObservationFlag('invalid-id', true))
        .rejects.toThrow('Observation not found');
    });
  });

  describe('getManualObservations', () => {
    it('should retrieve manual observations for session', async () => {
      const mockObservations = [
        {
          observationId: uuidv4(),
          sessionId: mockSessionId,
          description: 'Test observation 1',
          toJSON: jest.fn().mockReturnValue({ description: 'Test observation 1' })
        },
        {
          observationId: uuidv4(),
          sessionId: mockSessionId,
          description: 'Test observation 2',
          toJSON: jest.fn().mockReturnValue({ description: 'Test observation 2' })
        }
      ];

      (ManualObservation.findBySession as jest.Mock) = jest.fn().mockResolvedValue(mockObservations);

      const result = await ReportService.getManualObservations(mockSessionId);

      expect(result).toHaveLength(2);
      expect(mockObservations[0]!.toJSON).toHaveBeenCalled();
      expect(mockObservations[1]!.toJSON).toHaveBeenCalled();
    });
  });

  describe('integrity score calculation', () => {
    it('should calculate correct integrity score with various violations', async () => {
      const mockSession = {
        sessionId: mockSessionId,
        candidateId: mockCandidateId,
        candidateName: 'John Doe',
        duration: 3600,
        calculateDuration: jest.fn().mockReturnValue(3600)
      };

      const mockEvents = [
        { eventType: EventType.FOCUS_LOSS, timestamp: new Date(), duration: 5, metadata: {} },
        { eventType: EventType.FOCUS_LOSS, timestamp: new Date(), duration: 3, metadata: {} },
        { eventType: EventType.ABSENCE, timestamp: new Date(), duration: 12, metadata: {} },
        { eventType: EventType.MULTIPLE_FACES, timestamp: new Date(), metadata: { faceCount: 2 } },
        { eventType: EventType.UNAUTHORIZED_ITEM, timestamp: new Date(), metadata: { objectType: 'phone' } }
      ];

      const mockManualObservations = [
        {
          severity: 'high',
          flagged: true,
          toJSON: jest.fn().mockReturnValue({ severity: 'high', flagged: true })
        }
      ];

      jest.spyOn(InterviewSession, 'findOne').mockResolvedValue(mockSession as any);
      jest.spyOn(DetectionEvent, 'findBySession').mockResolvedValue(mockEvents as any);
      (ManualObservation.findBySession as jest.Mock) = jest.fn().mockResolvedValue(mockManualObservations);

      let savedReport: any;
      jest.spyOn(ProctoringReport.prototype, 'save').mockImplementation(function(this: any) {
        savedReport = this;
        return Promise.resolve(this);
      });

      await ReportService.generateReport(mockSessionId, true);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Expected score: 100 - (2*2) - (1*5) - (1*10) - (1*15) - (1*10) = 100 - 4 - 5 - 10 - 15 - 10 = 56
      expect(savedReport.integrityScore).toBe(56);
      expect(savedReport.focusLossCount).toBe(2);
      expect(savedReport.absenceCount).toBe(1);
      expect(savedReport.multipleFacesCount).toBe(1);
      expect(savedReport.unauthorizedItemsCount).toBe(1);
    });
  });

  describe('Cloudinary Integration', () => {
    // Mock cloudStorageService
    const mockCloudStorageService = {
      isEnabled: jest.fn(),
      uploadDocument: jest.fn()
    };

    beforeEach(() => {
      // Mock the cloudStorageService import
      jest.doMock('../services/cloudStorageService', () => ({
        cloudStorageService: mockCloudStorageService
      }));
    });

    it('should upload reports to Cloudinary when enabled', async () => {
      // Enable Cloudinary
      mockCloudStorageService.isEnabled.mockReturnValue(true);
      mockCloudStorageService.uploadDocument
        .mockResolvedValueOnce({
          url: 'https://res.cloudinary.com/test/report.pdf',
          publicId: 'reports/report-pdf'
        })
        .mockResolvedValueOnce({
          url: 'https://res.cloudinary.com/test/report.csv',
          publicId: 'reports/report-csv'
        });

      // Mock database operations
      const mockSession = {
        sessionId: mockSessionId,
        candidateId: mockCandidateId,
        candidateName: 'John Doe',
        duration: 3600,
        calculateDuration: jest.fn().mockReturnValue(3600)
      };

      jest.spyOn(InterviewSession, 'findOne').mockResolvedValue(mockSession);
      jest.spyOn(DetectionEvent, 'findBySession').mockResolvedValue([]);
      jest.spyOn(ManualObservation, 'findBySession').mockResolvedValue([]);

      const savedReport = {
        save: jest.fn(),
        cloudinaryPdfUrl: undefined,
        cloudinaryPdfPublicId: undefined,
        cloudinaryCsvUrl: undefined,
        cloudinaryCsvPublicId: undefined
      };
      jest.spyOn(ProctoringReport.prototype, 'save').mockImplementation(function(this: any) {
        Object.assign(this, savedReport);
        return Promise.resolve(this);
      });

      const reportId = await ReportService.generateReport(mockSessionId, true);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify Cloudinary uploads were called
      expect(mockCloudStorageService.uploadDocument).toHaveBeenCalledTimes(2);
      expect(savedReport.save).toHaveBeenCalledTimes(2); // Once initially, once after Cloudinary upload
    });

    it('should continue gracefully when Cloudinary upload fails', async () => {
      // Enable Cloudinary but make it fail
      mockCloudStorageService.isEnabled.mockReturnValue(true);
      mockCloudStorageService.uploadDocument.mockRejectedValue(new Error('Upload failed'));

      // Mock database operations
      const mockSession = {
        sessionId: mockSessionId,
        candidateId: mockCandidateId,
        candidateName: 'John Doe',
        duration: 3600,
        calculateDuration: jest.fn().mockReturnValue(3600)
      };

      jest.spyOn(InterviewSession, 'findOne').mockResolvedValue(mockSession);
      jest.spyOn(DetectionEvent, 'findBySession').mockResolvedValue([]);
      jest.spyOn(ManualObservation, 'findBySession').mockResolvedValue([]);
      jest.spyOn(ProctoringReport.prototype, 'save').mockResolvedValue(undefined);

      const reportId = await ReportService.generateReport(mockSessionId, true);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 200));

      // Report generation should still complete successfully
      const status = ReportService.getReportStatus(reportId);
      expect(status?.status).toBe('completed');
    });
  });
});