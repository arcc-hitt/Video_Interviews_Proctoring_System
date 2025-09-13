import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import type { InterviewSession, DetectionEvent, Alert } from '../../types';
import { 
  FileText, 
  Download, 
  Clock, 
  TrendingUp, 
  AlertTriangle, 
  Eye, 
  Users, 
  Phone, 
  X,
  Flag,
  BarChart3,
  Clock as Timeline,
  FileDown,
  Loader2,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { 
  safeParseDate, 
  safeFormatDate, 
  safeToDateWithFallback,
  safeFormatTime
} from '../../utils/dateUtils';
import { ErrorBoundary } from '../error/ErrorBoundary';

interface ReportDashboardProps {
  sessionId: string;
  session: InterviewSession;
  alerts: Alert[];
  onClose?: () => void;
}

interface LiveSessionSummary {
  integrityScore: number;
  integrityBreakdown?: {
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
  };
  totalEvents: number;
  focusLossCount: number;
  absenceCount: number;
  multipleFacesCount: number;
  unauthorizedItemsCount: number;
  sessionDuration: number;
  lastEventTime?: Date;
}

interface ManualObservation {
  id: string;
  timestamp: Date;
  observationType: 'suspicious_behavior' | 'technical_issue' | 'general_note' | 'violation';
  description: string;
  severity: 'low' | 'medium' | 'high';
  flagged: boolean;
}

interface ExportStatus {
  isExporting: boolean;
  format?: 'pdf' | 'csv';
  progress: number;
  error?: string;
}

export const ReportDashboard: React.FC<ReportDashboardProps> = ({
  sessionId,
  session,
  alerts,
  onClose
}) => {
  const { authState } = useAuth();
  const [liveSummary, setLiveSummary] = useState<LiveSessionSummary>({
    integrityScore: 100,
    totalEvents: 0,
    focusLossCount: 0,
    absenceCount: 0,
    multipleFacesCount: 0,
    unauthorizedItemsCount: 0,
    sessionDuration: 0
  });
  
  const [detectionEvents, setDetectionEvents] = useState<DetectionEvent[]>([]);
  const [manualObservations, setManualObservations] = useState<ManualObservation[]>([]);
  const [newObservation, setNewObservation] = useState({
    description: '',
    observationType: 'general_note' as ManualObservation['observationType'],
    severity: 'medium' as ManualObservation['severity'],
    flagged: false
  });
  
  const [exportStatus, setExportStatus] = useState<ExportStatus>({
    isExporting: false,
    progress: 0
  });
  
  const [activeTab, setActiveTab] = useState<'summary' | 'timeline' | 'observations'>('summary');
  const [timelineFilter, setTimelineFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Calculate session duration in real-time
  const sessionDuration = useMemo(() => {
    try {
      if (!session.startTime) return 0;
      const start = safeParseDate(session.startTime);
      const end = session.endTime ? safeParseDate(session.endTime) : new Date();
      
      if (!start || !end) return 0;
      
      return Math.floor((end.getTime() - start.getTime()) / 1000);
    } catch (error) {
      console.warn('Error calculating session duration:', error);
      return 0;
    }
  }, [session.startTime, session.endTime]);

  // Calculate live summary from alerts and events
  const calculateLiveSummary = useCallback((events: DetectionEvent[], observations: ManualObservation[]): LiveSessionSummary => {
    try {
      // Validate inputs
      const safeEvents = Array.isArray(events) ? events : [];
      const safeObservations = Array.isArray(observations) ? observations : [];

      const eventCounts = {
        focusLoss: safeEvents.filter(e => e.eventType === 'focus-loss').length,
        absence: safeEvents.filter(e => e.eventType === 'absence').length,
        faceVisible: safeEvents.filter(e => e.eventType === 'face-visible').length,
        multipleFaces: safeEvents.filter(e => e.eventType === 'multiple-faces').length,
        unauthorizedItems: safeEvents.filter(e => e.eventType === 'unauthorized-item').length
      };

    // Calculate integrity score and detailed breakdown
    let integrityScore = 100;
    const focusLossDeduction = eventCounts.focusLoss * 2;
    const absenceDeduction = eventCounts.absence * 5;
    const multipleFacesDeduction = eventCounts.multipleFaces * 10;
    const unauthorizedItemsDeduction = eventCounts.unauthorizedItems * 15;

    integrityScore -= focusLossDeduction;
    integrityScore -= absenceDeduction;
    integrityScore -= multipleFacesDeduction;
    integrityScore -= unauthorizedItemsDeduction;

    // Deduct for flagged manual observations
    const flaggedObservations = safeObservations.filter(obs => obs.flagged);
    let manualObservationsDeduction = 0;
    flaggedObservations.forEach(obs => {
      switch (obs.severity) {
        case 'low': manualObservationsDeduction += 2; break;
        case 'medium': manualObservationsDeduction += 5; break;
        case 'high': manualObservationsDeduction += 10; break;
      }
    });

    integrityScore -= manualObservationsDeduction;
    integrityScore = Math.max(0, integrityScore);

    // Create detailed breakdown
    const totalDeductions = focusLossDeduction + absenceDeduction + multipleFacesDeduction + unauthorizedItemsDeduction + manualObservationsDeduction;
    
    // Create readable formula
    const deductionParts = [];
    if (focusLossDeduction > 0) deductionParts.push(`${eventCounts.focusLoss} focus loss (${focusLossDeduction})`);
    if (absenceDeduction > 0) deductionParts.push(`${eventCounts.absence} absence (${absenceDeduction})`);
    if (multipleFacesDeduction > 0) deductionParts.push(`${eventCounts.multipleFaces} multiple faces (${multipleFacesDeduction})`);
    if (unauthorizedItemsDeduction > 0) deductionParts.push(`${eventCounts.unauthorizedItems} unauthorized items (${unauthorizedItemsDeduction})`);
    if (manualObservationsDeduction > 0) deductionParts.push(`${flaggedObservations.length} manual flags (${manualObservationsDeduction})`);
    
    const formula = deductionParts.length > 0 
      ? `100 - [${deductionParts.join(' + ')}] = ${integrityScore}`
      : `100 - 0 = ${integrityScore}`;

    const integrityBreakdown = {
      baseScore: 100,
      deductions: {
        focusLoss: focusLossDeduction,
        absence: absenceDeduction,
        multipleFaces: multipleFacesDeduction,
        unauthorizedItems: unauthorizedItemsDeduction,
        manualObservations: manualObservationsDeduction,
        total: totalDeductions
      },
      finalScore: integrityScore,
      formula
    };

    const lastEventTime = safeEvents.length > 0 
      ? (() => {
          try {
            const validTimestamps = safeEvents
              .map(e => safeParseDate(e.timestamp)?.getTime())
              .filter(time => time !== null && time !== undefined);
            
            return validTimestamps.length > 0 
              ? new Date(Math.max(...validTimestamps)) 
              : undefined;
          } catch (error) {
            console.warn('Error calculating last event time:', error);
            return undefined;
          }
        })()
      : undefined;

    return {
      integrityScore,
      integrityBreakdown,
      totalEvents: safeEvents.length,
      focusLossCount: eventCounts.focusLoss,
      absenceCount: eventCounts.absence,
      multipleFacesCount: eventCounts.multipleFaces,
      unauthorizedItemsCount: eventCounts.unauthorizedItems,
      sessionDuration,
      lastEventTime
    };
  } catch (error) {
    console.error('Error calculating live summary:', error);
    // Return safe default values
    return {
      integrityScore: 0,
      totalEvents: 0,
      focusLossCount: 0,
      absenceCount: 0,
      multipleFacesCount: 0,
      unauthorizedItemsCount: 0,
      sessionDuration: 0,
      lastEventTime: undefined
    };
  }
  }, [sessionDuration]);

  // Fetch detection events for the session
  const fetchDetectionEvents = useCallback(async () => {
    try {
      const response = await fetch(`/api/events/${sessionId}`, {
        headers: {
          'Authorization': `Bearer ${authState.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // Handle paginated response structure
          const events = data.data?.items || data.data || [];
          setDetectionEvents(Array.isArray(events) ? events : []);
        } else {
          console.warn('API returned success=false:', data);
          setDetectionEvents([]);
        }
      } else {
        console.error('API request failed with status:', response.status);
        setDetectionEvents([]);
      }
    } catch (err) {
      console.error('Failed to fetch detection events:', err);
    }
  }, [sessionId, authState.token]);

  // Fetch manual observations for the session
  const fetchManualObservations = useCallback(async () => {
    try {
      const response = await fetch(`/api/reports/observations/${sessionId}`, {
        headers: {
          'Authorization': `Bearer ${authState.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setManualObservations(data.data || []);
        }
      }
    } catch (err) {
      console.error('Failed to fetch manual observations:', err);
    }
  }, [sessionId, authState.token]);

  // Add manual observation
  const addManualObservation = async () => {
    if (!newObservation.description.trim()) return;

    try {
      const response = await fetch('/api/reports/observations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authState.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId,
          ...newObservation
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setManualObservations(prev => [data.data, ...prev]);
          setNewObservation({
            description: '',
            observationType: 'general_note',
            severity: 'medium',
            flagged: false
          });
        }
      } else {
        setError('Failed to add observation');
      }
    } catch (err) {
      setError('Failed to add observation');
    }
  };

  // Toggle observation flag
  const toggleObservationFlag = async (observationId: string, flagged: boolean) => {
    try {
      const response = await fetch(`/api/reports/observations/${observationId}/flag`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${authState.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ flagged })
      });

      if (response.ok) {
        setManualObservations(prev =>
          prev.map(obs =>
            obs.id === observationId ? { ...obs, flagged } : obs
          )
        );
      }
    } catch (err) {
      console.error('Failed to update observation flag:', err);
    }
  };

  // Export report
  const exportReport = async (format: 'pdf' | 'csv', includeNotes: boolean = true) => {
    setExportStatus({ isExporting: true, format, progress: 0 });

    try {
      // First generate the report
      setExportStatus(prev => ({ ...prev, progress: 20 }));
      
      const generateResponse = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authState.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId,
          includeManualObservations: includeNotes
        })
      });

      if (!generateResponse.ok) {
        throw new Error('Failed to generate report');
      }

      const generateData = await generateResponse.json();
      const reportId = generateData.data.reportId;

      setExportStatus(prev => ({ ...prev, progress: 50 }));

      // Poll for report completion
      let reportReady = false;
      let attempts = 0;
      const maxAttempts = 30; // 30 seconds timeout

      while (!reportReady && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const statusResponse = await fetch(`/api/reports/${reportId}/status`, {
          headers: {
            'Authorization': `Bearer ${authState.token}`,
            'Content-Type': 'application/json'
          }
        });

        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          if (statusData.data.status === 'completed') {
            reportReady = true;
          } else if (statusData.data.status === 'failed') {
            throw new Error(statusData.data.error || 'Report generation failed');
          }
          
          setExportStatus(prev => ({ 
            ...prev, 
            progress: 50 + (attempts / maxAttempts) * 30 
          }));
        }
        
        attempts++;
      }

      if (!reportReady) {
        throw new Error('Report generation timeout');
      }

      setExportStatus(prev => ({ ...prev, progress: 90 }));

      // Download the report
      const exportResponse = await fetch(`/api/reports/${reportId}/export?format=${format}&includeManualObservations=${includeNotes}`, {
        headers: {
          'Authorization': `Bearer ${authState.token}`
        }
      });

      if (!exportResponse.ok) {
        throw new Error('Failed to export report');
      }

      const blob = await exportResponse.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `proctoring-report-${session.candidateName}-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportStatus({ isExporting: false, progress: 100 });
    } catch (err) {
      setExportStatus({
        isExporting: false,
        progress: 0,
        error: err instanceof Error ? err.message : 'Export failed'
      });
    }
  };

  // Update live summary when data changes
  useEffect(() => {
    const summary = calculateLiveSummary(detectionEvents, manualObservations);
    setLiveSummary(summary);
  }, [detectionEvents, manualObservations, calculateLiveSummary]);

  // Initial data fetch
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        await Promise.all([
          fetchDetectionEvents(),
          fetchManualObservations()
        ]);
      } catch (err) {
        setError('Failed to load report data');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [fetchDetectionEvents, fetchManualObservations]);

  // Real-time updates from alerts
  useEffect(() => {
    if (!alerts.length || !sessionId || !session.candidateId) return;
    
    try {
      const alertEvents: DetectionEvent[] = alerts.map((alert) => {
        const safeTimestamp = safeToDateWithFallback(alert.timestamp);
        return {
          sessionId,
          candidateId: session.candidateId,
          eventType: alert.type,
          timestamp: safeTimestamp,
          confidence: alert.confidence || 0.8, // Default confidence for alerts
          metadata: alert.metadata || {}
        };
      });

      // Merge with existing events, avoiding duplicates
      setDetectionEvents(prev => {
        try {
          const existingTimestamps = new Set(
            prev
              .map(e => safeParseDate(e.timestamp)?.getTime())
              .filter(time => time !== null && time !== undefined)
          );
          
          const newEvents = alertEvents.filter(e => {
            const eventTime = safeParseDate(e.timestamp)?.getTime();
            return eventTime && !existingTimestamps.has(eventTime);
          });
          
          return [...prev, ...newEvents];
        } catch (error) {
          console.warn('Error merging detection events:', error);
          return prev; // Return previous state if merging fails
        }
      });
    } catch (error) {
      console.error('Error converting alerts to detection events:', error);
    }
  }, [alerts, sessionId, session.candidateId]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading report dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Report Dashboard Error</h2>
            <p className="text-gray-600 mb-4">
              There was an error loading the report dashboard. Please try refreshing the page.
            </p>
            {onClose && (
              <button
                onClick={onClose}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                Go Back
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                  <FileText className="w-6 h-6 mr-2" />
                  Report Dashboard
                </h1>
                <p className="text-sm text-gray-600">
                  {session.candidateName} • Session: {sessionId.slice(0, 8)}...
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <div className="text-right">
                <div className="text-sm text-gray-500">Final Integrity Score</div>
                <div className={`text-2xl font-bold ${
                  liveSummary.integrityScore >= 80 ? 'text-green-600' :
                  liveSummary.integrityScore >= 60 ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {liveSummary.integrityScore}/100
                </div>
                {liveSummary.integrityBreakdown && (
                  <div className="text-xs text-gray-400 mt-1">
                    Formula: 100 - {liveSummary.integrityBreakdown.deductions.total} = {liveSummary.integrityScore}
                  </div>
                )}
              </div>
              
              <div className="flex space-x-2">
                <button
                  onClick={() => exportReport('pdf')}
                  disabled={exportStatus.isExporting}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-gray-400"
                >
                  {exportStatus.isExporting && exportStatus.format === 'pdf' ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <FileDown className="w-4 h-4 mr-2" />
                  )}
                  Export PDF
                </button>
                
                <button
                  onClick={() => exportReport('csv')}
                  disabled={exportStatus.isExporting}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:bg-gray-100"
                >
                  {exportStatus.isExporting && exportStatus.format === 'csv' ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  Export CSV
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Export Progress */}
      {exportStatus.isExporting && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-3">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600 mr-2" />
                <span className="text-sm text-blue-800">
                  Exporting {exportStatus.format?.toUpperCase()} report...
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-32 bg-blue-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${exportStatus.progress}%` }}
                  />
                </div>
                <span className="text-sm text-blue-600">{Math.round(exportStatus.progress)}%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Export Error */}
      {exportStatus.error && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center">
              <XCircle className="w-4 h-4 text-red-600 mr-2" />
              <span className="text-sm text-red-800">{exportStatus.error}</span>
            </div>
            <button
              onClick={() => setExportStatus({ isExporting: false, progress: 0 })}
              className="text-red-600 hover:text-red-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <span className="text-sm text-red-800">{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-600 hover:text-red-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* Tab Navigation */}
          <div className="border-b border-gray-200 mb-6">
            <nav className="-mb-px flex space-x-8">
              {[
                { key: 'summary', label: 'Live Summary', icon: BarChart3 },
                { key: 'timeline', label: 'Event Timeline', icon: Timeline },
                { key: 'observations', label: 'Manual Observations', icon: Flag }
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key as typeof activeTab)}
                  className={`flex items-center py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === key
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4 mr-2" />
                  {label}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          {activeTab === 'summary' && (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <TrendingUp className={`w-8 h-8 ${
                        liveSummary.integrityScore >= 80 ? 'text-green-500' :
                        liveSummary.integrityScore >= 60 ? 'text-yellow-500' : 'text-red-500'
                      }`} />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">
                          Final Integrity Score
                        </dt>
                        <dd className={`text-lg font-medium ${
                          liveSummary.integrityScore >= 80 ? 'text-green-900' :
                          liveSummary.integrityScore >= 60 ? 'text-yellow-900' : 'text-red-900'
                        }`}>
                          {liveSummary.integrityScore}/100
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <Clock className="w-8 h-8 text-blue-500" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">
                          Session Duration
                        </dt>
                        <dd className="text-lg font-medium text-gray-900">
                          {Math.floor(liveSummary.sessionDuration / 60)}m {liveSummary.sessionDuration % 60}s
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <AlertTriangle className="w-8 h-8 text-orange-500" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">
                          Total Events
                        </dt>
                        <dd className="text-lg font-medium text-gray-900">
                          {liveSummary.totalEvents}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <Flag className="w-8 h-8 text-purple-500" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">
                          Manual Flags
                        </dt>
                        <dd className="text-lg font-medium text-gray-900">
                          {manualObservations.filter(obs => obs.flagged).length}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>

              {/* Detailed Integrity Score Breakdown */}
              {liveSummary.integrityBreakdown && (
                <div className="bg-white rounded-lg shadow">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-medium text-gray-900">Detailed Integrity Score Calculation</h3>
                  </div>
                  <div className="p-6">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                      <h4 className="text-md font-semibold text-blue-900 mb-2">Formula: Final Integrity Score = 100 - Total Deductions</h4>
                      <p className="text-blue-800 font-mono text-sm">{liveSummary.integrityBreakdown.formula}</p>
                    </div>
                    
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div>
                        <h4 className="text-md font-semibold text-gray-900 mb-3">Deduction Breakdown</h4>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center p-3 bg-red-50 rounded-md">
                            <span className="text-sm font-medium text-gray-700">Focus Loss ({Math.round(liveSummary.integrityBreakdown.deductions.focusLoss / 2)} incidents × -2 pts)</span>
                            <span className="text-sm font-bold text-red-600">-{liveSummary.integrityBreakdown.deductions.focusLoss}</span>
                          </div>
                          <div className="flex justify-between items-center p-3 bg-red-50 rounded-md">
                            <span className="text-sm font-medium text-gray-700">Absence ({Math.round(liveSummary.integrityBreakdown.deductions.absence / 5)} incidents × -5 pts)</span>
                            <span className="text-sm font-bold text-red-600">-{liveSummary.integrityBreakdown.deductions.absence}</span>
                          </div>
                          <div className="flex justify-between items-center p-3 bg-red-50 rounded-md">
                            <span className="text-sm font-medium text-gray-700">Multiple Faces ({Math.round(liveSummary.integrityBreakdown.deductions.multipleFaces / 10)} incidents × -10 pts)</span>
                            <span className="text-sm font-bold text-red-600">-{liveSummary.integrityBreakdown.deductions.multipleFaces}</span>
                          </div>
                          <div className="flex justify-between items-center p-3 bg-red-50 rounded-md">
                            <span className="text-sm font-medium text-gray-700">Unauthorized Items ({Math.round(liveSummary.integrityBreakdown.deductions.unauthorizedItems / 15)} incidents × -15 pts)</span>
                            <span className="text-sm font-bold text-red-600">-{liveSummary.integrityBreakdown.deductions.unauthorizedItems}</span>
                          </div>
                          <div className="flex justify-between items-center p-3 bg-red-50 rounded-md">
                            <span className="text-sm font-medium text-gray-700">Manual Flags (variable deduction)</span>
                            <span className="text-sm font-bold text-red-600">-{liveSummary.integrityBreakdown.deductions.manualObservations}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="text-md font-semibold text-gray-900 mb-3">Score Summary</h4>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center p-3 bg-green-50 rounded-md">
                            <span className="text-sm font-medium text-gray-700">Base Score</span>
                            <span className="text-sm font-bold text-green-600">{liveSummary.integrityBreakdown.baseScore}</span>
                          </div>
                          <div className="flex justify-between items-center p-3 bg-red-50 rounded-md">
                            <span className="text-sm font-medium text-gray-700">Total Deductions</span>
                            <span className="text-sm font-bold text-red-600">-{liveSummary.integrityBreakdown.deductions.total}</span>
                          </div>
                          <div className="flex justify-between items-center p-4 bg-gray-100 border-2 border-gray-300 rounded-md">
                            <span className="text-lg font-bold text-gray-900">Final Integrity Score</span>
                            <span className={`text-xl font-bold ${
                              liveSummary.integrityBreakdown.finalScore >= 80 ? 'text-green-600' :
                              liveSummary.integrityBreakdown.finalScore >= 60 ? 'text-yellow-600' : 'text-red-600'
                            }`}>{liveSummary.integrityBreakdown.finalScore}/100</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Violation Breakdown */}
              <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-medium text-gray-900">Violation Breakdown</h3>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="text-center">
                      <Eye className="w-8 h-8 text-yellow-500 mx-auto mb-2" />
                      <div className="text-2xl font-bold text-gray-900">{liveSummary.focusLossCount}</div>
                      <div className="text-sm text-gray-500">Focus Loss</div>
                    </div>
                    
                    <div className="text-center">
                      <X className="w-8 h-8 text-red-500 mx-auto mb-2" />
                      <div className="text-2xl font-bold text-gray-900">{liveSummary.absenceCount}</div>
                      <div className="text-sm text-gray-500">Absence</div>
                    </div>
                    
                    <div className="text-center">
                      <Users className="w-8 h-8 text-orange-500 mx-auto mb-2" />
                      <div className="text-2xl font-bold text-gray-900">{liveSummary.multipleFacesCount}</div>
                      <div className="text-sm text-gray-500">Multiple Faces</div>
                    </div>
                    
                    <div className="text-center">
                      <Phone className="w-8 h-8 text-purple-500 mx-auto mb-2" />
                      <div className="text-2xl font-bold text-gray-900">{liveSummary.unauthorizedItemsCount}</div>
                      <div className="text-sm text-gray-500">Unauthorized Items</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Events */}
              <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-medium text-gray-900">Recent Events</h3>
                </div>
                <div className="p-6">
                  {!Array.isArray(detectionEvents) || detectionEvents.length === 0 ? (
                    <div className="text-center py-8">
                      <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                      <p className="text-gray-500">No suspicious events detected</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {detectionEvents.slice(-5).reverse().map((event, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                          <div className="flex items-center space-x-3">
                            <div className="flex-shrink-0">
                              {event.eventType === 'focus-loss' && <Eye className="w-4 h-4 text-yellow-500" />}
                              {event.eventType === 'absence' && <X className="w-4 h-4 text-red-500" />}
                              {event.eventType === 'face-visible' && <Eye className="w-4 h-4 text-green-500" />}
                              {event.eventType === 'multiple-faces' && <Users className="w-4 h-4 text-orange-500" />}
                              {event.eventType === 'unauthorized-item' && <Phone className="w-4 h-4 text-purple-500" />}
                            </div>
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                {event.eventType.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                              </div>
                              <div className="text-xs text-gray-500">
                                {safeFormatTime(event.timestamp)}
                              </div>
                            </div>
                          </div>
                          <div className="text-xs text-gray-500">
                            Confidence: {Math.round(event.confidence * 100)}%
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'timeline' && (
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-900">Event Timeline</h3>
                  <select
                    value={timelineFilter}
                    onChange={(e) => setTimelineFilter(e.target.value as typeof timelineFilter)}
                    className="text-sm border border-gray-300 rounded-md px-3 py-1"
                  >
                    <option value="all">All Events</option>
                    <option value="high">High Severity</option>
                    <option value="medium">Medium Severity</option>
                    <option value="low">Low Severity</option>
                  </select>
                </div>
              </div>
              
              <div className="p-6">
                {!Array.isArray(detectionEvents) || detectionEvents.length === 0 ? (
                  <div className="text-center py-8">
                    <Timeline className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-500">No events to display</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {detectionEvents.map((event, index) => (
                      <div key={index} className="flex items-start space-x-4">
                        <div className="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <span className="text-sm font-medium text-gray-900">
                                {event.eventType.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                              </span>
                              <span className="text-xs text-gray-500">
                                {safeFormatDate(event.timestamp)}
                              </span>
                            </div>
                            <span className="text-xs text-gray-500">
                              {Math.round(event.confidence * 100)}% confidence
                            </span>
                          </div>
                          {event.duration && (
                            <div className="text-xs text-gray-500 mt-1">
                              Duration: {event.duration}s
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'observations' && (
            <div className="space-y-6">
              {/* Add New Observation */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Add Manual Observation</h3>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <select
                      value={newObservation.observationType}
                      onChange={(e) => setNewObservation(prev => ({ 
                        ...prev, 
                        observationType: e.target.value as ManualObservation['observationType']
                      }))}
                      className="border border-gray-300 rounded-md px-3 py-2"
                    >
                      <option value="general_note">General Note</option>
                      <option value="suspicious_behavior">Suspicious Behavior</option>
                      <option value="technical_issue">Technical Issue</option>
                      <option value="violation">Violation</option>
                    </select>
                    
                    <select
                      value={newObservation.severity}
                      onChange={(e) => setNewObservation(prev => ({ 
                        ...prev, 
                        severity: e.target.value as ManualObservation['severity']
                      }))}
                      className="border border-gray-300 rounded-md px-3 py-2"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                    
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={newObservation.flagged}
                        onChange={(e) => setNewObservation(prev => ({ 
                          ...prev, 
                          flagged: e.target.checked
                        }))}
                        className="mr-2"
                      />
                      <span className="text-sm text-gray-700">Flag for review</span>
                    </label>
                  </div>
                  
                  <textarea
                    value={newObservation.description}
                    onChange={(e) => setNewObservation(prev => ({ 
                      ...prev, 
                      description: e.target.value
                    }))}
                    placeholder="Describe your observation..."
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    rows={3}
                  />
                  
                  <button
                    onClick={addManualObservation}
                    disabled={!newObservation.description.trim()}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                  >
                    Add Observation
                  </button>
                </div>
              </div>

              {/* Observations List */}
              <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-medium text-gray-900">
                    Manual Observations ({manualObservations.length})
                  </h3>
                </div>
                
                <div className="divide-y divide-gray-200">
                  {manualObservations.length === 0 ? (
                    <div className="p-6 text-center">
                      <Flag className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-500">No manual observations yet</p>
                    </div>
                  ) : (
                    manualObservations.map((observation) => (
                      <div key={observation.id} className="p-6">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-2">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                observation.severity === 'high' ? 'bg-red-100 text-red-800' :
                                observation.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-green-100 text-green-800'
                              }`}>
                                {observation.severity.toUpperCase()}
                              </span>
                              
                              <span className="text-xs text-gray-500">
                                {observation.observationType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                              </span>
                              
                              <span className="text-xs text-gray-500">
                                {safeFormatDate(observation.timestamp)}
                              </span>
                              
                              {observation.flagged && (
                                <Flag className="w-4 h-4 text-red-500" />
                              )}
                            </div>
                            
                            <p className="text-sm text-gray-900">{observation.description}</p>
                          </div>
                          
                          <button
                            onClick={() => toggleObservationFlag(observation.id, !observation.flagged)}
                            className={`ml-4 px-3 py-1 text-xs font-medium rounded-md ${
                              observation.flagged
                                ? 'text-red-700 bg-red-100 hover:bg-red-200'
                                : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
                            }`}
                          >
                            {observation.flagged ? 'Unflag' : 'Flag'}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
    </ErrorBoundary>
  );
};