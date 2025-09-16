/**
 * Configuration for alert throttling.
 * Defines the minimum time in milliseconds that must pass before another alert of the same type is displayed.
 */
export const ALERT_THROTTLE_CONFIG: Record<string, number> = {
  'focus-loss': 6000,         // 6 seconds to allow reasonable follow-ups
  'absence': 6000,            // Faster absence notification and follow-ups
  'face-visible': 5000,       // Quicker recovery message but still throttled
  'multiple-faces': 15000,    // 15 seconds
  'unauthorized-item': 20000, // 20 seconds
  'default': 7000             // 7 seconds for any other alert type
};
