/**
 * Configuration for alert throttling.
 * Defines the minimum time in milliseconds that must pass before another alert of the same type is displayed.
 */
export const ALERT_THROTTLE_CONFIG: Record<string, number> = {
  'focus-loss': 10000,        // 10 seconds
  'absence': 15000,           // 15 seconds
  'face-visible': 12000,      // 12 seconds (recovery messages should not spam)
  'multiple-faces': 20000,    // 20 seconds
  'unauthorized-item': 30000, // 30 seconds
  'default': 5000             // 5 seconds for any other alert type
};
