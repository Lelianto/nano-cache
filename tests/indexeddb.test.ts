import { describe, expect, it } from 'vitest';
import { createCache, indexedDBAdapter } from '../src';

describe('IndexedDB Adapter', () => {
  it('should fall back gracefully to memory when IDB is unavailable or mock IDB in test', async () => {
    const cache = createCache({
      adapter: indexedDBAdapter({ dbName: 'test-db' }),
    });

    await cache.set('item1', { data: 'hello' });
    expect(await cache.get('item1')).toEqual({ data: 'hello' });

    expect(await cache.keys()).toContain('item1');
    expect(await cache.size()).toBe(1);

    await cache.delete('item1');
    expect(await cache.get('item1')).toBeNull();
  });
});
