import { describe, expect, it } from 'vitest';
import { createCache, redisAdapter, RedisLikeClient } from '../src';

class MockRedisClient implements RedisLikeClient {
  public store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) || null;
  }

  async set(key: string, value: string): Promise<any> {
    this.store.set(key, value);
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const k of keys) {
      if (this.store.delete(k)) count++;
    }
    return count;
  }

  async keys(pattern: string): Promise<string[]> {
    const prefix = pattern.replace('*', '');
    return Array.from(this.store.keys()).filter((k) => k.startsWith(prefix));
  }
}

describe('Redis Adapter', () => {
  it('should interact properly with Redis-like client interface', async () => {
    const mockClient = new MockRedisClient();
    const cache = createCache({
      adapter: redisAdapter(mockClient, { prefix: 'redis_test:' }),
    });

    await cache.set('profile', { username: 'john_doe' });
    expect(await cache.get('profile')).toEqual({ username: 'john_doe' });

    expect(await cache.keys()).toEqual(['profile']);
    expect(await cache.size()).toBe(1);

    await cache.delete('profile');
    expect(await cache.get('profile')).toBeNull();
  });
});
