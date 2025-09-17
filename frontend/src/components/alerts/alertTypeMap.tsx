import React from 'react';
import { Eye, X, Users, Smartphone, Flag, AlertTriangle, Ear, Mic2 } from 'lucide-react';
import type { Alert } from '../../types';

/**
 * Central mapping for alert/detection event types -> labels & icons.
 * Keeps UI consistent across AlertHistory, AlertManagementPanel, ReportDashboard, etc.
 */
export interface AlertTypeInfo {
  label: string;
  icon: React.ReactNode;
  category: 'focus' | 'presence' | 'faces' | 'device' | 'manual' | 'audio' | 'other';
  isViolation?: boolean; // counts toward deductions
  isRecovery?: boolean;  // positive/recovery signal (e.g., face-visible)
  defaultSeverity?: Alert['severity'];
}

const base = 'w-4 h-4';

export const ALERT_TYPE_INFO: Record<string, AlertTypeInfo> = {
  'focus-loss': { label: 'Focus Loss', icon: <Eye className={`${base} text-yellow-600`} />, category: 'focus', isViolation: true, defaultSeverity: 'medium' },
  'absence': { label: 'Absence', icon: <X className={`${base} text-red-600`} />, category: 'presence', isViolation: true, defaultSeverity: 'high' },
  'face-visible': { label: 'Face Visible', icon: <Eye className={`${base} text-green-600`} />, category: 'presence', isRecovery: true, defaultSeverity: 'low' },
  'multiple-faces': { label: 'Multiple Faces', icon: <Users className={`${base} text-purple-600`} />, category: 'faces', isViolation: true, defaultSeverity: 'high' },
  'unauthorized-item': { label: 'Unauthorized Item', icon: <Smartphone className={`${base} text-orange-600`} />, category: 'device', isViolation: true, defaultSeverity: 'high' },
  'manual_flag': { label: 'Manual Flag', icon: <Flag className={`${base} text-orange-500`} />, category: 'manual', isViolation: true, defaultSeverity: 'medium' },
  'background-voice': { label: 'Background Voice', icon: <Mic2 className={`${base} text-blue-600`} />, category: 'audio', isViolation: true, defaultSeverity: 'high' },
  'multiple-voices': { label: 'Multiple Voices', icon: <Mic2 className={`${base} text-blue-700`} />, category: 'audio', isViolation: true, defaultSeverity: 'high' },
  'excessive-noise': { label: 'Excessive Noise', icon: <Ear className={`${base} text-blue-500`} />, category: 'audio', isViolation: true, defaultSeverity: 'high' },
};

export function getAlertTypeInfo(type: string): AlertTypeInfo {
  return ALERT_TYPE_INFO[type] || { label: 'Unknown', icon: <AlertTriangle className={`${base} text-gray-500`} />, category: 'other' };
}
