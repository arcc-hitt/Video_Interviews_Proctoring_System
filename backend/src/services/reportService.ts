import puppeteer from 'puppeteer';
import * as csv from 'fast-csv';
import { v4 as uuidv4 } from 'uuid';
import { DetectionEvent } from '../models/DetectionEvent';
import { InterviewSession } from '../models/InterviewSession';
import { ProctoringReport } from '../models/ProctoringReport';
import { ManualObservation } from '../models/ManualObservation';
import { EventType, SuspiciousEvent, ManualObservation as IManualObservation } from '../types';
import { cloudStorageService } from './cloudStorageService';
import { Readable } from 'stream';
import path from 'path';
import fs from 'fs/promises';

// Report generation status tracking
export interface ReportGenerationStatus {
    reportId: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    message?: string;
    error?: string;
}

// In-memory status tracking (in production, use Redis or database)
const reportStatusMap = new Map<string, ReportGenerationStatus>();

export class ReportService {
    /**
     * Generate a comprehensive proctoring report for a session
     */
    static async generateReport(sessionId: string, includeManualObservations: boolean = true): Promise<string> {
        const reportId = uuidv4();

        // Initialize status tracking
        reportStatusMap.set(reportId, {
            reportId,
            status: 'pending',
            progress: 0,
            message: 'Starting report generation'
        });

        try {
            // Start async report generation
            this.processReportGeneration(reportId, sessionId, includeManualObservations);
            return reportId;
        } catch (error) {
            reportStatusMap.set(reportId, {
                reportId,
                status: 'failed',
                progress: 0,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    /**
     * Process report generation asynchronously
     */
    private static async processReportGeneration(
        reportId: string,
        sessionId: string,
        includeManualObservations: boolean
    ): Promise<void> {
        try {
            // Update status to processing
            reportStatusMap.set(reportId, {
                reportId,
                status: 'processing',
                progress: 10,
                message: 'Fetching session data'
            });

            // Fetch session data
            const session = await InterviewSession.findOne({ sessionId });
            if (!session) {
                throw new Error(`Session not found: ${sessionId}`);
            }

            reportStatusMap.set(reportId, {
                reportId,
                status: 'processing',
                progress: 30,
                message: 'Fetching detection events'
            });

            // Fetch detection events
            const detectionEvents = await DetectionEvent.findBySession(sessionId);

            reportStatusMap.set(reportId, {
                reportId,
                status: 'processing',
                progress: 50,
                message: 'Processing events and calculating scores'
            });

            // Fetch manual observations if requested
            let manualObservations: any[] = [];
            if (includeManualObservations) {
                const observations = await ManualObservation.findBySession(sessionId);
                manualObservations = observations.map(obs => obs.toJSON());
            }

            // Calculate event counts and create suspicious events
            const eventCounts = this.calculateEventCounts(detectionEvents);
            const suspiciousEvents = this.createSuspiciousEvents(detectionEvents);

            // Calculate integrity score and detailed breakdown
            const integrityScore = this.calculateIntegrityScore(eventCounts, manualObservations);
            const integrityBreakdown = this.calculateIntegrityScoreBreakdown(eventCounts, manualObservations);

            reportStatusMap.set(reportId, {
                reportId,
                status: 'processing',
                progress: 80,
                message: 'Creating report document'
            });

            // Create proctoring report
            const report = new ProctoringReport({
                reportId,
                sessionId: session.sessionId,
                candidateId: session.candidateId,
                candidateName: session.candidateName,
                interviewDuration: session.duration || (session as any).calculateDuration(),
                focusLossCount: eventCounts.focusLoss,
                absenceCount: eventCounts.absence,
                multipleFacesCount: eventCounts.multipleFaces,
                unauthorizedItemsCount: eventCounts.unauthorizedItems,
                integrityScore,
                suspiciousEvents,
                generatedAt: new Date(),
                // Add integrity breakdown to metadata
                metadata: {
                    integrityBreakdown
                }
            });

            await report.save();

            // Generate and upload reports to Cloudinary if configured
            if (cloudStorageService.isEnabled()) {
                reportStatusMap.set(reportId, {
                    reportId,
                    status: 'processing',
                    progress: 70,
                    message: 'Generating PDF report'
                });

                try {
                    // Generate PDF
                    const pdfBuffer = await this.exportReportAsPDF(reportId, includeManualObservations);
                    const pdfResult = await cloudStorageService.uploadDocument(
                        pdfBuffer,
                        `proctoring-report-${reportId}.pdf`,
                        {
                            public_id: `proctoring-report-${reportId}-pdf`,
                            folder: 'video-interviews/reports'
                        }
                    );

                    reportStatusMap.set(reportId, {
                        reportId,
                        status: 'processing',
                        progress: 85,
                        message: 'Generating CSV report'
                    });

                    // Generate CSV
                    const csvBuffer = await this.exportReportAsCSV(reportId, includeManualObservations);
                    const csvResult = await cloudStorageService.uploadDocument(
                        csvBuffer,
                        `proctoring-report-${reportId}.csv`,
                        {
                            public_id: `proctoring-report-${reportId}-csv`,
                            folder: 'video-interviews/reports'
                        }
                    );

                    // Update report with Cloudinary URLs
                    report.cloudinaryPdfUrl = pdfResult.url;
                    report.cloudinaryPdfPublicId = pdfResult.publicId;
                    report.cloudinaryCsvUrl = csvResult.url;
                    report.cloudinaryCsvPublicId = csvResult.publicId;
                    await report.save();

                    reportStatusMap.set(reportId, {
                        reportId,
                        status: 'processing',
                        progress: 95,
                        message: 'Finalizing report storage'
                    });
                } catch (cloudError) {
                    console.warn('Failed to upload reports to Cloudinary:', cloudError);
                    // Continue without failing the entire report generation
                }
            }

            // Update status to completed
            reportStatusMap.set(reportId, {
                reportId,
                status: 'completed',
                progress: 100,
                message: 'Report generation completed successfully'
            });

        } catch (error) {
            reportStatusMap.set(reportId, {
                reportId,
                status: 'failed',
                progress: 0,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Get report generation status
     */
    static getReportStatus(reportId: string): ReportGenerationStatus | null {
        return reportStatusMap.get(reportId) || null;
    }

    /**
     * Get completed report by ID
     */
    static async getReport(reportId: string): Promise<any> {
        const report = await ProctoringReport.findOne({ reportId });
        if (!report) {
            throw new Error(`Report not found: ${reportId}`);
        }

        // Include manual observations if they exist
        const manualObservations = await ManualObservation.findBySession(report.sessionId);

        // Calculate integrity breakdown if not stored in metadata
        let integrityBreakdown = report.metadata?.integrityBreakdown;
        if (!integrityBreakdown) {
            const eventCounts = {
                focusLoss: report.focusLossCount,
                absence: report.absenceCount,
                multipleFaces: report.multipleFacesCount,
                unauthorizedItems: report.unauthorizedItemsCount
            };
            integrityBreakdown = this.calculateIntegrityScoreBreakdown(eventCounts, manualObservations.map(obs => obs.toJSON()));
        }

        return {
            ...report.toJSON(),
            manualObservations: manualObservations.map(obs => obs.toJSON()),
            integrityBreakdown
        };
    }

    /**
     * Export report as PDF
     */
    static async exportReportAsPDF(reportId: string, includeManualObservations: boolean = true): Promise<Buffer> {
        const report = await this.getReport(reportId);

        let browser;
        try {
            browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });

            const page = await browser.newPage();

            // Generate HTML content for the report
            const htmlContent = this.generateReportHTML(report, includeManualObservations);

            await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

            // Generate PDF
            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: {
                    top: '20mm',
                    right: '15mm',
                    bottom: '20mm',
                    left: '15mm'
                }
            });

            return Buffer.from(pdfBuffer);
        } finally {
            if (browser) {
                await browser.close();
            }
        }
    }

    /**
     * Export report as CSV
     */
    static async exportReportAsCSV(reportId: string, includeManualObservations: boolean = true): Promise<Buffer> {
        const report = await this.getReport(reportId);

        return new Promise((resolve, reject) => {
            const csvData: any[] = [];

            // Add report summary
            csvData.push({
                Type: 'Report Summary',
                'Candidate Name': report.candidateName,
                'Session ID': report.sessionId,
                'Interview Duration (seconds)': report.interviewDuration,
                'Final Integrity Score': report.integrityScore,
                'Focus Loss Count': report.focusLossCount,
                'Absence Count': report.absenceCount,
                'Multiple Faces Count': report.multipleFacesCount,
                'Unauthorized Items Count': report.unauthorizedItemsCount,
                'Generated At': report.generatedAt,
                Timestamp: '',
                Description: '',
                Severity: '',
                'Observation Type': '',
                Flagged: ''
            });

            // Add integrity score breakdown if available
            if (report.integrityBreakdown) {
                csvData.push({
                    Type: 'Integrity Score Calculation',
                    'Candidate Name': report.candidateName,
                    'Session ID': report.sessionId,
                    'Interview Duration (seconds)': '',
                    'Final Integrity Score': `Formula: ${report.integrityBreakdown.formula}`,
                    'Focus Loss Count': `Base Score: ${report.integrityBreakdown.baseScore}`,
                    'Absence Count': `Focus Loss Deduction: -${report.integrityBreakdown.deductions.focusLoss}`,
                    'Multiple Faces Count': `Absence Deduction: -${report.integrityBreakdown.deductions.absence}`,
                    'Unauthorized Items Count': `Multiple Faces Deduction: -${report.integrityBreakdown.deductions.multipleFaces}`,
                    'Generated At': `Unauthorized Items Deduction: -${report.integrityBreakdown.deductions.unauthorizedItems}`,
                    Timestamp: `Manual Flags Deduction: -${report.integrityBreakdown.deductions.manualObservations}`,
                    Description: `Total Deductions: -${report.integrityBreakdown.deductions.total}`,
                    Severity: `Final Score: ${report.integrityBreakdown.finalScore}`,
                    'Observation Type': '',
                    Flagged: ''
                });
            }

            // Add suspicious events
            report.suspiciousEvents.forEach((event: SuspiciousEvent) => {
                csvData.push({
                    Type: 'Suspicious Event',
                    'Candidate Name': report.candidateName,
                    'Session ID': report.sessionId,
                    'Interview Duration (seconds)': '',
                    'Final Integrity Score': '',
                    'Focus Loss Count': '',
                    'Absence Count': '',
                    'Multiple Faces Count': '',
                    'Unauthorized Items Count': '',
                    'Generated At': '',
                    Timestamp: event.timestamp,
                    Description: event.description,
                    Severity: '',
                    'Observation Type': event.eventType,
                    Flagged: ''
                });
            });

            // Add manual observations if included
            if (includeManualObservations && report.manualObservations) {
                report.manualObservations.forEach((observation: any) => {
                    csvData.push({
                        Type: 'Manual Observation',
                        'Candidate Name': report.candidateName,
                        'Session ID': report.sessionId,
                        'Interview Duration (seconds)': '',
                        'Final Integrity Score': '',
                        'Focus Loss Count': '',
                        'Absence Count': '',
                        'Multiple Faces Count': '',
                        'Unauthorized Items Count': '',
                        'Generated At': '',
                        Timestamp: observation.timestamp,
                        Description: observation.description,
                        Severity: observation.severity,
                        'Observation Type': observation.observationType,
                        Flagged: observation.flagged
                    });
                });
            }

            const csvStream = csv.format({ headers: true });
            const chunks: Buffer[] = [];

            csvStream.on('data', (chunk: Buffer) => chunks.push(chunk));
            csvStream.on('end', () => resolve(Buffer.concat(chunks)));
            csvStream.on('error', reject);

            csvData.forEach(row => csvStream.write(row));
            csvStream.end();
        });
    }

    /**
     * Add manual observation to a session
     */
    static async addManualObservation(
        sessionId: string,
        interviewerId: string,
        observationType: string,
        description: string,
        severity: string,
        flagged: boolean = false
    ): Promise<any> {
        const observationId = uuidv4();

        const observation = new ManualObservation({
            observationId,
            sessionId,
            interviewerId,
            timestamp: new Date(),
            observationType,
            description,
            severity,
            flagged
        });

        await observation.save();
        return observation.toJSON();
    }

    /**
     * Update manual observation flagged status
     */
    static async updateObservationFlag(observationId: string, flagged: boolean): Promise<any> {
        const observation = await ManualObservation.findOne({ observationId });
        if (!observation) {
            throw new Error(`Observation not found: ${observationId}`);
        }

        observation.flagged = flagged;
        await observation.save();
        return observation.toJSON();
    }

    /**
     * Get manual observations for a session
     */
    static async getManualObservations(sessionId: string): Promise<any[]> {
        const observations = await ManualObservation.findBySession(sessionId);
        return observations.map(obs => obs.toJSON());
    }

    /**
     * Calculate event counts from detection events
     */
    private static calculateEventCounts(events: any[]): {
        focusLoss: number;
        absence: number;
        multipleFaces: number;
        unauthorizedItems: number;
    } {
        const counts = {
            focusLoss: 0,
            absence: 0,
            multipleFaces: 0,
            unauthorizedItems: 0
        };

        events.forEach(event => {
            switch (event.eventType) {
                case EventType.FOCUS_LOSS:
                case 'focus-loss':
                    counts.focusLoss++;
                    break;
                case EventType.ABSENCE:
                case 'absence':
                    counts.absence++;
                    break;
                case EventType.MULTIPLE_FACES:
                case 'multiple-faces':
                    counts.multipleFaces++;
                    break;
                case EventType.UNAUTHORIZED_ITEM:
                case 'unauthorized-item':
                    counts.unauthorizedItems++;
                    break;
                default:
                    // Unknown event type - silently continue
                    break;
            }
        });

        return counts;
    }

    /**
     * Create suspicious events from detection events
     */
    private static createSuspiciousEvents(events: any[]): SuspiciousEvent[] {
        return events.map(event => ({
            eventType: event.eventType,
            timestamp: event.timestamp,
            duration: event.duration,
            description: this.getEventDescription(event)
        }));
    }

    /**
     * Calculate integrity score based on violations
     */
    private static calculateIntegrityScore(
        eventCounts: { focusLoss: number; absence: number; multipleFaces: number; unauthorizedItems: number },
        manualObservations: any[]
    ): number {
        let score = 100;

        // Deduct points for detection events
        score -= eventCounts.focusLoss * 2;        // -2 points per focus loss
        score -= eventCounts.absence * 5;          // -5 points per absence
        score -= eventCounts.multipleFaces * 10;   // -10 points per multiple faces
        score -= eventCounts.unauthorizedItems * 15; // -15 points per unauthorized item

        // Deduct points for flagged manual observations
        const flaggedObservations = manualObservations.filter(obs => obs.flagged);
        flaggedObservations.forEach(obs => {
            switch (obs.severity) {
                case 'low':
                    score -= 2;
                    break;
                case 'medium':
                    score -= 5;
                    break;
                case 'high':
                    score -= 10;
                    break;
            }
        });

        // Allow negative scores to reflect severe violations
        return score;
    }

    /**
     * Calculate detailed integrity score breakdown
     */
    private static calculateIntegrityScoreBreakdown(
        eventCounts: { focusLoss: number; absence: number; multipleFaces: number; unauthorizedItems: number },
        manualObservations: any[]
    ): {
        baseScore: number;
        deductions: {
            focusLoss: number;
            absence: number;
            multipleFaces: number;
            unauthorizedItems: number;
            manualObservations: number;
            total: number;
        };
        finalScore: number;
        formula: string;
    } {
        const baseScore = 100;
        
        // Calculate individual deductions
        const focusLossDeduction = eventCounts.focusLoss * 2;
        const absenceDeduction = eventCounts.absence * 5;
        const multipleFacesDeduction = eventCounts.multipleFaces * 10;
        const unauthorizedItemsDeduction = eventCounts.unauthorizedItems * 15;
        
        // Calculate manual observation deductions
        const flaggedObservations = manualObservations.filter(obs => obs.flagged);
        let manualObservationsDeduction = 0;
        flaggedObservations.forEach(obs => {
            switch (obs.severity) {
                case 'low':
                    manualObservationsDeduction += 2;
                    break;
                case 'medium':
                    manualObservationsDeduction += 5;
                    break;
                case 'high':
                    manualObservationsDeduction += 10;
                    break;
            }
        });

        const totalDeductions = focusLossDeduction + absenceDeduction + multipleFacesDeduction + unauthorizedItemsDeduction + manualObservationsDeduction;
        const finalScore = baseScore - totalDeductions; // Allow negative scores
        
        // Create readable formula
        const deductionParts = [];
        if (focusLossDeduction > 0) deductionParts.push(`${eventCounts.focusLoss} focus loss (${focusLossDeduction})`);
        if (absenceDeduction > 0) deductionParts.push(`${eventCounts.absence} absence (${absenceDeduction})`);
        if (multipleFacesDeduction > 0) deductionParts.push(`${eventCounts.multipleFaces} multiple faces (${multipleFacesDeduction})`);
        if (unauthorizedItemsDeduction > 0) deductionParts.push(`${eventCounts.unauthorizedItems} unauthorized items (${unauthorizedItemsDeduction})`);
        if (manualObservationsDeduction > 0) deductionParts.push(`${flaggedObservations.length} manual flags (${manualObservationsDeduction})`);
        
        const formula = deductionParts.length > 0 
            ? `100 - [${deductionParts.join(' + ')}] = ${finalScore}`
            : `100 - 0 = ${finalScore}`;

        return {
            baseScore,
            deductions: {
                focusLoss: focusLossDeduction,
                absence: absenceDeduction,
                multipleFaces: multipleFacesDeduction,
                unauthorizedItems: unauthorizedItemsDeduction,
                manualObservations: manualObservationsDeduction,
                total: totalDeductions
            },
            finalScore,
            formula
        };
    }

    /**
     * Get human-readable description for detection event
     */
    private static getEventDescription(event: any): string {
        switch (event.eventType) {
            case EventType.FOCUS_LOSS:
                return `Candidate looked away from screen for ${event.duration || 'unknown'} seconds`;
            case EventType.ABSENCE:
                return `Candidate was absent from video frame for ${event.duration || 'unknown'} seconds`;
            case EventType.MULTIPLE_FACES:
                return `Multiple faces detected in video frame (${event.metadata?.faceCount || 'unknown'} faces)`;
            case EventType.UNAUTHORIZED_ITEM:
                return `Unauthorized item detected: ${event.metadata?.objectType || 'unknown item'}`;
            default:
                return 'Unknown suspicious event';
        }
    }

    /**
     * Generate HTML content for PDF report
     */
    private static generateReportHTML(report: any, includeManualObservations: boolean): string {
        const manualObsSection = includeManualObservations && report.manualObservations?.length > 0
            ? `
        <div class="section">
          <h2>Manual Observations</h2>
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Type</th>
                <th>Severity</th>
                <th>Description</th>
                <th>Flagged</th>
              </tr>
            </thead>
            <tbody>
              ${report.manualObservations.map((obs: any) => `
                <tr class="${obs.flagged ? 'flagged' : ''}">
                  <td>${new Date(obs.timestamp).toLocaleString()}</td>
                  <td>${obs.observationType}</td>
                  <td class="severity-${obs.severity}">${obs.severity}</td>
                  <td>${obs.description}</td>
                  <td>${obs.flagged ? '🚩' : ''}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : '';

        // Generate integrity breakdown section
        const integrityBreakdownSection = report.integrityBreakdown ? `
        <div class="section">
          <h2>Detailed Integrity Score Calculation</h2>
          <div class="integrity-breakdown">
            <div class="formula-section">
              <h3>Formula: Final Integrity Score = 100 - Total Deductions</h3>
              <p class="formula-text">${report.integrityBreakdown.formula}</p>
            </div>
            <div class="breakdown-table">
              <table>
                <thead>
                  <tr>
                    <th>Violation Type</th>
                    <th>Count</th>
                    <th>Points per Incident</th>
                    <th>Total Deduction</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Focus Loss</td>
                    <td>${Math.round(report.integrityBreakdown.deductions.focusLoss / 2)}</td>
                    <td>-2</td>
                    <td>-${report.integrityBreakdown.deductions.focusLoss}</td>
                  </tr>
                  <tr>
                    <td>Absence</td>
                    <td>${Math.round(report.integrityBreakdown.deductions.absence / 5)}</td>
                    <td>-5</td>
                    <td>-${report.integrityBreakdown.deductions.absence}</td>
                  </tr>
                  <tr>
                    <td>Multiple Faces</td>
                    <td>${Math.round(report.integrityBreakdown.deductions.multipleFaces / 10)}</td>
                    <td>-10</td>
                    <td>-${report.integrityBreakdown.deductions.multipleFaces}</td>
                  </tr>
                  <tr>
                    <td>Unauthorized Items</td>
                    <td>${Math.round(report.integrityBreakdown.deductions.unauthorizedItems / 15)}</td>
                    <td>-15</td>
                    <td>-${report.integrityBreakdown.deductions.unauthorizedItems}</td>
                  </tr>
                  <tr>
                    <td>Manual Flags</td>
                    <td>-</td>
                    <td>Variable</td>
                    <td>-${report.integrityBreakdown.deductions.manualObservations}</td>
                  </tr>
                  <tr class="total-row">
                    <td><strong>Total Deductions</strong></td>
                    <td>-</td>
                    <td>-</td>
                    <td><strong>-${report.integrityBreakdown.deductions.total}</strong></td>
                  </tr>
                  <tr class="final-score-row">
                    <td><strong>Final Integrity Score</strong></td>
                    <td colspan="3"><strong>${report.integrityBreakdown.finalScore}/100</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ` : '';

        return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Proctoring Report - ${report.candidateName}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
          .section { margin-bottom: 30px; }
          .summary { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
          .summary-card { border: 1px solid #ddd; padding: 15px; border-radius: 5px; }
          .integrity-score { font-size: 24px; font-weight: bold; color: ${report.integrityScore >= 80 ? '#28a745' : report.integrityScore >= 60 ? '#ffc107' : report.integrityScore >= 0 ? '#dc3545' : '#8B0000'}; }
          .integrity-breakdown { margin-top: 15px; }
          .formula-section { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
          .formula-text { font-family: monospace; font-size: 16px; font-weight: bold; color: #007bff; margin: 10px 0; }
          .breakdown-table { margin-top: 15px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f8f9fa; }
          .total-row { background-color: #e9ecef; font-weight: bold; }
          .final-score-row { background-color: #d4edda; font-weight: bold; color: #155724; }
          .flagged { background-color: #fff3cd; }
          .severity-low { color: #28a745; }
          .severity-medium { color: #ffc107; }
          .severity-high { color: #dc3545; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Video Proctoring Report</h1>
          <p><strong>Candidate:</strong> ${report.candidateName}</p>
          <p><strong>Session ID:</strong> ${report.sessionId}</p>
          <p><strong>Generated:</strong> ${new Date(report.generatedAt).toLocaleString()}</p>
        </div>

        <div class="section">
          <h2>Summary</h2>
          <div class="summary">
            <div class="summary-card">
              <h3>Interview Details</h3>
              <p><strong>Duration:</strong> ${Math.floor(report.interviewDuration / 60)} minutes ${report.interviewDuration % 60} seconds</p>
              <p><strong>Final Integrity Score:</strong> <span class="integrity-score">${report.integrityScore}/100</span></p>
            </div>
            <div class="summary-card">
              <h3>Violation Summary</h3>
              <p><strong>Focus Loss:</strong> ${report.focusLossCount}</p>
              <p><strong>Absence:</strong> ${report.absenceCount}</p>
              <p><strong>Multiple Faces:</strong> ${report.multipleFacesCount}</p>
              <p><strong>Unauthorized Items:</strong> ${report.unauthorizedItemsCount}</p>
            </div>
          </div>
        </div>

        ${integrityBreakdownSection}

        <div class="section">
          <h2>Suspicious Events</h2>
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Event Type</th>
                <th>Duration</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              ${report.suspiciousEvents.map((event: SuspiciousEvent) => `
                <tr>
                  <td>${new Date(event.timestamp).toLocaleString()}</td>
                  <td>${event.eventType}</td>
                  <td>${event.duration ? `${event.duration}s` : 'N/A'}</td>
                  <td>${event.description}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        ${manualObsSection}
      </body>
      </html>
    `;
    }
}