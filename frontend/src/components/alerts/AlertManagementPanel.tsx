import React, { useState, useCallback } from 'react';
import type { Alert } from '../../types';
import { AlertTriangle, Flag, CheckCircle, History, Plus, FileText } from 'lucide-react';
import { AlertHistory } from './AlertHistory';

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

  // Format timestamp
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  // Get alert icon
  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'focus-loss':
        return '👀';
      case 'absence':
        return '❌';
      case 'multiple-faces':
        return '👥';
      case 'unauthorized-item':
        return '📱';
      default:
        return '⚠️';
    }
  };

  return (
    <div className={`bg-white rounded-lg shadow-sm border ${className}`}>
      {/* Header with Tabs */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            <h3 className="text-lg font-medium text-gray-900">
              Alert Management
            </h3>
            {unacknowledgedCount > 0 && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                {unacknowledgedCount} new
              </span>
            )}
          </div>
          
          {/* Quick Actions */}
          <div className="flex items-center space-x-2">
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
        <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setViewMode('live')}
            className={`flex-1 flex items-center justify-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              viewMode === 'live'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <AlertTriangle className="w-4 h-4 mr-1" />
            Live Alerts
            {unacknowledgedCount > 0 && (
              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                {unacknowledgedCount}
              </span>
            )}
          </button>
          
          <button
            onClick={() => setViewMode('history')}
            className={`flex-1 flex items-center justify-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              viewMode === 'history'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <History className="w-4 h-4 mr-1" />
            History
            <span className="ml-2 text-xs text-gray-400">({alerts.length})</span>
          </button>
          
          <button
            onClick={() => setViewMode('notes')}
            className={`flex-1 flex items-center justify-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              viewMode === 'notes'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <FileText className="w-4 h-4 mr-1" />
            Notes
            <span className="ml-2 text-xs text-gray-400">({sessionNotes.length})</span>
          </button>
        </div>
      </div>

      {/* Manual Flag Form */}
      {showManualFlagForm && (
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <div className="space-y-3">
            <textarea
              value={manualFlagText}
              onChange={(e) => setManualFlagText(e.target.value)}
              placeholder="Describe the suspicious behavior or concern..."
              className="w-full p-3 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              rows={3}
            />
            <div className="flex items-center justify-between">
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
      <div className="p-4">
        {/* Live Alerts View */}
        {viewMode === 'live' && (
          <div className="space-y-3 max-h-96 overflow-y-auto">
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
              
              return unacknowledgedAlerts.slice(0, 10).map((alert, index) => (
                <div
                  key={`${alert.type}-${index}`}
                  className="flex items-start justify-between p-3 bg-gray-50 rounded-md"
                >
                  <div className="flex items-start space-x-3 flex-1">
                    <div className="text-lg">{getAlertIcon(alert.type)}</div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="text-sm font-medium text-gray-900">
                          {alert.message}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getSeverityColor(alert.severity)}`}>
                          {alert.severity?.toUpperCase() || 'UNKNOWN'}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatTime(alert.timestamp)}
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
                      className="ml-3 inline-flex items-center px-2.5 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-md hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-green-500"
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
          <AlertHistory
            sessionId={sessionId || ''}
            alerts={alerts}
            className="border-0 shadow-none"
          />
        )}

        {/* Notes View */}
        {viewMode === 'notes' && (
          <div className="space-y-3 max-h-96 overflow-y-auto">
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
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{note.note}</p>
                      <p className="text-xs mt-1 opacity-75">
                        {formatTime(note.timestamp)}
                      </p>
                    </div>
                    <Flag className="w-4 h-4 ml-2 opacity-60" />
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 rounded-b-lg">
        <div className="flex items-center justify-between text-xs text-gray-600">
          <span>
            {viewMode === 'live' 
              ? `${unacknowledgedCount} unacknowledged alerts`
              : viewMode === 'history'
              ? `${alerts.length} total events`
              : `${sessionNotes.length} session notes`
            }
          </span>
          <span>Session: {sessionId || 'N/A'}</span>
        </div>
      </div>
    </div>
  );
};