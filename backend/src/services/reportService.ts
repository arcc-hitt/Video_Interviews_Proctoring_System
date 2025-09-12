import puppeteer from 'puppeteer';
import * as csv from 'fast-csv';
import { v4 as uuidv4 } from 'uuid';
import { DetectionEvent } from '../models/DetectionEvent';
import { InterviewSession } from '../models/InterviewSession';
import { ProctoringReport } from '../models/ProctoringReport';
import { ManualObservation } from '../models/ManualObservation';
import { EventType, SuspiciousEvent, ManualObservation as IManualObservation } from '../types';
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

            // Calculate integrity score
            const integrityScore = this.calculateIntegrityScore(eventCounts, manualObservations);

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
                generatedAt: new Date()
            });

            await report.save();

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

        return {
            ...report.toJSON(),
            manualObservations: manualObservations.map(obs => obs.toJSON())
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
                'Integrity Score': report.integrityScore,
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

            // Add suspicious events
            report.suspiciousEvents.forEach((event: SuspiciousEvent) => {
                csvData.push({
                    Type: 'Suspicious Event',
                    'Candidate Name': report.candidateName,
                    'Session ID': report.sessionId,
                    'Interview Duration (seconds)': '',
                    'Integrity Score': '',
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
                        'Integrity Score': '',
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

        console.log(`Calculating event counts for ${events.length} events`);

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
                    // Log unknown event types for debugging
                    console.log(`Unknown event type encountered: ${event.eventType}`);
                    break;
            }
        });

        console.log('Event counts calculated:', counts);
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

        return Math.max(0, score);
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
          .integrity-score { font-size: 24px; font-weight: bold; color: ${report.integrityScore >= 80 ? '#28a745' : report.integrityScore >= 60 ? '#ffc107' : '#dc3545'}; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f8f9fa; }
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
              <p><strong>Integrity Score:</strong> <span class="integrity-score">${report.integrityScore}/100</span></p>
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