import { describe, expect, it, vi } from 'vitest';
import {
  CacheAdapter,
  CacheErrorContext,
  CacheItem,
  RedisLikeClient,
  createCache,
  parseTTL,
  redisAdapter,
} from '../src';

class ThrowingAdapter implements CacheAdapter {
  constructor(private error: Error) {}

  get<T = any>(): CacheItem<T> | null {
    throw this.error;
  }

  set(): void {
    throw this.error;
  }

  delete(): boolean {
    throw this.error;
  }

  clear(): void {
    throw this.error;
  }

  keys(): string[] {
    throw this.error;
  }
}

class ScanningRedisClient implements RedisLikeClient {
  public store = new Map<string, string>();
  public keys = vi.fn(async () => [] as string[]);
  public scan = vi.fn(async (cursor: string | number) => {
    const allKeys = Array.from(this.store.keys()).filter((key) => key.startsWith('scan:'));
    const offset = Number(cursor);
    const nextOffset = offset + 1;
    return [
      nextOffset < allKeys.length ? String(nextOffset) : '0',
      allKeys.slice(offset, nextOffset),
    ];
  });

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<string> {
    this.store.set(key, value);
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (this.store.delete(key)) deleted++;
    }
    return deleted;
  }
}

describe('cache resilience', () => {
  it('reports adapter failures while preserving non-throwing fallbacks', async () => {
    const failure = new Error('backend unavailable');
    const errors: Array<{ error: unknown; context: CacheErrorContext }> = [];
    const cache = createCache({
      adapter: new ThrowingAdapter(failure),
      onError: (error, context) => errors.push({ error, context }),
    });

    await expect(cache.set('key', 'value')).resolves.toBeUndefined();
    await expect(cache.get('key')).resolves.toBeNull();
    await expect(cache.delete('key')).resolves.toBe(false);
    await expect(cache.clear()).resolves.toBeUndefined();
    await expect(cache.keys()).resolves.toEqual([]);

    expect(errors.map(({ context }) => context)).toEqual([
      { operation: 'set', key: 'key' },
      { operation: 'get', key: 'key' },
      { operation: 'delete', key: 'key' },
      { operation: 'clear', key: undefined },
      { operation: 'keys', key: undefined },
    ]);
    expect(errors.every(({ error }) => error === failure)).toBe(true);
  });

  it('ignores errors thrown by the error observer', async () => {
    const cache = createCache({
      adapter: new ThrowingAdapter(new Error('adapter failed')),
      onError: () => {
        throw new Error('observer failed');
      },
    });

    await expect(cache.get('key')).resolves.toBeNull();
  });

  it('preserves a stored undefined value', async () => {
    const cache = createCache();
    await cache.set('undefined', undefined);

    expect(await cache.has('undefined')).toBe(true);
    expect(await cache.get('undefined')).toBeUndefined();
  });

  it('reports cyclic serialization failures from the Redis adapter', async () => {
    const client = new ScanningRedisClient();
    const onError = vi.fn();
    const cache = createCache({ adapter: redisAdapter(client), onError });
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    await expect(cache.set('cyclic', cyclic)).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith(expect.any(TypeError), {
      operation: 'set',
      key: 'cyclic',
    });
    expect(client.store.size).toBe(0);
  });

  it('rejects TTL values that overflow the safe integer range', async () => {
    expect(parseTTL('999999999999999999999d' as any)).toBeNull();

    const cache = createCache({ ttl: Number.MAX_SAFE_INTEGER });
    await cache.set('overflow', 'value');
    expect(await cache.get('overflow')).toBe('value');
  });

  it('uses Redis SCAN across multiple pages and never calls KEYS', async () => {
    const client = new ScanningRedisClient();
    const adapter = redisAdapter(client, { prefix: 'scan:', scanCount: 1 });
    const now = Date.now();

    await adapter.set('a', { value: 1, createdAt: now, expiresAt: null });
    await adapter.set('b', { value: 2, createdAt: now, expiresAt: null });

    expect(await adapter.keys()).toEqual(['a', 'b']);
    expect(client.scan).toHaveBeenCalledTimes(2);
    expect(client.keys).not.toHaveBeenCalled();

    await adapter.clear();
    expect(client.store.size).toBe(0);
  });
});
