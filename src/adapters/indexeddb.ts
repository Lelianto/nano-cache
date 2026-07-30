import { CacheAdapter, CacheItem } from '../types/cache';
import { isExpired } from '../utils/expiration';
import { MemoryAdapter } from './memory';

export interface IndexedDBAdapterOptions {
  /**
   * IndexedDB database name. Defaults to 'nano-cache-db'.
   */
  dbName?: string;

  /**
   * IndexedDB store name. Defaults to 'nano-store'.
   */
  storeName?: string;

  /**
   * Custom version. Defaults to 1.
   */
  version?: number;
}

export class IndexedDBAdapter implements CacheAdapter {
  private dbName: string;
  private storeName: string;
  private version: number;
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private fallbackMemory: MemoryAdapter | null = null;

  constructor(options: IndexedDBAdapterOptions = {}) {
    this.dbName = options.dbName || 'nano-cache-db';
    this.storeName = options.storeName || 'nano-store';
    this.version = options.version || 1;

    if (!this.isIDBAvailable()) {
      this.fallbackMemory = new MemoryAdapter();
    }
  }

  private isIDBAvailable(): boolean {
    try {
      return typeof window !== 'undefined' && typeof indexedDB !== 'undefined' && indexedDB !== null;
    } catch {
      return false;
    }
  }

  private async getDB(): Promise<IDBDatabase | null> {
    if (this.fallbackMemory) {
      return null;
    }

    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve) => {
      try {
        const request = indexedDB.open(this.dbName, this.version);

        request.onupgradeneeded = (event: any) => {
          const db = event.target.result as IDBDatabase;
          if (!db.objectStoreNames.contains(this.storeName)) {
            db.createObjectStore(this.storeName);
          }
        };

        request.onsuccess = (event: any) => {
          resolve(event.target.result as IDBDatabase);
        };

        request.onerror = () => {
          // Graceful fallback to in-memory on error
          this.fallbackMemory = new MemoryAdapter();
          resolve(null);
        };
      } catch {
        this.fallbackMemory = new MemoryAdapter();
        resolve(null);
      }
    });

    return this.dbPromise;
  }

  public async get<T = any>(key: string): Promise<CacheItem<T> | null> {
    const fallback = this.fallbackMemory;
    if (fallback) {
      return fallback.get<T>(key);
    }

    const db = await this.getDB();
    const fb = this.fallbackMemory;
    if (!db) {
      return fb ? fb.get<T>(key) : null;
    }

    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(this.storeName, 'readonly');
        const store = transaction.objectStore(this.storeName);
        const request = store.get(key);

        request.onsuccess = () => {
          const item = request.result as CacheItem<T> | undefined;
          if (!item) {
            resolve(null);
            return;
          }

          if (isExpired(item.expiresAt)) {
            this.delete(key);
            resolve(null);
            return;
          }

          resolve(item);
        };

        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  public async set<T = any>(key: string, item: CacheItem<T>): Promise<void> {
    const fallback = this.fallbackMemory;
    if (fallback) {
      return fallback.set(key, item);
    }

    const db = await this.getDB();
    const fb = this.fallbackMemory;
    if (!db) {
      return fb?.set(key, item);
    }

    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(this.storeName, 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const request = store.put(item, key);

        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  public async delete(key: string): Promise<boolean> {
    const fallback = this.fallbackMemory;
    if (fallback) {
      return fallback.delete(key);
    }

    const db = await this.getDB();
    const fb = this.fallbackMemory;
    if (!db) {
      return fb ? fb.delete(key) : false;
    }

    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(this.storeName, 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const request = store.delete(key);

        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  public async clear(): Promise<void> {
    const fallback = this.fallbackMemory;
    if (fallback) {
      return fallback.clear();
    }

    const db = await this.getDB();
    const fb = this.fallbackMemory;
    if (!db) {
      return fb?.clear();
    }

    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(this.storeName, 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  public async keys(): Promise<string[]> {
    const fallback = this.fallbackMemory;
    if (fallback) {
      return fallback.keys();
    }

    const db = await this.getDB();
    const fb = this.fallbackMemory;
    if (!db) {
      return fb ? fb.keys() : [];
    }

    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(this.storeName, 'readonly');
        const store = transaction.objectStore(this.storeName);

        if (store.getAllKeys) {
          const request = store.getAllKeys();
          request.onsuccess = () => {
            const rawKeys = (request.result || []) as string[];
            resolve(rawKeys);
          };
          request.onerror = () => resolve([]);
        } else {
          const result: string[] = [];
          const request = store.openCursor();
          request.onsuccess = (e: any) => {
            const cursor = e.target.result as IDBCursorWithValue;
            if (cursor) {
              result.push(cursor.key as string);
              cursor.continue();
            } else {
              resolve(result);
            }
          };
          request.onerror = () => resolve([]);
        }
      } catch {
        resolve([]);
      }
    });
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
    const keys = await this.keys();
    for (const key of keys) {
      const item = await this.get(key);
      if (item && item.tags && item.tags.includes(tag)) {
        await this.delete(key);
      }
    }
  }
}

export function indexedDBAdapter(options?: IndexedDBAdapterOptions): IndexedDBAdapter {
  return new IndexedDBAdapter(options);
}
