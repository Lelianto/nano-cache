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

  switch (unit) {
    case 'ms':
      return value;
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 3600 * 1000;
    case 'd':
      return value * 86400 * 1000;
    default:
      return null;
  }
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
