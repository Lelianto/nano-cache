import { TTL } from '../types/cache';

/**
 * Parses TTL (milliseconds or formatted string like '10s', '5m', '1h', '1d') into milliseconds.
 * Returns null if input is undefined, null, or invalid.
 */
export function parseTTL(ttl?: TTL | null): number | null {
  if (ttl === undefined || ttl === null) {
    return null;
  }

  if (typeof ttl === 'number') {
    return ttl > 0 && Number.isFinite(ttl) ? Math.floor(ttl) : null;
  }

  if (typeof ttl !== 'string') {
    return null;
  }

  const trimmed = ttl.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  const match = /^(\d+)\s*(ms|s|m|h|d)?$/.exec(trimmed);
  if (!match) {
    return null;
  }

  const value = parseInt(match[1], 10);
  const unit = match[2] || 'ms';

  let multiplier: number;
  switch (unit) {
    case 'ms':
      multiplier = 1;
      break;
    case 's':
      multiplier = 1000;
      break;
    case 'm':
      multiplier = 60 * 1000;
      break;
    case 'h':
      multiplier = 3600 * 1000;
      break;
    case 'd':
      multiplier = 86400 * 1000;
      break;
    default:
      return null;
  }

  const result = value * multiplier;
  return Number.isSafeInteger(result) && result > 0 ? result : null;
}

/**
 * Checks whether an entry is expired given an optional expiration timestamp (in ms).
 */
export function isExpired(expiresAt: number | null | undefined, now: number = Date.now()): boolean {
  if (expiresAt === null || expiresAt === undefined) {
    return false;
  }
  return now >= expiresAt;
}
