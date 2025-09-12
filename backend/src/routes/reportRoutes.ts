import express, { Request, Response } from 'express';
import { ReportService } from '../services/reportService';
import { validateRequest, validateParams, validateQuery } from '../middleware/validation';
import { authenticate } from '../middleware/auth';
import { z } from 'zod';

const router = express.Router();

// Validation schemas
const GenerateReportSchema = z.object({
  sessionId: z.string().uuid(),
  includeManualObservations: z.boolean().optional().default(true)
});

const ReportParamsSchema = z.object({
  reportId: z.string().uuid()
});

const ExportQuerySchema = z.object({
  format: z.enum(['pdf', 'csv']),
  includeManualObservations: z.union([z.string(), z.boolean()]).optional().transform(val => {
    if (typeof val === 'string') return val === 'true';
    return val !== false;
  }).default(true)
});

const ManualObservationSchema = z.object({
  sessionId: z.string().uuid(),
  observationType: z.enum(['suspicious_behavior', 'technical_issue', 'general_note', 'violation']),
  description: z.string().min(1).max(1000),
  severity: z.enum(['low', 'medium', 'high']),
  flagged: z.boolean().optional().default(false)
});

const UpdateObservationSchema = z.object({
  flagged: z.boolean()
});

/**
 * POST /api/reports/generate
 * Generate a new proctoring report for a session
 */
router.post('/generate', 
  authenticate,
  validateRequest(GenerateReportSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId, includeManualObservations } = req.body;
      
      const reportId = await ReportService.generateReport(sessionId, includeManualObservations);
      
      res.status(202).json({
        success: true,
        data: {
          reportId,
          message: 'Report generation started. Use the reportId to check status.'
        }
      });
    } catch (error) {
      console.error('Error generating report:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate report'
      });
    }
  }
);

/**
 * GET /api/reports/:reportId/status
 * Get report generation status
 */
router.get('/:reportId/status',
  authenticate,
  validateParams(ReportParamsSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { reportId } = req.params;
      
      const status = ReportService.getReportStatus(reportId as string);
      
      if (!status) {
        res.status(404).json({
          success: false,
          error: 'Report not found'
        });
        return;
      }
      
      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      console.error('Error getting report status:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get report status'
      });
    }
  }
);

/**
 * GET /api/reports/:reportId
 * Get completed report data
 */
router.get('/:reportId',
  authenticate,
  validateParams(ReportParamsSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { reportId } = req.params;
      
      const report = await ReportService.getReport(reportId as string);
      
      res.json({
        success: true,
        data: report
      });
    } catch (error) {
      console.error('Error getting report:', error);
      const statusCode = error instanceof Error && error.message.includes('not found') ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get report'
      });
    }
  }
);

/**
 * GET /api/reports/:reportId/export
 * Export report as PDF or CSV
 */
router.get('/:reportId/export',
  authenticate,
  validateParams(ReportParamsSchema),
  validateQuery(ExportQuerySchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { reportId } = req.params;
      const { format, includeManualObservations } = (req as any).validatedQuery;
      
      let buffer: Buffer;
      let contentType: string;
      let filename: string;
      
      if (format === 'pdf') {
        buffer = await ReportService.exportReportAsPDF(reportId as string, includeManualObservations);
        contentType = 'application/pdf';
        filename = `proctoring-report-${reportId}.pdf`;
      } else {
        buffer = await ReportService.exportReportAsCSV(reportId as string, includeManualObservations);
        contentType = 'text/csv';
        filename = `proctoring-report-${reportId}.csv`;
      }
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', buffer.length);
      
      res.send(buffer);
    } catch (error) {
      console.error('Error exporting report:', error);
      const statusCode = error instanceof Error && error.message.includes('not found') ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to export report'
      });
    }
  }
);

/**
 * POST /api/reports/observations
 * Add manual observation to a session
 */
router.post('/observations',
  authenticate,
  validateRequest(ManualObservationSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId, observationType, description, severity, flagged } = req.body;
      const interviewerId = (req as any).user.userId; // From auth middleware
      
      const observation = await ReportService.addManualObservation(
        sessionId,
        interviewerId,
        observationType,
        description,
        severity,
        flagged
      );
      
      res.status(201).json({
        success: true,
        data: observation
      });
    } catch (error) {
      console.error('Error adding manual observation:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add manual observation'
      });
    }
  }
);

/**
 * GET /api/reports/observations/:sessionId
 * Get manual observations for a session
 */
router.get('/observations/:sessionId',
  authenticate,
  validateParams(z.object({ sessionId: z.string().uuid() })),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;
      
      const observations = await ReportService.getManualObservations(sessionId as string);
      
      res.json({
        success: true,
        data: observations
      });
    } catch (error) {
      console.error('Error getting manual observations:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get manual observations'
      });
    }
  }
);

/**
 * PATCH /api/reports/observations/:observationId/flag
 * Update observation flagged status
 */
router.patch('/observations/:observationId/flag',
  authenticate,
  validateParams(z.object({ observationId: z.string().uuid() })),
  validateRequest(UpdateObservationSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { observationId } = req.params;
      const { flagged } = req.body;
      
      const observation = await ReportService.updateObservationFlag(observationId as string, flagged);
      
      res.json({
        success: true,
        data: observation
      });
    } catch (error) {
      console.error('Error updating observation flag:', error);
      const statusCode = error instanceof Error && error.message.includes('not found') ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update observation flag'
      });
    }
  }
);

export default router;