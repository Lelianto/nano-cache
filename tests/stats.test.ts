import { describe, expect, it, vi } from 'vitest';
import { createCache } from '../src';

describe('Cache Statistics', () => {
  it('should track hits, misses, sets, deletes, and expired counters correctly', async () => {
    vi.useFakeTimers();
    const cache = createCache({ ttl: '10s' });

    // Two sets
    await cache.set('a', 1);
    await cache.set('b', 2);

    // Hits
    expect(await cache.get('a')).toBe(1); // hit 1
    expect(await cache.get('a')).toBe(1); // hit 2

    // Miss
    expect(await cache.get('missing')).toBeNull(); // miss 1

    // Delete 'b'
    await cache.delete('b'); // delete 1

    // Advance past TTL to expire 'a'
    vi.advanceTimersByTime(15_000);

    // This get triggers the expiry path → expired++ and miss++
    expect(await cache.get('a')).toBeNull(); // expired 1, miss 2

    const stats = await cache.stats();

    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(2);
    expect(stats.sets).toBe(2);
    expect(stats.deletes).toBe(1);
    expect(stats.expired).toBe(1);
    expect(stats.entries).toBe(0);

    vi.useRealTimers();
  });
});
