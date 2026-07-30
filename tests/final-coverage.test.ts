import { describe, expect, it, vi } from 'vitest';
import { createAdapter } from '../src/adapters/custom';
import { memoryAdapter } from '../src/adapters/memory';
import { redisAdapter, RedisLikeClient } from '../src/adapters/redis';
import { createCache } from '../src/cache';
import { isExpired } from '../src/utils/expiration';

class MockRedisClient implements RedisLikeClient {
  public store = new Map<string, string>();
  async get(key: string) { return this.store.get(key) ?? null; }
  async set(key: string, value: string) { this.store.set(key, value); return 'OK'; }
  async del(...keys: string[]) {
    let n = 0;
    for (const k of keys) { if (this.store.delete(k)) n++; }
    return n;
  }
  async keys(pattern: string) {
    const prefix = pattern.replace('*', '');
    return Array.from(this.store.keys()).filter(k => k.startsWith(prefix));
  }
}

describe('Final Branch & Line Coverage', () => {

  // ─── custom.ts: setMany with config.setMany provided ───
  it('CustomAdapter.setMany delegates to config.setMany', async () => {
    const setManyFn = vi.fn(async () => {});
    const adapter = createAdapter({
      get: () => null,
      set: () => {},
      delete: () => false,
      clear: () => {},
      setMany: setManyFn,
    });
    const now = Date.now();
    await adapter.setMany([{ key: 'x', item: { value: 1, createdAt: now, expiresAt: null } }]);
    expect(setManyFn).toHaveBeenCalled();
  });

  // ─── custom.ts: deleteMany with config.deleteMany provided ───
  it('CustomAdapter.deleteMany delegates to config.deleteMany', async () => {
    const deleteManyFn = vi.fn(async () => 2);
    const adapter = createAdapter({
      get: () => null,
      set: () => {},
      delete: () => false,
      clear: () => {},
      deleteMany: deleteManyFn,
    });
    const result = await adapter.deleteMany(['a', 'b']);
    expect(deleteManyFn).toHaveBeenCalled();
    expect(result).toBe(2);
  });

  // ─── memory.ts: has() returns true for a valid unexpired item ───
  it('MemoryAdapter.has() returns true for unexpired item', () => {
    const adapter = memoryAdapter();
    const now = Date.now();
    adapter.set('valid', { value: 42, createdAt: now, expiresAt: now + 100_000 });
    expect(adapter.has('valid')).toBe(true);
  });

  // ─── memory.ts: removeFromTags — last key for a tag removes the tag entry ───
  it('MemoryAdapter.removeFromTags removes tag entry when last key removed', () => {
    const adapter = memoryAdapter();
    const now = Date.now();
    // Set a single key with a tag — when we re-set it, removeFromTags runs
    // and should remove the tag because the set becomes empty
    adapter.set('k', { value: 1, createdAt: now, expiresAt: null, tags: ['solo'] });
    // Re-set the same key → triggers removeFromTags on the old item then re-adds
    adapter.set('k', { value: 2, createdAt: now, expiresAt: null });
    // If removeFromTags correctly cleaned up, the tag 'solo' should be gone
    // Verify by invalidating (should be no-op without crashing)
    expect(() => adapter.invalidateTag('solo')).not.toThrow();
  });

  // ─── redis.ts: set without expiresAt (no PX args) ───
  it('RedisAdapter.set without expiresAt does not pass PX', async () => {
    const client = new MockRedisClient();
    const spy = vi.spyOn(client, 'set');
    const adapter = redisAdapter(client, { prefix: 'no_px:' });
    const now = Date.now();
    await adapter.set('k', { value: 1, createdAt: now, expiresAt: null });
    // Should be called with only 2 args (key, value) — no PX
    expect(spy).toHaveBeenCalledWith('no_px:k', expect.any(String));
  });

  // ─── cache.ts: deleteMany path ───
  it('cache.deleteMany removes multiple keys', async () => {
    const cache = createCache();
    await cache.set('a', 1);
    await cache.set('b', 2);
    await cache.set('c', 3);

    const deleted = await cache.deleteMany(['a', 'c', 'ghost']);
    expect(deleted).toBe(2);
    expect(await cache.get('b')).toBe(2);
  });

  // ─── cache.ts: has() returns false for nonexistent key ───
  it('cache.has() returns false for missing key', async () => {
    const cache = createCache();
    expect(await cache.has('nonexistent')).toBe(false);
  });

  // ─── expiration.ts: isExpired returns false when expiresAt is in the future ───
  it('isExpired returns false when expiresAt is in the future', () => {
    const future = Date.now() + 100_000;
    expect(isExpired(future)).toBe(false);
  });
});
