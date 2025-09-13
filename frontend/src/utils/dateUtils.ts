/**
 * Date utility functions with error handling
 */

/**
 * Safely converts a value to a Date object
 * @param value - The value to convert to Date
 * @returns A valid Date object or null if conversion fails
 */
export function safeParseDate(value: unknown): Date | null {
  try {
    if (value instanceof Date) {
      // Check if it's a valid date
      return isNaN(value.getTime()) ? null : value;
    }
    
    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      return isNaN(date.getTime()) ? null : date;
    }
    
    return null;
  } catch (error) {
    console.warn('Failed to parse date:', value, error);
    return null;
  }
}

/**
 * Safely formats a timestamp with error handling
 * @param date - The date to format
 * @param options - Intl.DateTimeFormat options
 * @param fallback - Fallback string if formatting fails
 * @returns Formatted time string or fallback
 */
export function safeFormatTime(
  date: unknown, 
  options: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  },
  fallback: string = 'Invalid Date'
): string {
  try {
    const validDate = safeParseDate(date);
    if (!validDate) {
      return fallback;
    }
    
    return validDate.toLocaleTimeString('en-US', options);
  } catch (error) {
    console.warn('Failed to format time:', date, error);
    return fallback;
  }
}

/**
 * Safely formats a date with error handling
 * @param date - The date to format
 * @param options - Intl.DateTimeFormat options
 * @param fallback - Fallback string if formatting fails
 * @returns Formatted date string or fallback
 */
export function safeFormatDate(
  date: unknown,
  options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  },
  fallback: string = 'Invalid Date'
): string {
  try {
    const validDate = safeParseDate(date);
    if (!validDate) {
      return fallback;
    }
    
    return validDate.toLocaleString('en-US', options);
  } catch (error) {
    console.warn('Failed to format date:', date, error);
    return fallback;
  }
}

/**
 * Safely calculates duration between two dates
 * @param start - Start date
 * @param end - End date
 * @returns Formatted duration string or error message
 */
export function safeFormatDuration(start: unknown, end: unknown): string {
  try {
    const startDate = safeParseDate(start);
    const endDate = safeParseDate(end);
    
    if (!startDate || !endDate) {
      return 'Unknown duration';
    }
    
    const diffMs = endDate.getTime() - startDate.getTime();
    
    // Handle negative durations
    if (diffMs < 0) {
      return '0s';
    }
    
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    
    if (diffHour > 0) {
      return `${diffHour}h ${diffMin % 60}m ${diffSec % 60}s`;
    } else if (diffMin > 0) {
      return `${diffMin}m ${diffSec % 60}s`;
    } else {
      return `${diffSec}s`;
    }
  } catch (error) {
    console.warn('Failed to calculate duration:', start, end, error);
    return 'Unknown duration';
  }
}

/**
 * Validates if a value is a valid date
 * @param value - The value to validate
 * @returns True if the value is a valid date
 */
export function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !isNaN(value.getTime());
}

/**
 * Creates a safe date with current time as fallback
 * @param value - The value to convert
 * @returns A valid Date object (current time if conversion fails)
 */
export function safeToDateWithFallback(value: unknown): Date {
  const parsed = safeParseDate(value);
  return parsed || new Date();
}