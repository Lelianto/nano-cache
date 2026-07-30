import { describe, expect, it, vi } from 'vitest';
import { createCache } from '../src';

describe('fetch() Helper & Request Deduplication', () => {
  it('should fetch and cache value when not cached', async () => {
    const cache = createCache();
    const fetcher = vi.fn().mockResolvedValue({ id: 1, name: 'Alice' });

    const user = await cache.fetch('user:1', fetcher, { ttl: '5m' });
    expect(user).toEqual({ id: 1, name: 'Alice' });
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Second call should return cached value without invoking fetcher
    const cachedUser = await cache.fetch('user:1', fetcher);
    expect(cachedUser).toEqual({ id: 1, name: 'Alice' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('should deduplicate simultaneous concurrent fetch calls (stampede protection)', async () => {
    const cache = createCache();
    let callCount = 0;

    const slowFetcher = async () => {
      callCount++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { data: 'result' };
    };

    // Execute 5 simultaneous requests for the same uncached key
    const results = await Promise.all([
      cache.fetch('shared_key', slowFetcher),
      cache.fetch('shared_key', slowFetcher),
      cache.fetch('shared_key', slowFetcher),
      cache.fetch('shared_key', slowFetcher),
      cache.fetch('shared_key', slowFetcher),
    ]);

    expect(callCount).toBe(1);
    expect(results).toEqual([
      { data: 'result' },
      { data: 'result' },
      { data: 'result' },
      { data: 'result' },
      { data: 'result' },
    ]);
  });
});
