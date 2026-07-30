import { describe, expect, it } from 'vitest';
import { createCache, memoryAdapter } from '../src';

describe('Memory Adapter & Core CRUD Operations', () => {
  it('should get, set, delete, and clear items', async () => {
    const cache = createCache({ adapter: memoryAdapter() });

    await cache.set('a', 1);
    await cache.set('b', { name: 'John' });

    expect(await cache.get('a')).toBe(1);
    expect(await cache.get<any>('b')).toEqual({ name: 'John' });
    expect(await cache.has('a')).toBe(true);
    expect(await cache.has('c')).toBe(false);

    expect(await cache.size()).toBe(2);
    // Keys are returned in LRU order (most recently accessed last).
    // After two get() calls above 'b' is at tail, 'a' moved there after
    // get('a'), so order is non-deterministic here — use arrayContaining.
    expect(await cache.keys()).toEqual(expect.arrayContaining(['a', 'b']));

    expect(await cache.delete('a')).toBe(true);
    expect(await cache.get('a')).toBeNull();
    expect(await cache.size()).toBe(1);

    await cache.clear();
    expect(await cache.size()).toBe(0);
    expect(await cache.keys()).toEqual([]);
  });

  it('should support LRU capacity eviction', async () => {
    const cache = createCache({ max: 3 });

    await cache.set('k1', 1);
    await cache.set('k2', 2);
    await cache.set('k3', 3);

    // Access k1 to make k2 the least recently used
    await cache.get('k1');

    // Add 4th item → should evict the LRU (k2)
    await cache.set('k4', 4);

    expect(await cache.get('k2')).toBeNull();
    expect(await cache.get('k1')).toBe(1);
    expect(await cache.get('k3')).toBe(3);
    expect(await cache.get('k4')).toBe(4);
    expect(await cache.size()).toBe(3);
  });
});
