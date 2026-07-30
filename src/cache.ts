import { memoryAdapter } from './adapters/memory';
import {
  CacheAdapter,
  CacheEventMap,
  CacheItem,
  CacheOptions,
  CacheStats,
  EventKey,
  FetchOptions,
  SetOptions,
  TTL,
} from './types/cache';
import { isExpired, parseTTL } from './utils/expiration';
import { NanoEventEmitter } from './utils/event-emitter';
import { formatKey, stripNamespace } from './utils/hash';

export class NanoCache {
  private adapter: CacheAdapter;
  private defaultTTL?: TTL;
  private namespace?: string;
  private emitter = new NanoEventEmitter();
  private inFlight = new Map<string, Promise<any>>();

  private statsCounters = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    expired: 0,
  };

  constructor(options: CacheOptions = {}) {
    this.defaultTTL = options.ttl;
    this.namespace = options.namespace;
    this.adapter = options.adapter || memoryAdapter({ max: options.max });
  }

  private toRawKey(key: string): string {
    return formatKey(key, this.namespace);
  }

  private toUserKey(rawKey: string): string {
    return stripNamespace(rawKey, this.namespace);
  }

  /**
   * Set a key-value pair in the cache with optional TTL and tags.
   */
  public async set<T = any>(key: string, value: T, options?: SetOptions): Promise<void> {
    try {
      const rawKey = this.toRawKey(key);
      const ttl = options?.ttl ?? this.defaultTTL;
      const ttlMs = parseTTL(ttl);
      const now = Date.now();
      const expiresAt = ttlMs !== null ? now + ttlMs : null;

      const item: CacheItem<T> = {
        value,
        createdAt: now,
        expiresAt,
        tags: options?.tags,
      };

      await this.adapter.set(rawKey, item);
      this.statsCounters.sets++;
      this.emitter.emit('set', key, value, options);
    } catch {
      // Safe error handling to prevent application crashes
    }
  }

  /**
   * Get a cached value by key. Returns null if missing or expired.
   */
  public async get<T = any>(key: string): Promise<T | null> {
    try {
      const rawKey = this.toRawKey(key);
      const item = await this.adapter.get<T>(rawKey);

      if (!item) {
        this.statsCounters.misses++;
        return null;
      }

      if (isExpired(item.expiresAt)) {
        await this.adapter.delete(rawKey);
        this.statsCounters.expired++;
        this.statsCounters.misses++;
        this.emitter.emit('expired', key, item.value);
        return null;
      }

      this.statsCounters.hits++;
      this.emitter.emit('get', key, item.value);
      return item.value;
    } catch {
      this.statsCounters.misses++;
      return null;
    }
  }

  /**
   * Check if a key exists in cache and is not expired.
   */
  public async has(key: string): Promise<boolean> {
    try {
      const val = await this.get(key);
      return val !== null;
    } catch {
      return false;
    }
  }

  /**
   * Delete a key from cache.
   */
  public async delete(key: string): Promise<boolean> {
    try {
      const rawKey = this.toRawKey(key);
      const deleted = await this.adapter.delete(rawKey);
      if (deleted) {
        this.statsCounters.deletes++;
        this.emitter.emit('delete', key);
      }
      return deleted;
    } catch {
      return false;
    }
  }

  /**
   * Clear all cache entries.
   */
  public async clear(): Promise<void> {
    try {
      await this.adapter.clear();
      this.emitter.emit('clear');
    } catch {
      // Safe error handling
    }
  }

  /**
   * Retrieve all active non-expired user keys.
   */
  public async keys(): Promise<string[]> {
    try {
      const rawKeys = await this.adapter.keys();
      const userKeys: string[] = [];

      for (const k of rawKeys) {
        if (!this.namespace || k.startsWith(`${this.namespace}:`)) {
          userKeys.push(this.toUserKey(k));
        }
      }

      return userKeys;
    } catch {
      return [];
    }
  }

  /**
   * Return total count of active keys in cache.
   */
  public async size(): Promise<number> {
    try {
      const k = await this.keys();
      return k.length;
    } catch {
      return 0;
    }
  }

  /**
   * Invalidate all cached items matching a tag.
   */
  public async invalidateTag(tag: string): Promise<void> {
    try {
      if (this.adapter.invalidateTag) {
        await this.adapter.invalidateTag(tag);
      } else {
        const userKeys = await this.keys();
        for (const key of userKeys) {
          const rawKey = this.toRawKey(key);
          const item = await this.adapter.get(rawKey);
          if (item && item.tags && item.tags.includes(tag)) {
            await this.delete(key);
          }
        }
      }
    } catch {
      // Safe error handling
    }
  }

  /**
   * Batch get operation.
   */
  public async getMany<T = any>(keys: string[]): Promise<Record<string, T | null>> {
    const result: Record<string, T | null> = {};
    for (const key of keys) {
      result[key] = await this.get<T>(key);
    }
    return result;
  }

  /**
   * Batch set operation.
   */
  public async setMany<T = any>(
    entries: Array<{ key: string; value: T; options?: SetOptions }>,
  ): Promise<void> {
    for (const { key, value, options } of entries) {
      await this.set(key, value, options);
    }
  }

  /**
   * Batch delete operation.
   */
  public async deleteMany(keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (await this.delete(key)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Fetch helper with concurrent request deduplication (stampede protection).
   */
  public async fetch<T = any>(
    key: string,
    callback: () => Promise<T> | T,
    options?: FetchOptions,
  ): Promise<T> {
    if (!options?.force) {
      const cached = await this.get<T>(key);
      if (cached !== null) {
        return cached;
      }
    }

    const rawKey = this.toRawKey(key);
    if (this.inFlight.has(rawKey)) {
      return this.inFlight.get(rawKey)! as Promise<T>;
    }

    const promise = (async () => {
      try {
        const data = await callback();
        await this.set(key, data, options);
        return data;
      } finally {
        this.inFlight.delete(rawKey);
      }
    })();

    this.inFlight.set(rawKey, promise);
    return promise;
  }

  /**
   * Subscribe to cache event ('get', 'set', 'delete', 'clear', 'expired').
   */
  public on<K extends EventKey>(event: K, listener: CacheEventMap[K]): () => void {
    return this.emitter.on(event, listener);
  }

  /**
   * Unsubscribe from cache event.
   */
  public off<K extends EventKey>(event: K, listener: CacheEventMap[K]): void {
    this.emitter.off(event, listener);
  }

  /**
   * Get real-time cache operation statistics summary.
   */
  public async stats(): Promise<CacheStats> {
    let memoryUsage = 0;
    if (typeof process !== 'undefined' && process.memoryUsage) {
      memoryUsage = process.memoryUsage().heapUsed;
    }

    const activeEntries = await this.size();

    return {
      hits: this.statsCounters.hits,
      misses: this.statsCounters.misses,
      sets: this.statsCounters.sets,
      deletes: this.statsCounters.deletes,
      expired: this.statsCounters.expired,
      memoryUsage,
      entries: activeEntries,
    };
  }
}

/**
 * Factory function to create a NanoCache instance.
 */
export function createCache(options?: CacheOptions): NanoCache {
  return new NanoCache(options);
}
