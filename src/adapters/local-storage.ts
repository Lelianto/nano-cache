import { CacheAdapter, CacheItem, CacheSerializer } from '../types/cache';
import { isExpired } from '../utils/expiration';
import { defaultSerializer } from '../utils/serializer';

export interface WebStorageAdapterOptions {
  /**
   * Storage key prefix. Defaults to 'nano:'.
   */
  prefix?: string;

  /**
   * Custom serializer. Defaults to built-in structured serializer.
   */
  serializer?: CacheSerializer;

  /**
   * Reference to Storage object. Defaults to window.localStorage or window.sessionStorage.
   */
  storage?: Storage;
}

export class WebStorageAdapter implements CacheAdapter {
  private storage: Storage | null;
  private prefix: string;
  private serializer: CacheSerializer;

  constructor(options: WebStorageAdapterOptions = {}, defaultStorageType: 'localStorage' | 'sessionStorage' = 'localStorage') {
    this.prefix = options.prefix ?? 'nano:';
    this.serializer = options.serializer ?? defaultSerializer;

    if (options.storage) {
      this.storage = options.storage;
    } else {
      this.storage = this.resolveStorage(defaultStorageType);
    }
  }

  private resolveStorage(type: 'localStorage' | 'sessionStorage'): Storage | null {
    try {
      if (typeof window !== 'undefined' && window[type]) {
        // Test access to guard against disabled cookies / SecurityError
        const testKey = `__nano_test_${Math.random()}`;
        window[type].setItem(testKey, '1');
        window[type].removeItem(testKey);
        return window[type];
      }
    } catch {
      // Storage unavailable or permission denied
    }
    return null;
  }

  private getPrefixedKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  private getRawKey(prefixedKey: string): string {
    return prefixedKey.slice(this.prefix.length);
  }

  public get<T = any>(key: string): CacheItem<T> | null {
    if (!this.storage) return null;

    try {
      const raw = this.storage.getItem(this.getPrefixedKey(key));
      if (!raw) return null;

      const item = this.serializer.deserialize<CacheItem<T>>(raw);
      if (!item) return null;

      if (isExpired(item.expiresAt)) {
        this.delete(key);
        return null;
      }

      return item;
    } catch {
      return null;
    }
  }

  public set<T = any>(key: string, item: CacheItem<T>): void {
    if (!this.storage) return;

    try {
      const raw = this.serializer.serialize(item);
      this.storage.setItem(this.getPrefixedKey(key), raw);
    } catch {
      // Handle QuotaExceededError gracefully
    }
  }

  public delete(key: string): boolean {
    if (!this.storage) return false;

    const prefixedKey = this.getPrefixedKey(key);
    if (this.storage.getItem(prefixedKey) !== null) {
      this.storage.removeItem(prefixedKey);
      return true;
    }
    return false;
  }

  public clear(): void {
    if (!this.storage) return;

    const keysToRemove: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const k = this.storage.key(i);
      if (k && k.startsWith(this.prefix)) {
        keysToRemove.push(k);
      }
    }

    for (const k of keysToRemove) {
      this.storage.removeItem(k);
    }
  }

  public keys(): string[] {
    if (!this.storage) return [];

    const result: string[] = [];
    const now = Date.now();

    for (let i = 0; i < this.storage.length; i++) {
      const k = this.storage.key(i);
      if (k && k.startsWith(this.prefix)) {
        const rawKey = this.getRawKey(k);
        const item = this.get(rawKey);
        if (item && !isExpired(item.expiresAt, now)) {
          result.push(rawKey);
        }
      }
    }

    return result;
  }

  public has(key: string): boolean {
    return this.get(key) !== null;
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
    if (!this.storage) return;

    const allKeys = this.keys();
    for (const key of allKeys) {
      const item = this.get(key);
      if (item && item.tags && item.tags.includes(tag)) {
        this.delete(key);
      }
    }
  }
}

export function localStorageAdapter(options?: WebStorageAdapterOptions): WebStorageAdapter {
  return new WebStorageAdapter(options, 'localStorage');
}
