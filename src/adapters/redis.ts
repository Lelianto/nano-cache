import { CacheAdapter, CacheItem, CacheSerializer } from '../types/cache';
import { isExpired } from '../utils/expiration';
import { defaultSerializer } from '../utils/serializer';

export interface RedisLikeClient {
  get(key: string): Promise<string | null | undefined>;
  set(key: string, value: string, ...args: any[]): Promise<any>;
  del(...keys: string[]): Promise<number | any>;
  keys(pattern: string): Promise<string[]>;
  flushdb?(): Promise<any>;
  flushDb?(): Promise<any>;
}

export interface RedisAdapterOptions {
  /**
   * Key prefix. Defaults to 'nano:'.
   */
  prefix?: string;

  /**
   * Custom serializer. Defaults to built-in structured serializer.
   */
  serializer?: CacheSerializer;
}

export class RedisAdapter implements CacheAdapter {
  private client: RedisLikeClient;
  private prefix: string;
  private serializer: CacheSerializer;

  constructor(client: RedisLikeClient, options: RedisAdapterOptions = {}) {
    this.client = client;
    this.prefix = options.prefix ?? 'nano:';
    this.serializer = options.serializer ?? defaultSerializer;
  }

  private getPrefixedKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  private getRawKey(prefixedKey: string): string {
    return prefixedKey.startsWith(this.prefix) ? prefixedKey.slice(this.prefix.length) : prefixedKey;
  }

  public async get<T = any>(key: string): Promise<CacheItem<T> | null> {
    try {
      const raw = await this.client.get(this.getPrefixedKey(key));
      if (!raw) return null;

      const item = this.serializer.deserialize<CacheItem<T>>(raw);
      if (!item) return null;

      if (isExpired(item.expiresAt)) {
        await this.delete(key);
        return null;
      }

      return item;
    } catch {
      return null;
    }
  }

  public async set<T = any>(key: string, item: CacheItem<T>): Promise<void> {
    try {
      const prefixedKey = this.getPrefixedKey(key);
      const raw = this.serializer.serialize(item);

      if (item.expiresAt != null) {
        const ttlMs = Math.max(1, item.expiresAt - Date.now());
        // ioredis / node-redis set with 'PX' (milliseconds)
        await this.client.set(prefixedKey, raw, 'PX', ttlMs);
      } else {
        await this.client.set(prefixedKey, raw);
      }
    } catch {
      // Handle Redis failure safely
    }
  }

  public async delete(key: string): Promise<boolean> {
    try {
      const res = await this.client.del(this.getPrefixedKey(key));
      return Boolean(res);
    } catch {
      return false;
    }
  }

  public async clear(): Promise<void> {
    try {
      const rawKeys = await this.client.keys(`${this.prefix}*`);
      if (rawKeys && rawKeys.length > 0) {
        await this.client.del(...rawKeys);
      }
    } catch {
      // Safe fallback
    }
  }

  public async keys(): Promise<string[]> {
    try {
      const rawKeys = (await this.client.keys(`${this.prefix}*`)) || [];
      const result: string[] = [];
      const now = Date.now();

      for (const k of rawKeys) {
        const rawKey = this.getRawKey(k);
        const item = await this.get(rawKey);
        if (item && !isExpired(item.expiresAt, now)) {
          result.push(rawKey);
        }
      }

      return result;
    } catch {
      return [];
    }
  }

  public async has(key: string): Promise<boolean> {
    const item = await this.get(key);
    return item !== null;
  }

  public async size(): Promise<number> {
    const allKeys = await this.keys();
    return allKeys.length;
  }

  public async getMany<T = any>(keys: string[]): Promise<Record<string, CacheItem<T> | null>> {
    const result: Record<string, CacheItem<T> | null> = {};
    for (const key of keys) {
      result[key] = await this.get<T>(key);
    }
    return result;
  }

  public async setMany<T = any>(entries: Array<{ key: string; item: CacheItem<T> }>): Promise<void> {
    for (const { key, item } of entries) {
      await this.set(key, item);
    }
  }

  public async deleteMany(keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (await this.delete(key)) {
        count++;
      }
    }
    return count;
  }

  public async invalidateTag(tag: string): Promise<void> {
    const allKeys = await this.keys();
    for (const key of allKeys) {
      const item = await this.get(key);
      if (item && item.tags && item.tags.includes(tag)) {
        await this.delete(key);
      }
    }
  }
}

export function redisAdapter(client: RedisLikeClient, options?: RedisAdapterOptions): RedisAdapter {
  return new RedisAdapter(client, options);
}
