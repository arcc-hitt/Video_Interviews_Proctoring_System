import React, { useState, useCallback } from 'react';
import type { Alert } from '../../types';
import { AlertTriangle, Flag, CheckCircle, History, Plus, FileText, Eye, X, Users, Smartphone } from 'lucide-react';
import { AlertHistory } from './AlertHistory';
import { safeFormatTime } from '../../utils/dateUtils';

interface AlertManagementPanelProps {
  alerts: Alert[];
  onAlertAcknowledge?: (alertId: string) => void;
  onManualFlag?: (description: string, severity: 'low' | 'medium' | 'high') => void;
  sessionId?: string;
  className?: string;
}

type ViewMode = 'live' | 'history' | 'notes';

interface SessionNote {
  id: string;
  timestamp: Date;
  note: string;
  severity: 'low' | 'medium' | 'high';
}

export const AlertManagementPanel: React.FC<AlertManagementPanelProps> = ({
  alerts,
  onAlertAcknowledge,
  onManualFlag,
  sessionId,
  className = ''
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('live');
  const [manualFlagText, setManualFlagText] = useState('');
  const [manualFlagSeverity, setManualFlagSeverity] = useState<'low' | 'medium' | 'high'>('medium');
  const [showManualFlagForm, setShowManualFlagForm] = useState(false);
  const [sessionNotes, setSessionNotes] = useState<SessionNote[]>([]);

  // Get unacknowledged alerts count
  const unacknowledgedCount = alerts.filter(alert => 
    !('acknowledged' in alert) || !alert.acknowledged
  ).length;

  // Handle alert acknowledgment
  const handleAcknowledge = useCallback((alertId: string) => {
    if (onAlertAcknowledge) {
      onAlertAcknowledge(alertId);
    }
  }, [onAlertAcknowledge]);

  // Handle manual flag submission
  const handleManualFlag = useCallback(() => {
    if (!manualFlagText.trim()) return;
    
    if (onManualFlag) {
      onManualFlag(manualFlagText, manualFlagSeverity);
    }

    // Add to session notes
    const note: SessionNote = {
      id: `note-${Date.now()}`,
      timestamp: new Date(),
      note: manualFlagText,
      severity: manualFlagSeverity
    };
    setSessionNotes(prev => [note, ...prev]);
    
    setManualFlagText('');
    setShowManualFlagForm(false);
  }, [manualFlagText, manualFlagSeverity, onManualFlag]);

  // Get severity color
  const getSeverityColor = (severity: 'low' | 'medium' | 'high') => {
    switch (severity) {
      case 'low':
        return 'bg-green-100 text-green-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'high':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Format timestamp (replaced with safe utility function)
  // Using safeFormatTime utility to prevent crashes

  // Get alert icon
  const getAlertIcon = (type: string) => {
    const base = "flex-shrink-0 w-5 h-5";
    switch (type) {
      case 'focus-loss':
        return <Eye className={`${base} text-blue-600`} />;
      case 'absence':
        return <X className={`${base} text-red-600`} />;
      case 'multiple-faces':
        return <Users className={`${base} text-purple-600`} />;
      case 'unauthorized-item':
        return <Smartphone className={`${base} text-orange-600`} />;
      case 'face-visible':
        return <Eye className={`${base} text-green-600`} />;
      case 'manual_flag':
        return <Flag className={`${base} text-orange-500`} />;
      default:
        return <AlertTriangle className={`${base} text-gray-500`} />;
    }
  };

  return (
    <div className={`bg-white rounded-lg shadow-sm border w-full max-w-full flex flex-col h-full min-h-[500px] max-h-[900px] overflow-hidden ${className}`}>
      {/* Header with Tabs */}
      <div className="p-4 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center justify-between mb-4 min-w-0">
          <div className="flex items-center space-x-2 min-w-0 flex-1">
            <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0" />
            <h3 className="text-lg font-medium text-gray-900 truncate">
              Alert Management
            </h3>
            {unacknowledgedCount > 0 && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 flex-shrink-0">
                {unacknowledgedCount} new
              </span>
            )}
          </div>
          
          {/* Quick Actions */}
          <div className="flex items-center space-x-2 flex-shrink-0">
            <button
              onClick={() => setShowManualFlagForm(!showManualFlagForm)}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500"
              data-testid="toggle-manual-flag"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Flag
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 bg-gray-100 rounded-lg p-1 overflow-hidden">
          <button
            onClick={() => setViewMode('live')}
            className={`flex-1 flex items-center justify-center px-2 py-2 text-sm font-medium rounded-md transition-colors min-w-0 ${
              viewMode === 'live'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <AlertTriangle className="w-4 h-4 mr-1 flex-shrink-0" />
            <span className="truncate">Live Alerts</span>
            {unacknowledgedCount > 0 && (
              <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 flex-shrink-0">
                {unacknowledgedCount}
              </span>
            )}
          </button>
          
          <button
            onClick={() => setViewMode('history')}
            className={`flex-1 flex items-center justify-center px-2 py-2 text-sm font-medium rounded-md transition-colors min-w-0 ${
              viewMode === 'history'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <History className="w-4 h-4 mr-1 flex-shrink-0" />
            <span className="truncate">History</span>
            <span className="ml-1 text-xs text-gray-400 flex-shrink-0">({alerts.length})</span>
          </button>
          
          <button
            onClick={() => setViewMode('notes')}
            className={`flex-1 flex items-center justify-center px-2 py-2 text-sm font-medium rounded-md transition-colors min-w-0 ${
              viewMode === 'notes'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <FileText className="w-4 h-4 mr-1 flex-shrink-0" />
            <span className="truncate">Notes</span>
            <span className="ml-1 text-xs text-gray-400 flex-shrink-0">({sessionNotes.length})</span>
          </button>
        </div>
      </div>

      {/* Manual Flag Form */}
      {showManualFlagForm && (
        <div className="p-4 bg-gray-50 border-b border-gray-200 overflow-hidden flex-shrink-0">
          <div className="space-y-3">
            <textarea
              value={manualFlagText}
              onChange={(e) => setManualFlagText(e.target.value)}
              placeholder="Describe the suspicious behavior or concern..."
              className="w-full p-3 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500 resize-none"
              rows={3}
            />
            <div className="flex items-center justify-between flex-wrap gap-2">
              <select
                value={manualFlagSeverity}
                onChange={(e) => setManualFlagSeverity(e.target.value as 'low' | 'medium' | 'high')}
                className="text-sm border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              >
                <option value="low">Low Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="high">High Priority</option>
              </select>
              <div className="flex space-x-2">
                <button
                  onClick={() => setShowManualFlagForm(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleManualFlag}
                  disabled={!manualFlagText.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded hover:bg-orange-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  data-testid="submit-manual-flag"
                >
                  Add Flag
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 p-4 overflow-hidden">
        {/* Live Alerts View */}
        {viewMode === 'live' && (
          <div className="space-y-3 h-full min-h-[300px] max-h-[700px] overflow-y-auto overflow-x-hidden">
            {(() => {
              // Filter to show only unacknowledged alerts in live view
              const unacknowledgedAlerts = alerts.filter(alert => 
                !alert.acknowledged
              );
              
              if (unacknowledgedAlerts.length === 0) {
                return (
                  <div className="text-center py-8">
                    <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                    <p className="text-gray-500">No new alerts</p>
                  </div>
                );
              }
              
              return unacknowledgedAlerts.map((alert, index) => (
                <div
                  key={`${alert.type}-${index}`}
                  className="flex items-start justify-between p-3 bg-gray-50 rounded-md shadow-sm"
                >
                  <div className="flex items-start space-x-3 flex-1 min-w-0">
                    <div className="flex items-center justify-center w-5 h-5 mt-0.5">
                      {getAlertIcon(alert.type)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center flex-wrap gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-900 break-words">
                          {alert.message}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${getSeverityColor(alert.severity)}`}>
                          {alert.severity?.toUpperCase() || 'UNKNOWN'}
                        </span>
                        <span className="text-xs text-gray-500 flex-shrink-0">
                          {safeFormatTime(alert.timestamp)}
                        </span>
                      </div>
                      
                      {alert.confidence && (
                        <p className="text-xs text-gray-500">
                          Confidence: {Math.round(alert.confidence * 100)}%
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {onAlertAcknowledge && alert.id && (
                    <button
                      onClick={() => handleAcknowledge(alert.id!)}
                      className="ml-3 inline-flex items-center px-2.5 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-md hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-green-500 flex-shrink-0"
                    >
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Ack
                    </button>
                  )}
                </div>
              ));
            })()}
          </div>
        )}

        {/* History View */}
        {viewMode === 'history' && (
          <div className="h-full min-h-[300px] max-h-[700px] overflow-hidden">
            <AlertHistory
              sessionId={sessionId || ''}
              alerts={alerts}
              className="border-0 shadow-none h-full"
            />
          </div>
        )}

        {/* Notes View */}
        {viewMode === 'notes' && (
          <div className="space-y-3 h-full min-h-[300px] max-h-[700px] overflow-y-auto overflow-x-hidden">
            {sessionNotes.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500">No notes yet</p>
                <p className="text-sm text-gray-400">Add a manual flag to create your first note</p>
              </div>
            ) : (
              sessionNotes.map((note) => (
                <div
                  key={note.id}
                  className={`p-3 rounded-md ${getSeverityColor(note.severity)}`}
                >
                  <div className="flex items-start justify-between min-w-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium break-words">{note.note}</p>
                      <p className="text-xs mt-1 opacity-75">
                        {safeFormatTime(note.timestamp)}
                      </p>
                    </div>
                    <Flag className="w-4 h-4 ml-2 opacity-60 flex-shrink-0" />
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 rounded-b-lg overflow-hidden flex-shrink-0">
        <div className="flex items-center justify-between text-xs text-gray-600 min-w-0">
          <span className="truncate flex-1">
            {viewMode === 'live' 
              ? `${unacknowledgedCount} unacknowledged alerts`
              : viewMode === 'history'
              ? `${alerts.length} total events`
              : `${sessionNotes.length} session notes`
            }
          </span>
          <span className="ml-2 flex-shrink-0 truncate">Session: {sessionId || 'N/A'}</span>
        </div>
      </div>
    </div>
  );
};