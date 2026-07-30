import { CacheAdapter, CacheItem } from '../types/cache';
import { isExpired } from '../utils/expiration';

export interface MemoryAdapterOptions {
  /**
   * Maximum capacity before evicting least recently used (LRU) entry.
   */
  max?: number;
}

export class MemoryAdapter implements CacheAdapter {
  private store = new Map<string, CacheItem<any>>();
  private tagMap = new Map<string, Set<string>>();
  private max?: number;

  constructor(options: MemoryAdapterOptions = {}) {
    this.max = options.max && options.max > 0 ? options.max : undefined;
  }

  /**
   * Returns the raw item without expiration handling.
   * Expiration is handled at the NanoCache layer so that events fire correctly.
   * We do prune stale items lazily on `keys()` and `size()` to avoid leaks.
   */
  public get<T = any>(key: string): CacheItem<T> | null {
    const item = this.store.get(key);
    if (!item) return null;

    // Move to end for LRU (most recently used)
    this.store.delete(key);
    this.store.set(key, item);

    return item;
  }

  public set<T = any>(key: string, item: CacheItem<T>): void {
    // If key exists, remove first so insertion moves it to the end (MRU)
    if (this.store.has(key)) {
      this.removeFromTags(key);
      this.store.delete(key);
    } else if (this.max && this.store.size >= this.max) {
      // LRU Eviction: Remove oldest (first inserted / least recently used) key
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.removeFromTags(oldestKey);
        this.store.delete(oldestKey);
      }
    }

    this.store.set(key, item);

    // Track tags
    if (item.tags && item.tags.length > 0) {
      for (const tag of item.tags) {
        if (!this.tagMap.has(tag)) {
          this.tagMap.set(tag, new Set());
        }
        this.tagMap.get(tag)!.add(key);
      }
    }
  }

  public delete(key: string): boolean {
    if (this.store.has(key)) {
      this.removeFromTags(key);
      this.store.delete(key);
      return true;
    }
    return false;
  }

  public clear(): void {
    this.store.clear();
    this.tagMap.clear();
  }

  /**
   * Returns only non-expired keys, pruning stale entries lazily.
   */
  public keys(): string[] {
    const now = Date.now();
    const result: string[] = [];

    for (const [key, item] of this.store.entries()) {
      if (isExpired(item.expiresAt, now)) {
        // Lazy prune expired entries
        this.removeFromTags(key);
        this.store.delete(key);
      } else {
        result.push(key);
      }
    }

    return result;
  }

  public has(key: string): boolean {
    const item = this.store.get(key);
    if (!item) return false;
    if (isExpired(item.expiresAt)) {
      this.delete(key);
      return false;
    }
    return true;
  }

  public size(): number {
    return this.keys().length;
  }

  public getMany<T = any>(keys: string[]): Record<string, CacheItem<T> | null> {
    const result: Record<string, CacheItem<T> | null> = {};
    for (const key of keys) {
      result[key] = this.get<T>(key);
    }
    return result;
  }

  public setMany<T = any>(entries: Array<{ key: string; item: CacheItem<T> }>): void {
    for (const { key, item } of entries) {
      this.set(key, item);
    }
  }

  public deleteMany(keys: string[]): number {
    let count = 0;
    for (const key of keys) {
      if (this.delete(key)) {
        count++;
      }
    }
    return count;
  }

  public invalidateTag(tag: string): void {
    const keys = this.tagMap.get(tag);
    if (keys) {
      for (const key of Array.from(keys)) {
        this.store.delete(key);
      }
      this.tagMap.delete(tag);
    }
  }

  private removeFromTags(key: string): void {
    const item = this.store.get(key);
    if (item && item.tags) {
      for (const tag of item.tags) {
        const set = this.tagMap.get(tag);
        if (set) {
          set.delete(key);
          if (set.size === 0) {
            this.tagMap.delete(tag);
          }
        }
      }
    }
  }
}

export function memoryAdapter(options?: MemoryAdapterOptions): MemoryAdapter {
  return new MemoryAdapter(options);
}
