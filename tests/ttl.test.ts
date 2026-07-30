import { describe, expect, it, vi } from 'vitest';
import { createCache, parseTTL } from '../src';

describe('TTL Utility & Behavior', () => {
  it('should correctly parse numeric and string TTL values', () => {
    expect(parseTTL(1000)).toBe(1000);
    expect(parseTTL('500ms')).toBe(500);
    expect(parseTTL('10s')).toBe(10000);
    expect(parseTTL('5m')).toBe(300_000);
    expect(parseTTL('1h')).toBe(3_600_000);
    expect(parseTTL('1d')).toBe(86_400_000);
    expect(parseTTL(undefined)).toBeNull();
    expect(parseTTL(null)).toBeNull();
    expect(parseTTL('invalid' as any)).toBeNull();
  });

  it('should auto-expire cached items after TTL passes', async () => {
    vi.useFakeTimers();
    const cache = createCache({ ttl: '5m' });

    await cache.set('temp', 'value');
    expect(await cache.get('temp')).toBe('value');

    // Advance 4 minutes — not yet expired
    vi.advanceTimersByTime(4 * 60 * 1000);
    expect(await cache.get('temp')).toBe('value');

    // Advance another 2 minutes — now expired
    vi.advanceTimersByTime(2 * 60 * 1000);
    expect(await cache.get('temp')).toBeNull();

    vi.useRealTimers();
  });

  it('should support per-key TTL overrides on set()', async () => {
    vi.useFakeTimers();
    const cache = createCache({ ttl: '1h' });

    await cache.set('short', 'val', { ttl: '10s' });
    await cache.set('long', 'val');

    vi.advanceTimersByTime(15_000); // 15s elapsed

    expect(await cache.get('short')).toBeNull(); // 10s TTL expired
    expect(await cache.get('long')).toBe('val');  // 1h TTL still valid

    vi.useRealTimers();
  });
});
