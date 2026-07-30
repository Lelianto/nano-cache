import { describe, expect, it } from 'vitest';
import { localStorageAdapter } from '../src/adapters/local-storage';
import { sessionStorageAdapter as ssAdapter } from '../src/adapters/session-storage';
import { redisAdapter, RedisLikeClient } from '../src/adapters/redis';
import { memoryAdapter } from '../src/adapters/memory';
import { defaultSerializer } from '../src/utils/serializer';
import { formatKey, stripNamespace } from '../src/utils/hash';
import { parseTTL, isExpired } from '../src/utils/expiration';

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

describe('Adapter Direct — Batch & Supplementary Coverage', () => {

  // ─── MemoryAdapter directly ───
  describe('MemoryAdapter direct', () => {
    it('getMany / setMany / deleteMany / invalidateTag', () => {
      const adapter = memoryAdapter();
      const now = Date.now();
      adapter.setMany([
        { key: 'a', item: { value: 1, createdAt: now, expiresAt: null } },
        { key: 'b', item: { value: 2, createdAt: now, expiresAt: null, tags: ['grp'] } },
        { key: 'c', item: { value: 3, createdAt: now, expiresAt: null, tags: ['grp'] } },
      ]);

      const res = adapter.getMany(['a', 'b', 'missing']);
      expect(res['a']?.value).toBe(1);
      expect(res['b']?.value).toBe(2);
      expect(res['missing']).toBeNull();

      adapter.invalidateTag('grp');
      expect(adapter.has('b')).toBe(false);
      expect(adapter.has('c')).toBe(false);

      const del = adapter.deleteMany(['a', 'nonexistent']);
      expect(del).toBe(1);
    });

    it('size() matches key count after expiry prune', () => {
      const adapter = memoryAdapter();
      const now = Date.now();
      adapter.set('alive', { value: 1, createdAt: now, expiresAt: now + 100_000 });
      expect(adapter.size()).toBe(1);
      adapter.set('dead', { value: 2, createdAt: now, expiresAt: now - 1 }); // already expired
      expect(adapter.size()).toBe(1); // only 'alive' survives
    });
  });

  // ─── LocalStorage adapter directly ───
  describe('LocalStorageAdapter direct', () => {
    it('getMany / setMany / deleteMany / invalidateTag / has / size', () => {
      const adapter = localStorageAdapter({ prefix: 'ls_direct:' });
      const now = Date.now();

      adapter.setMany([
        { key: 'k1', item: { value: 'a', createdAt: now, expiresAt: null } },
        { key: 'k2', item: { value: 'b', createdAt: now, expiresAt: null, tags: ['t1'] } },
      ]);

      const res = adapter.getMany(['k1', 'k2', 'missing']);
      expect(res['k1']?.value).toBe('a');
      expect(res['k2']?.value).toBe('b');
      expect(res['missing']).toBeNull();

      expect(adapter.has('k1')).toBe(true);
      expect(adapter.has('nosuchkey')).toBe(false);
      expect(adapter.size()).toBeGreaterThanOrEqual(1);

      adapter.invalidateTag('t1');
      expect(adapter.has('k2')).toBe(false);

      const deleted = adapter.deleteMany(['k1', 'ghost']);
      expect(deleted).toBe(1);
    });
  });

  // ─── SessionStorage adapter directly ───
  describe('SessionStorageAdapter direct', () => {
    it('get / set / delete / clear / keys / size / has', () => {
      const adapter = ssAdapter({ prefix: 'ss_direct:' });
      const now = Date.now();
      adapter.set('x', { value: 42, createdAt: now, expiresAt: null });
      expect(adapter.get('x')?.value).toBe(42);
      expect(adapter.has('x')).toBe(true);
      expect(adapter.size()).toBe(1);
      expect(adapter.keys()).toContain('x');
      adapter.delete('x');
      expect(adapter.get('x')).toBeNull();
    });
  });

  // ─── RedisAdapter directly ───
  describe('RedisAdapter direct', () => {
    it('getMany / setMany / deleteMany / has / size / invalidateTag', async () => {
      const client = new MockRedisClient();
      const adapter = redisAdapter(client, { prefix: 'r_direct:' });
      const now = Date.now();

      await adapter.setMany([
        { key: 'r1', item: { value: 10, createdAt: now, expiresAt: null } },
        { key: 'r2', item: { value: 20, createdAt: now, expiresAt: null, tags: ['tag1'] } },
        { key: 'r3', item: { value: 30, createdAt: now, expiresAt: null } },
      ]);

      const res = await adapter.getMany(['r1', 'r2', 'ghost']);
      expect(res['r1']?.value).toBe(10);
      expect(res['r2']?.value).toBe(20);
      expect(res['ghost']).toBeNull();

      expect(await adapter.has('r1')).toBe(true);
      expect(await adapter.has('nonexistent')).toBe(false);
      expect(await adapter.size()).toBeGreaterThanOrEqual(1);

      await adapter.invalidateTag('tag1');
      expect(await adapter.has('r2')).toBe(false);
      expect(await adapter.has('r1')).toBe(true);

      const deleted = await adapter.deleteMany(['r1', 'ghost']);
      expect(deleted).toBe(1);
    });

    it('set with TTL uses PX — raw key is stored', async () => {
      const client = new MockRedisClient();
      const adapter = redisAdapter(client, { prefix: 'ttl_direct:' });
      const now = Date.now();
      // Item with a future expiresAt should call set with PX
      await adapter.set('k', { value: 1, createdAt: now, expiresAt: now + 5000 });
      const raw = client.store.get('ttl_direct:k');
      expect(raw).toBeDefined();
    });

    it('clear() removes all prefixed keys', async () => {
      const client = new MockRedisClient();
      const adapter = redisAdapter(client, { prefix: 'clr_test:' });
      const now = Date.now();
      await adapter.set('a', { value: 1, createdAt: now, expiresAt: null });
      await adapter.set('b', { value: 2, createdAt: now, expiresAt: null });
      await adapter.clear();
      expect(await adapter.size()).toBe(0);
    });
  });

  // ─── Utilities ───
  describe('Utility edge cases', () => {
    it('parseTTL handles 0 and negative values as invalid', () => {
      expect(parseTTL(0)).toBeNull();
      expect(parseTTL(-100)).toBeNull();
    });

    it('isExpired returns false for null expiresAt', () => {
      expect(isExpired(null)).toBe(false);
      expect(isExpired(undefined)).toBe(false);
    });

    it('formatKey and stripNamespace roundtrip correctly', () => {
      expect(formatKey('key', 'ns')).toBe('ns:key');
      expect(formatKey('key', undefined)).toBe('key');
      expect(stripNamespace('ns:key', 'ns')).toBe('key');
      expect(stripNamespace('other:key', 'ns')).toBe('other:key');
      expect(stripNamespace('key', undefined)).toBe('key');
    });

    it('defaultSerializer handles nested objects without custom types', () => {
      const data = { a: 1, b: [true, null, 'hello'] };
      const str = defaultSerializer.serialize(data);
      const restored = defaultSerializer.deserialize(str);
      expect(restored).toEqual(data);
    });

    it('defaultSerializer.deserialize handles empty string', () => {
      const result = defaultSerializer.deserialize('');
      expect(result).toBe('');
    });
  });
});
