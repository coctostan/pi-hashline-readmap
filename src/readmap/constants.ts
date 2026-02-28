/**
 * Constants for thresholds.
 */
export const THRESHOLDS = {
  /** Maximum lines before truncation */
  MAX_LINES: 2000,
  /** Maximum bytes before truncation */
  MAX_BYTES: 50 * 1024,
  /** Maximum map size in bytes */
  MAX_MAP_BYTES: 25 * 1024,
  /** Target size for full detail */
  FULL_TARGET_BYTES: 10 * 1024,
  /** Target size for compact detail */
  COMPACT_TARGET_BYTES: 20 * 1024,
  /** Maximum size for outline level */
  MAX_OUTLINE_BYTES: 50 * 1024,
  /** Maximum size for truncated level (hard cap) */
  MAX_TRUNCATED_BYTES: 100 * 1024,
  /** Number of symbols to show at each end for truncated outline */
  TRUNCATED_SYMBOLS_EACH: 50,
} as const;
