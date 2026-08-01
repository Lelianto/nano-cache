import { CacheAdapter, CacheItem, CacheSerializer } from '../types/cache';
import { isExpired } from '../utils/expiration';
import { defaultSerializer } from '../utils/serializer';

export interface RedisLikeClient {
  get(key: string): Promise<string | null | undefined>;
  set(key: string, value: string, ...args: any[]): Promise<any>;
  del(...keys: string[]): Promise<number | any>;
  keys?(pattern: string): Promise<string[]>;
  scan?(cursor: string | number, ...args: any[]): Promise<any>;
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

  /**
   * Approximate number of keys requested per SCAN iteration. Defaults to 100.
   */
  scanCount?: number;
}

export class RedisAdapter implements CacheAdapter {
  private client: RedisLikeClient;
  private prefix: string;
  private serializer: CacheSerializer;
  private scanCount: number;

  constructor(client: RedisLikeClient, options: RedisAdapterOptions = {}) {
    this.client = client;
    this.prefix = options.prefix ?? 'nano:';
    this.serializer = options.serializer ?? defaultSerializer;
    this.scanCount =
      options.scanCount && options.scanCount > 0 ? Math.floor(options.scanCount) : 100;
  }

  private getPrefixedKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  private getRawKey(prefixedKey: string): string {
    return prefixedKey.startsWith(this.prefix)
      ? prefixedKey.slice(this.prefix.length)
      : prefixedKey;
  }

  private async scanKeys(): Promise<string[]> {
    const pattern = `${this.prefix}*`;

    if (!this.client.scan) {
      return this.client.keys ? this.client.keys(pattern) : [];
    }

    const keys: string[] = [];
    let cursor = '0';

    do {
      let response: any;
      try {
        response = await this.client.scan(cursor, { MATCH: pattern, COUNT: this.scanCount });
      } catch {
        response = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', this.scanCount);
      }

      if (Array.isArray(response)) {
        cursor = String(response[0]);
        keys.push(...(response[1] || []));
      } else {
        cursor = String(response.cursor);
        keys.push(...(response.keys || []));
      }
    } while (cursor !== '0');

    return keys;
  }

  public async get<T = any>(key: string): Promise<CacheItem<T> | null> {
    const raw = await this.client.get(this.getPrefixedKey(key));
    if (!raw) return null;

    const item = this.serializer.deserialize<CacheItem<T>>(raw);
    if (!item) return null;

    if (isExpired(item.expiresAt)) {
      await this.delete(key);
      return null;
    }

    return item;
  }

  public async set<T = any>(key: string, item: CacheItem<T>): Promise<void> {
    const prefixedKey = this.getPrefixedKey(key);
    const raw = this.serializer.serialize(item);

    if (item.expiresAt != null) {
      const ttlMs = Math.max(1, item.expiresAt - Date.now());
      // ioredis / node-redis set with 'PX' (milliseconds)
      await this.client.set(prefixedKey, raw, 'PX', ttlMs);
    } else {
      await this.client.set(prefixedKey, raw);
    }
  }

  public async delete(key: string): Promise<boolean> {
    const res = await this.client.del(this.getPrefixedKey(key));
    return Boolean(res);
  }

  public async clear(): Promise<void> {
    const rawKeys = await this.scanKeys();
    for (let i = 0; i < rawKeys.length; i += this.scanCount) {
      await this.client.del(...rawKeys.slice(i, i + this.scanCount));
    }
  }

  public async keys(): Promise<string[]> {
    const rawKeys = (await this.scanKeys()) || [];
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

  public async setMany<T = any>(
    entries: Array<{ key: string; item: CacheItem<T> }>,
  ): Promise<void> {
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
