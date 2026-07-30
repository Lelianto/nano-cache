import { describe, expect, it, vi } from 'vitest';
import { createCache, memoryAdapter, localStorageAdapter, sessionStorageAdapter, createAdapter } from '../src';
import { NanoEventEmitter } from '../src/utils/event-emitter';

describe('Adapter Coverage — Batch, Tags, and Edge Cases', () => {
  // ───────────────────── Memory ─────────────────────
  describe('MemoryAdapter', () => {
    it('batch getMany/setMany/deleteMany', async () => {
      const cache = createCache({ adapter: memoryAdapter() });
      await cache.setMany([
        { key: 'x', value: 1 },
        { key: 'y', value: 2 },
        { key: 'z', value: 3 },
      ]);
      const result = await cache.getMany(['x', 'y', 'missing']);
      expect(result).toEqual({ x: 1, y: 2, missing: null });

      const deleted = await cache.deleteMany(['x', 'z', 'ghost']);
      expect(deleted).toBe(2);
    });

    it('tag invalidation via invalidateTag()', async () => {
      const adapter = memoryAdapter();
      const cache = createCache({ adapter });
      await cache.set('a', 1, { tags: ['api'] });
      await cache.set('b', 2, { tags: ['api', 'auth'] });
      await cache.set('c', 3, { tags: ['db'] });

      await cache.invalidateTag('api');
      expect(await cache.get('a')).toBeNull();
      expect(await cache.get('b')).toBeNull();
      expect(await cache.get('c')).toBe(3);
    });

    it('has() returns true for valid key, false for expired', async () => {
      vi.useFakeTimers();
      const cache = createCache({ adapter: memoryAdapter() });
      await cache.set('k', 'v', { ttl: '1s' });
      expect(await cache.has('k')).toBe(true);
      vi.advanceTimersByTime(2000);
      expect(await cache.has('k')).toBe(false);
      vi.useRealTimers();
    });

    it('delete() returns false when key does not exist', async () => {
      const cache = createCache({ adapter: memoryAdapter() });
      expect(await cache.delete('nonexistent')).toBe(false);
    });
  });

  // ───────────────────── LocalStorage / SessionStorage ─────────────────────
  describe('WebStorageAdapter', () => {
    it('localStorage — batch operations and invalidateTag', async () => {
      const cache = createCache({ adapter: localStorageAdapter({ prefix: 'cov_ls:' }) });

      await cache.setMany([
        { key: 'p', value: 10, options: { tags: ['group1'] } },
        { key: 'q', value: 20, options: { tags: ['group1'] } },
        { key: 'r', value: 30 },
      ]);

      const res = await cache.getMany(['p', 'q', 'r']);
      expect(res).toEqual({ p: 10, q: 20, r: 30 });

      await cache.invalidateTag('group1');
      expect(await cache.get('p')).toBeNull();
      expect(await cache.get('q')).toBeNull();
      expect(await cache.get('r')).toBe(30);

      const deleted = await cache.deleteMany(['r']);
      expect(deleted).toBe(1);
    });

    it('sessionStorage — set/get/clear', async () => {
      const cache = createCache({ adapter: sessionStorageAdapter({ prefix: 'cov_ss:' }) });
      await cache.set('sess', 'val');
      expect(await cache.get('sess')).toBe('val');
      expect(await cache.has('sess')).toBe(true);
      await cache.clear();
      expect(await cache.get('sess')).toBeNull();
    });
  });

  // ───────────────────── CustomAdapter ─────────────────────
  describe('CustomAdapter', () => {
    it('falls back to default implementations when optional methods not supplied', async () => {
      const mem = new Map<string, any>();
      const custom = createAdapter({
        get: (k) => mem.get(k) || null,
        set: (k, item) => { mem.set(k, item); },
        delete: (k) => mem.delete(k),
        clear: () => mem.clear(),
        keys: () => Array.from(mem.keys()),
      });

      const cache = createCache({ adapter: custom });

      await cache.set('m', 99, { tags: ['tag1'] });
      expect(await cache.has('m')).toBe(true);
      expect(await cache.size()).toBe(1);

      // invalidateTag without adapter method → falls back to key scan
      await cache.invalidateTag('tag1');
      expect(await cache.get('m')).toBeNull();
    });

    it('uses provided optional batch/invalidateTag methods when available', async () => {
      const mem = new Map<string, any>();
      const getManyFn = vi.fn((keys: string[]) => {
        const r: Record<string, any> = {};
        for (const k of keys) r[k] = mem.get(k) || null;
        return r;
      });
      const invalidateTagFn = vi.fn(() => {});

      const custom = createAdapter({
        get: (k) => mem.get(k) || null,
        set: (k, item) => { mem.set(k, item); },
        delete: (k) => mem.delete(k),
        clear: () => mem.clear(),
        keys: () => Array.from(mem.keys()),
        getMany: getManyFn,
        invalidateTag: invalidateTagFn,
      });

      // Call adapter.getMany directly to verify delegation
      await custom.getMany(['x', 'y']);
      expect(getManyFn).toHaveBeenCalled();

      // invalidateTag delegation via cache
      const cache = createCache({ adapter: custom });
      await cache.invalidateTag('anything');
      expect(invalidateTagFn).toHaveBeenCalledWith('anything');
    });
  });

  // ───────────────────── EventEmitter ─────────────────────
  describe('NanoEventEmitter', () => {
    it('off() removes a listener and removeAllListeners() clears all', () => {
      const emitter = new NanoEventEmitter();
      const listener = vi.fn();

      emitter.on('set', listener);
      emitter.emit('set', 'k', 'v');
      expect(listener).toHaveBeenCalledTimes(1);

      emitter.off('set', listener);
      emitter.emit('set', 'k', 'v');
      expect(listener).toHaveBeenCalledTimes(1); // not called again

      // removeAllListeners
      const l2 = vi.fn();
      emitter.on('get', l2);
      emitter.removeAllListeners();
      emitter.emit('get', 'k', 'v');
      expect(l2).not.toHaveBeenCalled();
    });

    it('emit does not throw when listener throws', () => {
      const emitter = new NanoEventEmitter();
      emitter.on('set', () => { throw new Error('bad listener'); });
      expect(() => emitter.emit('set', 'k', 'v')).not.toThrow();
    });
  });

  // ───────────────────── Cache.on() returns unsubscribe ─────────────────────
  describe('cache.on() unsubscribe', () => {
    it('returned unsubscribe function removes listener', async () => {
      const cache = createCache();
      const listener = vi.fn();
      const unsub = cache.on('set', listener);

      await cache.set('a', 1);
      expect(listener).toHaveBeenCalledTimes(1);

      unsub(); // remove listener
      await cache.set('b', 2);
      expect(listener).toHaveBeenCalledTimes(1); // not called again
    });
  });
});
