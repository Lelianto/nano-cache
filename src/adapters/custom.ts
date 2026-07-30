import { CacheAdapter, CacheItem } from '../types/cache';
import { isExpired } from '../utils/expiration';

export interface CustomAdapterConfig {
  get: (key: string) => Promise<CacheItem | null> | CacheItem | null;
  set: (key: string, item: CacheItem) => Promise<void> | void;
  delete: (key: string) => Promise<boolean> | boolean;
  clear: () => Promise<void> | void;
  keys?: () => Promise<string[]> | string[];
  has?: (key: string) => Promise<boolean> | boolean;
  size?: () => Promise<number> | number;
  getMany?: (keys: string[]) => Promise<Record<string, CacheItem | null>> | Record<string, CacheItem | null>;
  setMany?: (entries: Array<{ key: string; item: CacheItem }>) => Promise<void> | void;
  deleteMany?: (keys: string[]) => Promise<number> | number;
  invalidateTag?: (tag: string) => Promise<void> | void;
}

export class CustomAdapter implements CacheAdapter {
  private config: CustomAdapterConfig;

  constructor(config: CustomAdapterConfig) {
    this.config = config;
  }

  public async get<T = any>(key: string): Promise<CacheItem<T> | null> {
    try {
      const item = await this.config.get(key);
      if (!item) return null;
      if (isExpired(item.expiresAt)) {
        await this.delete(key);
        return null;
      }
      return item as CacheItem<T>;
    } catch {
      return null;
    }
  }

  public async set<T = any>(key: string, item: CacheItem<T>): Promise<void> {
    try {
      await this.config.set(key, item);
    } catch {
      // Safe error handling
    }
  }

  public async delete(key: string): Promise<boolean> {
    try {
      return await this.config.delete(key);
    } catch {
      return false;
    }
  }

  public async clear(): Promise<void> {
    try {
      await this.config.clear();
    } catch {
      // Safe error handling
    }
  }

  public async keys(): Promise<string[]> {
    try {
      if (this.config.keys) {
        return await this.config.keys();
      }
      return [];
    } catch {
      return [];
    }
  }

  public async has(key: string): Promise<boolean> {
    try {
      if (this.config.has) {
        return await this.config.has(key);
      }
      const item = await this.get(key);
      return item !== null;
    } catch {
      return false;
    }
  }

  public async size(): Promise<number> {
    try {
      if (this.config.size) {
        return await this.config.size();
      }
      const k = await this.keys();
      return k.length;
    } catch {
      return 0;
    }
  }

  public async getMany<T = any>(keys: string[]): Promise<Record<string, CacheItem<T> | null>> {
    if (this.config.getMany) {
      return (await this.config.getMany(keys)) as Record<string, CacheItem<T> | null>;
    }
    const result: Record<string, CacheItem<T> | null> = {};
    for (const key of keys) {
      result[key] = await this.get<T>(key);
    }
    return result;
  }

  public async setMany<T = any>(entries: Array<{ key: string; item: CacheItem<T> }>): Promise<void> {
    if (this.config.setMany) {
      await this.config.setMany(entries);
      return;
    }
    for (const { key, item } of entries) {
      await this.set(key, item);
    }
  }

  public async deleteMany(keys: string[]): Promise<number> {
    if (this.config.deleteMany) {
      return await this.config.deleteMany(keys);
    }
    let count = 0;
    for (const key of keys) {
      if (await this.delete(key)) {
        count++;
      }
    }
    return count;
  }

  public async invalidateTag(tag: string): Promise<void> {
    if (this.config.invalidateTag) {
      await this.config.invalidateTag(tag);
      return;
    }
    const allKeys = await this.keys();
    for (const key of allKeys) {
      const item = await this.get(key);
      if (item && item.tags && item.tags.includes(tag)) {
        await this.delete(key);
      }
    }
  }
}

export function createAdapter(config: CustomAdapterConfig): CustomAdapter {
  return new CustomAdapter(config);
}
