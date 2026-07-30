import { describe, expect, it, vi } from 'vitest';
import { createAdapter } from '../src/adapters/custom';
import { memoryAdapter } from '../src/adapters/memory';
import { createCache } from '../src/cache';

describe('Deep Path Coverage', () => {

  // ─── CustomAdapter setMany/deleteMany fallback loops ───
  describe('CustomAdapter fallback loops (no optional methods)', () => {
    it('setMany uses fallback loop when config.setMany not provided', async () => {
      const mem = new Map<string, any>();
      const adapter = createAdapter({
        get: (k) => mem.get(k) || null,
        set: (k, item) => { mem.set(k, item); },
        delete: (k) => mem.delete(k),
        clear: () => mem.clear(),
      });

      const now = Date.now();
      await adapter.setMany([
        { key: 'a', item: { value: 1, createdAt: now, expiresAt: null } },
        { key: 'b', item: { value: 2, createdAt: now, expiresAt: null } },
      ]);

      expect((await adapter.get('a'))?.value).toBe(1);
      expect((await adapter.get('b'))?.value).toBe(2);
    });

    it('deleteMany uses fallback loop when config.deleteMany not provided', async () => {
      const mem = new Map<string, any>();
      const now = Date.now();
      mem.set('x', { value: 10, createdAt: now, expiresAt: null });
      mem.set('y', { value: 20, createdAt: now, expiresAt: null });

      const adapter = createAdapter({
        get: (k) => mem.get(k) || null,
        set: (k, item) => { mem.set(k, item); },
        delete: (k) => mem.delete(k),
        clear: () => mem.clear(),
      });

      const count = await adapter.deleteMany(['x', 'ghost']);
      expect(count).toBe(1);
      expect(mem.has('x')).toBe(false);
    });

    it('size() falls back to keys() when no size method provided', async () => {
      const mem = new Map<string, any>();
      const now = Date.now();
      mem.set('k1', { value: 1, createdAt: now, expiresAt: null });

      const adapter = createAdapter({
        get: (k) => mem.get(k) || null,
        set: (k, item) => { mem.set(k, item); },
        delete: (k) => mem.delete(k),
        clear: () => mem.clear(),
        keys: () => Array.from(mem.keys()),
      });

      expect(await adapter.size()).toBe(1);
    });
  });

  // ─── MemoryAdapter has() with expired item ───
  describe('MemoryAdapter has() with expired item', () => {
    it('returns false and removes the item when expired', () => {
      vi.useFakeTimers();
      const adapter = memoryAdapter();
      const now = Date.now();
      adapter.set('exp', { value: 'x', createdAt: now, expiresAt: now + 1000 });

      vi.advanceTimersByTime(2000);
      expect(adapter.has('exp')).toBe(false);
      vi.useRealTimers();
    });
  });

  // ─── cache.off() method ───
  describe('cache.off() removes listeners', () => {
    it('off() prevents further event delivery', async () => {
      const cache = createCache();
      const fn = vi.fn();

      cache.on('set', fn);
      await cache.set('a', 1);
      expect(fn).toHaveBeenCalledTimes(1);

      cache.off('set', fn);
      await cache.set('b', 2);
      expect(fn).toHaveBeenCalledTimes(1); // not called again
    });
  });

  // ─── Cache size() delegates to adapter.size when available ───
  describe('cache.size() via adapter.size()', () => {
    it('works correctly through size delegated to adapter', async () => {
      const cache = createCache();
      await cache.set('k1', 1);
      await cache.set('k2', 2);
      expect(await cache.size()).toBe(2);
      await cache.delete('k1');
      expect(await cache.size()).toBe(1);
    });
  });

  // ─── Custom adapter get/has/size error handling ───
  describe('CustomAdapter error handling', () => {
    it('get returns null on thrown error', async () => {
      const adapter = createAdapter({
        get: () => { throw new Error('storage fail'); },
        set: () => {},
        delete: () => false,
        clear: () => {},
      });
      expect(await adapter.get('k')).toBeNull();
    });

    it('has returns false on thrown error', async () => {
      const adapter = createAdapter({
        get: () => { throw new Error('storage fail'); },
        set: () => {},
        delete: () => false,
        clear: () => {},
      });
      expect(await adapter.has('k')).toBe(false);
    });

    it('size returns 0 on thrown error', async () => {
      const adapter = createAdapter({
        get: () => null,
        set: () => {},
        delete: () => false,
        clear: () => {},
        size: () => { throw new Error('size fail'); },
      });
      expect(await adapter.size()).toBe(0);
    });
  });

  // ─── Cache fetch with force:true bypasses cache ───
  describe('cache.fetch() with force option', () => {
    it('force:true re-executes fetcher even when key is cached', async () => {
      const cache = createCache();
      let count = 0;
      const fetcher = async () => { count++; return count; };

      await cache.fetch('k', fetcher);
      expect(count).toBe(1);
      expect(await cache.get('k')).toBe(1);

      await cache.fetch('k', fetcher, { force: true });
      expect(count).toBe(2);
      expect(await cache.get('k')).toBe(2);
    });
  });
});
