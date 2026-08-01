/**
 * Time-to-live representation: either milliseconds (e.g., 3000) or duration string (e.g., "10s", "5m", "1h", "1d").
 */
export type TTL =
  number | `${number}ms` | `${number}s` | `${number}m` | `${number}h` | `${number}d`;

/**
 * Metadata wrapped with each cached entry.
 */
export interface CacheItem<T = any> {
  value: T;
  createdAt: number;
  expiresAt: number | null;
  tags?: string[];
}

/**
 * Options passed to set operations.
 */
export interface SetOptions {
  /**
   * Time-to-live for this specific entry. Overrides default cache TTL.
   */
  ttl?: TTL;

  /**
   * Tags associated with this entry for bulk invalidation.
   */
  tags?: string[];
}

/**
 * Options passed to fetch operations.
 */
export interface FetchOptions extends SetOptions {
  /**
   * Force refresh cache even if key is present.
   */
  force?: boolean;
}

/**
 * Options used to initialize a NanoCache instance.
 */
export interface CacheOptions {
  /**
   * Storage backend adapter. Defaults to memoryAdapter().
   */
  adapter?: CacheAdapter;

  /**
   * Default time-to-live for cached items.
   */
  ttl?: TTL;

  /**
   * Namespace prefix for all cache keys (e.g. "auth" -> "auth:key").
   */
  namespace?: string;

  /**
   * Maximum capacity for LRU eviction (supported by memory adapter or adapters handling capacity).
   */
  max?: number;

  /**
   * Observe cache failures without changing the silent-failure behavior.
   */
  onError?: CacheErrorHandler;
}

export type CacheOperation = 'set' | 'get' | 'delete' | 'clear' | 'keys' | 'invalidateTag';

export interface CacheErrorContext {
  operation: CacheOperation;
  key?: string;
}

export type CacheErrorHandler = (error: unknown, context: CacheErrorContext) => void;

/**
 * Real-time statistics summary of cache operations.
 */
export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  expired: number;
  memoryUsage: number;
  entries: number;
}

/**
 * Events emitted by NanoCache.
 */
export type CacheEventMap = {
  get: (key: string, value: any) => void;
  set: (key: string, value: any, options?: SetOptions) => void;
  delete: (key: string) => void;
  clear: () => void;
  expired: (key: string, value: any) => void;
};

export type EventKey = keyof CacheEventMap;

/**
 * Storage adapter interface for custom or built-in backends.
 */
export interface CacheAdapter {
  /**
   * Retrieve item by raw key.
   */
  get<T = any>(key: string): Promise<CacheItem<T> | null> | CacheItem<T> | null;

  /**
   * Store item with raw key.
   */
  set<T = any>(key: string, item: CacheItem<T>): Promise<void> | void;

  /**
   * Delete item by raw key. Returns true if deleted, false if not found.
   */
  delete(key: string): Promise<boolean> | boolean;

  /**
   * Clear all items in storage.
   */
  clear(): Promise<void> | void;

  /**
   * Retrieve all keys in storage.
   */
  keys(): Promise<string[]> | string[];

  /**
   * Optional optimization for checking existence without retrieving full item.
   */
  has?(key: string): Promise<boolean> | boolean;

  /**
   * Optional optimization for counting keys.
   */
  size?(): Promise<number> | number;

  /**
   * Batch get operation.
   */
  getMany?<T = any>(
    keys: string[],
  ): Promise<Record<string, CacheItem<T> | null>> | Record<string, CacheItem<T> | null>;

  /**
   * Batch set operation.
   */
  setMany?<T = any>(entries: Array<{ key: string; item: CacheItem<T> }>): Promise<void> | void;

  /**
   * Batch delete operation. Returns number of keys deleted.
   */
  deleteMany?(keys: string[]): Promise<number> | number;

  /**
   * Invalidate all keys matching tag.
   */
  invalidateTag?(tag: string): Promise<void> | void;
}

/**
 * Serializer contract for non-string adapters like localStorage/sessionStorage.
 */
export interface CacheSerializer {
  serialize(value: any): string;
  deserialize<T = any>(text: string): T;
}
