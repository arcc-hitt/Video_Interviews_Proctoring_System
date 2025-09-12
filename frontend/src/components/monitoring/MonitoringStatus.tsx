import React, { useState, useEffect } from 'react';
import { Eye, Camera, Zap, Wifi, AlertTriangle, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import type { FocusStatus, UnauthorizedItem } from '../../types';
import { CV_CONFIG } from '../../config/cvConfig';

interface MonitoringStatusProps {
  isFaceDetectionActive: boolean;
  isObjectDetectionActive: boolean;
  isWebSocketConnected: boolean;
  currentFocusStatus?: FocusStatus | null;
  unauthorizedItems?: UnauthorizedItem[];
  processingMetrics?: {
    frameRate: number;
    processingTime: number;
    memoryUsage: number;
  };
  totalEventsLogged: number;
  className?: string;
}

interface StatusItemProps {
  icon: React.ReactNode;
  label: string;
  status: 'active' | 'inactive' | 'error' | 'loading';
  details?: string;
  value?: string | number;
}

const StatusItem: React.FC<StatusItemProps> = ({ icon, label, status, details, value }) => {
  const getStatusIcon = () => {
    switch (status) {
      case 'active':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'loading':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      default:
        return <XCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'active':
        return 'bg-green-50 border-green-200';
      case 'error':
        return 'bg-red-50 border-red-200';
      case 'loading':
        return 'bg-blue-50 border-blue-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className={`p-3 rounded-lg border ${getStatusColor()}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          {icon}
          <span className="text-sm font-medium text-gray-900">{label}</span>
        </div>
        {getStatusIcon()}
      </div>
      
      {value !== undefined && (
        <div className="text-lg font-bold text-gray-900 mb-1">
          {value}
        </div>
      )}
      
      {details && (
        <div className="text-xs text-gray-600">
          {details}
        </div>
      )}
    </div>
  );
};

export const MonitoringStatus: React.FC<MonitoringStatusProps> = ({
  isFaceDetectionActive,
  isObjectDetectionActive,
  isWebSocketConnected,
  currentFocusStatus,
  unauthorizedItems = [],
  processingMetrics,
  totalEventsLogged,
  className = ''
}) => {
  const [performanceWarnings, setPerformanceWarnings] = useState<string[]>([]);

  // Monitor performance and generate warnings
  useEffect(() => {
    const warnings: string[] = [];

    if (processingMetrics) {
      if (processingMetrics.processingTime > CV_CONFIG.processing.maxFrameQueueSize * 20) {
        warnings.push('High processing latency detected');
      }
      
      if (processingMetrics.frameRate < 5) {
        warnings.push('Low frame rate detected');
      }
      
      if (processingMetrics.memoryUsage > CV_CONFIG.performance.maxMemoryUsage * 0.8) {
        warnings.push('High memory usage detected');
      }
    }

    setPerformanceWarnings(warnings);
  }, [processingMetrics]);

  // Determine focus status details
  const getFocusStatusDetails = () => {
    if (!currentFocusStatus) return 'No status available';
    
    if (!currentFocusStatus.isPresent) {
      return 'Candidate not detected';
    } else if (!currentFocusStatus.isFocused) {
      return 'Looking away from screen';
    } else if (currentFocusStatus.faceCount > 1) {
      return `${currentFocusStatus.faceCount} faces detected`;
    } else {
      return 'Focused on screen';
    }
  };

  const getFocusStatusValue = () => {
    if (!currentFocusStatus) return 'N/A';
    return Math.round((currentFocusStatus.confidence || 0) * 100) + '%';
  };

  const getFocusStatus = (): StatusItemProps['status'] => {
    if (!isFaceDetectionActive) return 'inactive';
    if (!currentFocusStatus) return 'loading';
    
    if (!currentFocusStatus.isPresent || currentFocusStatus.faceCount > 1) {
      return 'error';
    } else if (!currentFocusStatus.isFocused) {
      return 'loading';
    }
    return 'active';
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900">Monitoring Status</h3>
        {performanceWarnings.length > 0 && (
          <div className="flex items-center space-x-1 text-yellow-600">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-xs">{performanceWarnings.length} warning(s)</span>
          </div>
        )}
      </div>

      {/* Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatusItem
          icon={<Eye className="w-4 h-4 text-blue-600" />}
          label="Face Detection"
          status={getFocusStatus()}
          details={getFocusStatusDetails()}
          value={getFocusStatusValue()}
        />

        <StatusItem
          icon={<Camera className="w-4 h-4 text-purple-600" />}
          label="Object Detection"
          status={isObjectDetectionActive ? 'active' : 'inactive'}
          details={unauthorizedItems.length > 0 
            ? `${unauthorizedItems.length} unauthorized item(s) detected`
            : 'No unauthorized items detected'
          }
          value={unauthorizedItems.length}
        />

        <StatusItem
          icon={<Wifi className="w-4 h-4 text-green-600" />}
          label="Real-time Communication"
          status={isWebSocketConnected ? 'active' : 'error'}
          details={isWebSocketConnected 
            ? 'Connected to monitoring system'
            : 'Disconnected from monitoring system'
          }
        />

        <StatusItem
          icon={<Zap className="w-4 h-4 text-orange-600" />}
          label="Events Logged"
          status={totalEventsLogged > 0 ? 'active' : 'inactive'}
          details={`Total detection events recorded`}
          value={totalEventsLogged}
        />
      </div>

      {/* Performance Metrics */}
      {processingMetrics && CV_CONFIG.debug.enablePerformanceMetrics && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-900 mb-3">Performance Metrics</h4>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-lg font-bold text-gray-900">
                {processingMetrics.frameRate.toFixed(1)}
              </div>
              <div className="text-xs text-gray-600">FPS</div>
            </div>
            <div>
              <div className="text-lg font-bold text-gray-900">
                {processingMetrics.processingTime.toFixed(1)}
              </div>
              <div className="text-xs text-gray-600">ms/frame</div>
            </div>
            <div>
              <div className="text-lg font-bold text-gray-900">
                {(processingMetrics.memoryUsage / (1024 * 1024)).toFixed(1)}
              </div>
              <div className="text-xs text-gray-600">MB</div>
            </div>
          </div>
        </div>
      )}

      {/* Performance Warnings */}
      {performanceWarnings.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-yellow-600" />
            <span className="text-sm font-medium text-yellow-800">Performance Warnings</span>
          </div>
          <ul className="space-y-1">
            {performanceWarnings.map((warning, index) => (
              <li key={index} className="text-sm text-yellow-700">
                • {warning}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* System Status Summary */}
      <div className="text-center">
        <div className={`inline-flex items-center px-3 py-2 rounded-full text-sm font-medium ${
          isFaceDetectionActive && isWebSocketConnected
            ? 'bg-green-100 text-green-800'
            : 'bg-red-100 text-red-800'
        }`}>
          {isFaceDetectionActive && isWebSocketConnected ? (
            <>
              <CheckCircle className="w-4 h-4 mr-2" />
              Monitoring Active
            </>
          ) : (
            <>
              <XCircle className="w-4 h-4 mr-2" />
              Monitoring Issues
            </>
          )}
        </div>
      </div>
    </div>
  );
};
