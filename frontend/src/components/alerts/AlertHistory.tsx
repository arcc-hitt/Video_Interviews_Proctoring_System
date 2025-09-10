import React, { useState, useEffect } from 'react';
import type { Alert } from '../../types';
import { Download, Search, Clock, AlertTriangle } from 'lucide-react';

interface AlertHistoryProps {
  sessionId: string;
  alerts: Alert[];
  onExport?: (format: 'csv' | 'json') => void;
  className?: string;
}

interface AlertHistoryEntry extends Alert {
  id: string;
  duration?: number;
  eventCount: number;
  firstOccurrence: Date;
  lastOccurrence: Date;
}

export const AlertHistory: React.FC<AlertHistoryProps> = ({
  sessionId,
  alerts,
  onExport,
  className = ''
}) => {
  const [historyEntries, setHistoryEntries] = useState<AlertHistoryEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'last-hour' | 'last-30min'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | Alert['type']>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | Alert['severity']>('all');
  const [sortBy, setSortBy] = useState<'timestamp' | 'severity' | 'type'>('timestamp');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Process alerts into history entries with aggregation
  useEffect(() => {
    const processedEntries = new Map<string, AlertHistoryEntry>();
    
    alerts.forEach((alert, index) => {
      const key = `${alert.type}-${alert.message}`;
      const existing = processedEntries.get(key);
      
      if (existing) {
        // Update existing entry
        existing.eventCount += 1;
        existing.lastOccurrence = new Date(Math.max(
          existing.lastOccurrence.getTime(),
          alert.timestamp.getTime()
        ));
        existing.firstOccurrence = new Date(Math.min(
          existing.firstOccurrence.getTime(),
          alert.timestamp.getTime()
        ));
      } else {
        // Create new entry
        processedEntries.set(key, {
          ...alert,
          id: `history-${index}`,
          eventCount: 1,
          firstOccurrence: alert.timestamp,
          lastOccurrence: alert.timestamp
        });
      }
    });
    
    setHistoryEntries(Array.from(processedEntries.values()));
  }, [alerts]);

  // Filter entries based on current filters
  const filteredEntries = historyEntries.filter(entry => {
    // Search filter
    if (searchTerm && !entry.message.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    
    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      const cutoff = new Date(now.getTime() - (dateFilter === 'last-hour' ? 60 * 60 * 1000 : 30 * 60 * 1000));
      if (entry.lastOccurrence < cutoff) {
        return false;
      }
    }
    
    // Type filter
    if (typeFilter !== 'all' && entry.type !== typeFilter) {
      return false;
    }
    
    // Severity filter
    if (severityFilter !== 'all' && entry.severity !== severityFilter) {
      return false;
    }
    
    return true;
  });

  // Sort entries
  const sortedEntries = [...filteredEntries].sort((a, b) => {
    let comparison = 0;
    
    switch (sortBy) {
      case 'timestamp':
        comparison = a.lastOccurrence.getTime() - b.lastOccurrence.getTime();
        break;
      case 'severity':
        const severityOrder = { high: 3, medium: 2, low: 1 };
        comparison = severityOrder[a.severity] - severityOrder[b.severity];
        break;
      case 'type':
        comparison = a.type.localeCompare(b.type);
        break;
    }
    
    return sortOrder === 'desc' ? -comparison : comparison;
  });

  // Get severity styling
  const getSeverityColor = (severity: Alert['severity']) => {
    switch (severity) {
      case 'low':
        return 'text-yellow-600 bg-yellow-50';
      case 'medium':
        return 'text-orange-600 bg-orange-50';
      case 'high':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  // Get type icon and label
  const getTypeInfo = (type: Alert['type']) => {
    switch (type) {
      case 'focus-loss':
        return { label: 'Focus Loss', icon: '👁️' };
      case 'absence':
        return { label: 'Absence', icon: '❌' };
      case 'multiple-faces':
        return { label: 'Multiple Faces', icon: '👥' };
      case 'unauthorized-item':
        return { label: 'Unauthorized Item', icon: '📱' };
      default:
        return { label: 'Unknown', icon: '⚠️' };
    }
  };

  // Format duration
  const formatDuration = (start: Date, end: Date) => {
    const diffMs = end.getTime() - start.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    
    if (diffMin > 0) {
      return `${diffMin}m ${diffSec % 60}s`;
    }
    return `${diffSec}s`;
  };

  // Format timestamp
  const formatTimestamp = (date: Date) => {
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  // Handle export
  const handleExport = (format: 'csv' | 'json') => {
    if (onExport) {
      onExport(format);
    } else {
      // Default export implementation
      const data = sortedEntries.map(entry => ({
        timestamp: entry.lastOccurrence.toISOString(),
        type: entry.type,
        severity: entry.severity,
        message: entry.message,
        eventCount: entry.eventCount,
        duration: formatDuration(entry.firstOccurrence, entry.lastOccurrence),
        firstOccurrence: entry.firstOccurrence.toISOString(),
        lastOccurrence: entry.lastOccurrence.toISOString()
      }));
      
      if (format === 'csv') {
        const csv = [
          Object.keys(data[0]).join(','),
          ...data.map(row => Object.values(row).join(','))
        ].join('\n');
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `alert-history-${sessionId}-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `alert-history-${sessionId}-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    }
  };

  return (
    <div className={`bg-white rounded-lg shadow-sm border ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <Clock className="w-5 h-5 text-blue-500" />
            <h3 className="text-lg font-medium text-gray-900">Alert History</h3>
            <span className="text-sm text-gray-500">
              ({filteredEntries.length} of {historyEntries.length} entries)
            </span>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleExport('csv')}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              <Download className="w-4 h-4 mr-1" />
              CSV
            </button>
            <button
              onClick={() => handleExport('json')}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              <Download className="w-4 h-4 mr-1" />
              JSON
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search alerts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Date Filter */}
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as typeof dateFilter)}
            className="text-sm border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Time</option>
            <option value="last-hour">Last Hour</option>
            <option value="last-30min">Last 30 Minutes</option>
          </select>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
            className="text-sm border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Types</option>
            <option value="focus-loss">Focus Loss</option>
            <option value="absence">Absence</option>
            <option value="multiple-faces">Multiple Faces</option>
            <option value="unauthorized-item">Unauthorized Item</option>
          </select>

          {/* Severity Filter */}
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as typeof severityFilter)}
            className="text-sm border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Severities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {/* Sort */}
          <div className="flex space-x-1">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="flex-1 text-sm border border-gray-300 rounded-l-md px-2 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="timestamp">Time</option>
              <option value="severity">Severity</option>
              <option value="type">Type</option>
            </select>
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="px-2 py-2 text-sm border border-l-0 border-gray-300 rounded-r-md hover:bg-gray-50 focus:ring-2 focus:ring-blue-500"
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>
      </div>

      {/* History List */}
      <div className="max-h-96 overflow-y-auto">
        {sortedEntries.length === 0 ? (
          <div className="p-6 text-center">
            <AlertTriangle className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">No alerts match your filters</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {sortedEntries.map((entry) => {
              const typeInfo = getTypeInfo(entry.type);
              return (
                <div key={entry.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3 flex-1">
                      <div className="text-lg">{typeInfo.icon}</div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="text-sm font-medium text-gray-900">
                            {typeInfo.label}
                          </span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getSeverityColor(entry.severity)}`}>
                            {entry.severity.toUpperCase()}
                          </span>
                          {entry.eventCount > 1 && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {entry.eventCount}x
                            </span>
                          )}
                        </div>
                        
                        <p className="text-sm text-gray-700 mb-2">
                          {entry.message}
                        </p>
                        
                        <div className="flex items-center space-x-4 text-xs text-gray-500">
                          <span>
                            Last: {formatTimestamp(entry.lastOccurrence)}
                          </span>
                          {entry.eventCount > 1 && (
                            <>
                              <span>
                                First: {formatTimestamp(entry.firstOccurrence)}
                              </span>
                              <span>
                                Duration: {formatDuration(entry.firstOccurrence, entry.lastOccurrence)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      {sortedEntries.length > 0 && (
        <div className="p-3 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center justify-between text-xs text-gray-600">
            <span>
              Showing {sortedEntries.length} of {historyEntries.length} alert entries
            </span>
            <span>
              Total events: {historyEntries.reduce((sum, entry) => sum + entry.eventCount, 0)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};