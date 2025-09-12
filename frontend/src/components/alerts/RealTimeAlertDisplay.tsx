import React, { useState, useEffect } from 'react';
import { AlertTriangle, Eye, Users, Phone, X, CheckCircle } from 'lucide-react';
import type { Alert } from '../../types';

interface RealTimeAlertDisplayProps {
  alerts: Alert[];
  onAlertDismiss?: (alertId: string) => void;
  onAlertAcknowledge?: (alertId: string) => void;
  maxDisplayAlerts?: number;
  autoHideAfter?: number; // seconds
  showConfidence?: boolean;
  className?: string;
}

interface AlertWithTimer extends Alert {
  dismissTimer?: NodeJS.Timeout;
}

export const RealTimeAlertDisplay: React.FC<RealTimeAlertDisplayProps> = ({
  alerts,
  onAlertDismiss,
  onAlertAcknowledge,
  maxDisplayAlerts = 5,
  autoHideAfter = 10,
  showConfidence = true,
  className = ''
}) => {
  const [displayAlerts, setDisplayAlerts] = useState<AlertWithTimer[]>([]);

  // Update display alerts when new alerts come in
  useEffect(() => {
    // Safety check for alerts prop
    if (!Array.isArray(alerts)) {
      console.warn('RealTimeAlertDisplay: alerts prop is not an array:', alerts);
      setDisplayAlerts([]);
      return;
    }

    const newAlerts = alerts
      .filter(alert => alert && typeof alert === 'object') // Filter out invalid alerts
      .slice(0, maxDisplayAlerts)
      .map(alert => {
        try {
          const existingAlert = displayAlerts.find(da => da.id === alert.id);
          if (existingAlert) {
            return existingAlert; // Keep existing timer
          }

          // Create new alert with auto-hide timer
          const alertWithTimer: AlertWithTimer = { ...alert };
          if (autoHideAfter > 0 && alert.id) {
            alertWithTimer.dismissTimer = setTimeout(() => {
              if (alert.id) handleDismiss(alert.id);
            }, autoHideAfter * 1000);
          }
          
          return alertWithTimer;
        } catch (error) {
          console.warn('Error processing alert in RealTimeAlertDisplay:', alert, error);
          return {
            ...alert,
            id: alert.id || `rt-alert-fallback-${Date.now()}`,
            message: alert.message || 'Error processing alert',
            severity: alert.severity || 'medium',
            type: alert.type || 'unknown',
            timestamp: alert.timestamp || new Date()
          } as AlertWithTimer;
        }
      });

    setDisplayAlerts(newAlerts);

    // Cleanup old timers
    return () => {
      displayAlerts.forEach(alert => {
        if (alert.dismissTimer) {
          clearTimeout(alert.dismissTimer);
        }
      });
    };
  }, [alerts, maxDisplayAlerts, autoHideAfter]);

  const handleDismiss = (alertId: string) => {
    setDisplayAlerts(prev => {
      const alert = prev.find(a => a.id === alertId);
      if (alert?.dismissTimer) {
        clearTimeout(alert.dismissTimer);
      }
      return prev.filter(a => a.id !== alertId);
    });
    
    if (onAlertDismiss) {
      onAlertDismiss(alertId);
    }
  };

  const handleAcknowledge = (alertId: string) => {
    // Clear the timer and remove from display
    setDisplayAlerts(prev => {
      const alert = prev.find(a => a.id === alertId);
      if (alert?.dismissTimer) {
        clearTimeout(alert.dismissTimer);
      }
      return prev.filter(a => a.id !== alertId);
    });

    if (onAlertAcknowledge) {
      onAlertAcknowledge(alertId);
    }
  };

  const getAlertIcon = (type: Alert['type']) => {
    if (!type) {
      return <AlertTriangle className="w-5 h-5" />;
    }
    
    switch (type) {
      case 'focus-loss':
        return <Eye className="w-5 h-5" />;
      case 'absence':
        return <X className="w-5 h-5" />;
      case 'multiple-faces':
        return <Users className="w-5 h-5" />;
      case 'unauthorized-item':
        return <Phone className="w-5 h-5" />;
      default:
        return <AlertTriangle className="w-5 h-5" />;
    }
  };

  const getSeverityStyles = (severity: Alert['severity']) => {
    if (!severity) {
      return 'bg-gray-50 border-gray-400 text-gray-800';
    }
    
    switch (severity) {
      case 'low':
        return 'bg-yellow-50 border-yellow-400 text-yellow-800';
      case 'medium':
        return 'bg-orange-50 border-orange-400 text-orange-800';
      case 'high':
        return 'bg-red-50 border-red-400 text-red-800';
      default:
        return 'bg-gray-50 border-gray-400 text-gray-800';
    }
  };

  const getAlertAnimation = (index: number) => {
    return {
      animation: `slideInRight 0.3s ease-out ${index * 0.1}s both`,
    };
  };

  const formatTime = (timestamp: Date | string | number) => {
    // Ensure we have a valid Date object
    const dateObj = timestamp instanceof Date ? timestamp : new Date(timestamp);
    
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

  const formatConfidence = (confidence?: number): string => {
    if (!confidence) return '';
    return `${Math.round(confidence * 100)}%`;
  };

  if (displayAlerts.length === 0) {
    return null;
  }

  return (
      <div className={`fixed top-4 right-4 z-50 space-y-3 ${className}`}>
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes slideInRight {
            from {
              transform: translateX(100%);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
          
          @keyframes slideOutRight {
            from {
              transform: translateX(0);
              opacity: 1;
            }
            to {
              transform: translateX(100%);
              opacity: 0;
            }
          }
        `
      }} />      {displayAlerts.map((alert, index) => {
        // Ensure alert object exists and has minimal required properties
        if (!alert || typeof alert !== 'object') {
          console.warn('RealTimeAlertDisplay: Invalid alert object:', alert);
          return null;
        }

        return (
          <div
            key={alert.id || `rt-alert-${index}`}
            className={`
              max-w-sm w-full bg-white shadow-lg rounded-lg border-l-4 p-4
              ${getSeverityStyles(alert.severity)}
              transform transition-all duration-300
            `}
            style={getAlertAnimation(index)}
          >
          <div className="flex items-start">
            <div className="flex-shrink-0">
              {getAlertIcon(alert.type || 'unknown')}
            </div>
            
            <div className="ml-3 flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">
                  {alert.severity?.toUpperCase() || 'UNKNOWN'} ALERT
                </span>
                <span className="text-xs text-gray-500">
                  {formatTime(alert.timestamp)}
                </span>
              </div>
              
              <p className="text-sm text-gray-900 mb-2">
                {alert.message || 'No message available'}
              </p>
              
              {showConfidence && alert.confidence && (
                <p className="text-xs text-gray-600 mb-2">
                  Confidence: {formatConfidence(alert.confidence)}
                </p>
              )}
              
              {alert.metadata && (
                <div className="text-xs text-gray-600 mb-3">
                  {alert.metadata.source && (
                    <span className="inline-block mr-2">
                      Source: {alert.metadata.source}
                    </span>
                  )}
                  {alert.metadata.faceCount !== undefined && (
                    <span className="inline-block mr-2">
                      Faces: {alert.metadata.faceCount}
                    </span>
                  )}
                  {alert.metadata.itemType && (
                    <span className="inline-block mr-2">
                      Item: {alert.metadata.itemType}
                    </span>
                  )}
                </div>
              )}
              
              <div className="flex items-center justify-between">
                <div className="flex space-x-2">
                  {onAlertAcknowledge && alert.id && (
                    <button
                      onClick={() => alert.id && handleAcknowledge(alert.id)}
                      className="inline-flex items-center px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Ack
                    </button>
                  )}
                  
                  {alert.id && (
                    <button
                      onClick={() => alert.id && handleDismiss(alert.id)}
                      className="inline-flex items-center px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
                    >
                      <X className="w-3 h-3 mr-1" />
                      Dismiss
                    </button>
                  )}
                </div>
                
                {autoHideAfter > 0 && (
                  <div className="text-xs text-gray-500">
                    Auto-hide in {autoHideAfter}s
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        );
      })}
    </div>
  );
};

export default RealTimeAlertDisplay;
