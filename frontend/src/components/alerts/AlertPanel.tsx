import React, { useState, useEffect, useCallback } from 'react';
import type { Alert } from '../../types';
import { AlertTriangle, Eye, Users, Phone, Clock, CheckCircle, Flag, X } from 'lucide-react';

interface AlertPanelProps {
  alerts: Alert[];
  onAlertAcknowledge?: (alertId: string) => void;
  onManualFlag?: (description: string, severity: 'low' | 'medium' | 'high') => void;
  sessionId?: string;
  className?: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars

interface EnhancedAlert extends Alert {
  id: string;
  acknowledged: boolean;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
}

export const AlertPanel: React.FC<AlertPanelProps> = ({
  alerts,
  onAlertAcknowledge,
  onManualFlag,
  sessionId: _sessionId,
  className = ''
}) => {
  const [enhancedAlerts, setEnhancedAlerts] = useState<EnhancedAlert[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [manualFlagText, setManualFlagText] = useState('');
  const [manualFlagSeverity, setManualFlagSeverity] = useState<'low' | 'medium' | 'high'>('medium');
  const [showManualFlagForm, setShowManualFlagForm] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unacknowledged' | 'high' | 'medium' | 'low'>('all');

  // Convert alerts to enhanced alerts with IDs
  useEffect(() => {
    // Safety check for alerts prop
    if (!Array.isArray(alerts)) {
      console.warn('AlertPanel: alerts prop is not an array:', alerts);
      setEnhancedAlerts([]);
      return;
    }

    const newEnhancedAlerts = alerts
      .filter(alert => alert && typeof alert === 'object') // Filter out invalid alerts
      .map((alert, index) => {
        try {
          return {
            ...alert,
            id: alert.id || `alert-${alert.timestamp instanceof Date ? alert.timestamp.getTime() : new Date(alert.timestamp).getTime()}-${index}`,
            acknowledged: false
          };
        } catch (error) {
          console.warn('Error processing alert:', alert, error);
          return {
            ...alert,
            id: `alert-fallback-${index}`,
            acknowledged: false,
            message: alert.message || 'Error processing alert',
            severity: alert.severity || 'medium',
            type: alert.type || 'unknown'
          };
        }
      });
    
    setEnhancedAlerts(prev => {
      // Merge with existing alerts, preserving acknowledgment status
      const existingAlertsMap = new Map(prev.map(a => [a.id, a]));
      const updatedAlerts = newEnhancedAlerts.map(newAlert => {
        const existing = existingAlertsMap.get(newAlert.id);
        return existing || newAlert;
      });
      
      // Sort by timestamp, newest first
      // Handle both Date objects and timestamps
      return updatedAlerts.sort((a, b) => {
        const timestampA = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
        const timestampB = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime();
        return timestampB - timestampA;
      });
    });
  }, [alerts]);

  // Get alert icon based on type
  const getAlertIcon = (type: Alert['type']) => {
    if (!type) {
      return <AlertTriangle className="w-4 h-4" />;
    }
    
    switch (type) {
      case 'focus-loss':
        return <Eye className="w-4 h-4" />;
      case 'absence':
        return <X className="w-4 h-4" />;
      case 'multiple-faces':
        return <Users className="w-4 h-4" />;
      case 'unauthorized-item':
        return <Phone className="w-4 h-4" />;
      default:
        return <AlertTriangle className="w-4 h-4" />;
    }
  };

  // Get alert message with enhanced details
  const getAlertMessage = (alert: Alert): string => {
    const baseMessage = alert.message || 'No message available';
    const metadata = alert.metadata;
    
    if (metadata) {
      if (alert.type === 'multiple-faces' && metadata.faceCount) {
        return `${baseMessage} (${metadata.faceCount} faces detected)`;
      } else if (alert.type === 'unauthorized-item' && metadata.itemType) {
        return `${baseMessage}: ${metadata.itemType}`;
      } else if (alert.type === 'focus-loss' && metadata.gazeDirection) {
        const { x, y } = metadata.gazeDirection;
        const direction = Math.abs(x) > Math.abs(y) ? 
          (x > 0 ? 'right' : 'left') : 
          (y > 0 ? 'down' : 'up');
        return `${baseMessage} (looking ${direction})`;
      }
    }
    
    return baseMessage;
  };

  // Format confidence level
  const formatConfidence = (confidence?: number): string => {
    if (!confidence) return '';
    return `${Math.round(confidence * 100)}% confidence`;
  };

  // Get severity styling
  const getSeverityStyles = (severity: Alert['severity'], acknowledged: boolean = false) => {
    const baseStyles = acknowledged ? 'opacity-60' : '';
    
    if (!severity) {
      return `${baseStyles} bg-gray-50 border-gray-200 text-gray-800`;
    }
    
    switch (severity) {
      case 'low':
        return `${baseStyles} bg-yellow-50 border-yellow-200 text-yellow-800`;
      case 'medium':
        return `${baseStyles} bg-orange-50 border-orange-200 text-orange-800`;
      case 'high':
        return `${baseStyles} bg-red-50 border-red-200 text-red-800`;
      default:
        return `${baseStyles} bg-gray-50 border-gray-200 text-gray-800`;
    }
  };

  // Get severity badge styling
  const getSeverityBadgeStyles = (severity: Alert['severity']) => {
    if (!severity) {
      return 'bg-gray-100 text-gray-800';
    }
    
    switch (severity) {
      case 'low':
        return 'bg-yellow-100 text-yellow-800';
      case 'medium':
        return 'bg-orange-100 text-orange-800';
      case 'high':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Handle alert acknowledgment
  const handleAcknowledge = useCallback((alertId: string) => {
    setEnhancedAlerts(prev => 
      prev.map(alert => 
        alert.id === alertId 
          ? { 
              ...alert, 
              acknowledged: true, 
              acknowledgedAt: new Date(),
              acknowledgedBy: 'Current User' // In real app, get from auth context
            }
          : alert
      )
    );
    
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
    
    // Add manual flag as an alert
    const manualAlert: EnhancedAlert = {
      id: `manual-${Date.now()}`,
      type: 'unauthorized-item', // Generic type for manual flags
      message: `Manual Flag: ${manualFlagText}`,
      timestamp: new Date(),
      severity: manualFlagSeverity,
      acknowledged: false
    };
    
    setEnhancedAlerts(prev => [manualAlert, ...prev]);
    setManualFlagText('');
    setShowManualFlagForm(false);
  }, [manualFlagText, manualFlagSeverity, onManualFlag]);

  // Filter alerts based on current filter
  const filteredAlerts = enhancedAlerts.filter(alert => {
    switch (filter) {
      case 'unacknowledged':
        return !alert.acknowledged;
      case 'high':
      case 'medium':
      case 'low':
        return alert.severity === filter;
      default:
        return true;
    }
  });

  // Get alert counts for different categories
  const alertCounts = {
    total: enhancedAlerts.length,
    unacknowledged: enhancedAlerts.filter(a => !a.acknowledged).length,
    high: enhancedAlerts.filter(a => a.severity === 'high').length,
    medium: enhancedAlerts.filter(a => a.severity === 'medium').length,
    low: enhancedAlerts.filter(a => a.severity === 'low').length
  };

  // Format timestamp
  const formatTime = (date: Date | string | number) => {
    // Ensure we have a valid Date object
    const dateObj = date instanceof Date ? date : new Date(date);
    
    // Check if date is valid
    if (isNaN(dateObj.getTime())) {
      return 'Invalid time';
    }
    
    return dateObj.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  };

  return (
    <div className={`bg-white rounded-lg shadow-sm border ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            <h3 className="text-lg font-medium text-gray-900">
              Real-time Alerts
            </h3>
            {alertCounts.unacknowledged > 0 && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                {alertCounts.unacknowledged} new
              </span>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowManualFlagForm(!showManualFlagForm)}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <Flag className="w-4 h-4 mr-1" />
              Flag
            </button>
            
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              <Clock className="w-4 h-4 mr-1" />
              {showHistory ? 'Live' : 'History'}
            </button>
          </div>
        </div>

        {/* Manual Flag Form */}
        {showManualFlagForm && (
          <div className="mt-4 p-3 bg-gray-50 rounded-md">
            <div className="space-y-3">
              <textarea
                value={manualFlagText}
                onChange={(e) => setManualFlagText(e.target.value)}
                placeholder="Describe the suspicious behavior or concern..."
                className="w-full p-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                rows={2}
              />
              <div className="flex items-center justify-between">
                <select
                  value={manualFlagSeverity}
                  onChange={(e) => setManualFlagSeverity(e.target.value as 'low' | 'medium' | 'high')}
                  className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                >
                  <option value="low">Low Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="high">High Priority</option>
                </select>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setShowManualFlagForm(false)}
                    className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleManualFlag}
                    disabled={!manualFlagText.trim()}
                    className="px-3 py-1 text-sm font-medium text-white bg-orange-600 rounded hover:bg-orange-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    Add Flag
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="mt-4 flex space-x-1 bg-gray-100 rounded-lg p-1">
          {[
            { key: 'all', label: 'All', count: alertCounts.total },
            { key: 'unacknowledged', label: 'New', count: alertCounts.unacknowledged },
            { key: 'high', label: 'High', count: alertCounts.high },
            { key: 'medium', label: 'Medium', count: alertCounts.medium },
            { key: 'low', label: 'Low', count: alertCounts.low }
          ].map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setFilter(key as typeof filter)}
              className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                filter === key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {label} {count > 0 && `(${count})`}
            </button>
          ))}
        </div>
      </div>

      {/* Alerts List */}
      <div className="max-h-96 overflow-y-auto">
        {filteredAlerts.length === 0 ? (
          <div className="p-6 text-center">
            <AlertTriangle className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">
              {filter === 'all' ? 'No alerts yet' : `No ${filter} alerts`}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredAlerts.map((alert, index) => {
              // Ensure alert object exists and has minimal required properties
              if (!alert || typeof alert !== 'object') {
                console.warn('Invalid alert object:', alert);
                return null;
              }

              return (
                <div
                  key={alert.id || `alert-${index}`}
                  className={`p-4 border-l-4 ${getSeverityStyles(alert.severity, alert.acknowledged)}`}
                >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3 flex-1">
                    <div className="flex-shrink-0 mt-0.5">
                      {getAlertIcon(alert.type || 'unknown')}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getSeverityBadgeStyles(alert.severity)}`}>
                          {alert.severity?.toUpperCase() || 'UNKNOWN'}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatTime(alert.timestamp)}
                        </span>
                        {alert.acknowledged && (
                          <span className="inline-flex items-center text-xs text-green-600">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Acknowledged
                          </span>
                        )}
                      </div>
                      
                      <p className="text-sm text-gray-900 mb-1">
                        {getAlertMessage(alert)}
                      </p>
                      
                      {alert.confidence && (
                        <p className="text-xs text-gray-500 mb-1">
                          {formatConfidence(alert.confidence)}
                        </p>
                      )}
                      
                      {alert.acknowledged && alert.acknowledgedAt && (
                        <p className="text-xs text-gray-500">
                          Acknowledged at {formatTime(alert.acknowledgedAt)}
                          {alert.acknowledgedBy && ` by ${alert.acknowledgedBy}`}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {!alert.acknowledged && onAlertAcknowledge && alert.id && (
                    <button
                      onClick={() => handleAcknowledge(alert.id)}
                      className="ml-3 inline-flex items-center px-2.5 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-md hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Acknowledge
                    </button>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer with summary */}
      {enhancedAlerts.length > 0 && (
        <div className="p-3 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center justify-between text-xs text-gray-600">
            <span>
              Total: {alertCounts.total} alerts
            </span>
            <span>
              {alertCounts.unacknowledged > 0 
                ? `${alertCounts.unacknowledged} require attention`
                : 'All alerts acknowledged'
              }
            </span>
          </div>
        </div>
      )}
    </div>
  );
};