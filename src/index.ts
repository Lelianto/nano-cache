// Core Cache Engine & Factory
export { NanoCache, createCache } from './cache';

// Built-in Adapters
export { MemoryAdapter, memoryAdapter } from './adapters/memory';
export { WebStorageAdapter, localStorageAdapter } from './adapters/local-storage';
export { sessionStorageAdapter } from './adapters/session-storage';
export { IndexedDBAdapter, indexedDBAdapter } from './adapters/indexeddb';
export { RedisAdapter, redisAdapter } from './adapters/redis';
export { CustomAdapter, createAdapter } from './adapters/custom';

// Utilities
export { parseTTL, isExpired } from './utils/expiration';
export { DefaultSerializer, defaultSerializer } from './utils/serializer';
export { NanoEventEmitter } from './utils/event-emitter';
export { formatKey, stripNamespace } from './utils/hash';

// Types
export type {
  TTL,
  CacheItem,
  SetOptions,
  FetchOptions,
  CacheOptions,
  CacheStats,
  CacheEventMap,
  EventKey,
  CacheAdapter,
  CacheSerializer,
} from './types/cache';

export type { CustomAdapterConfig } from './adapters/custom';
export type { MemoryAdapterOptions } from './adapters/memory';
export type { WebStorageAdapterOptions } from './adapters/local-storage';
export type { IndexedDBAdapterOptions } from './adapters/indexeddb';
export type { RedisAdapterOptions, RedisLikeClient } from './adapters/redis';
export type { TypeTransformer } from './utils/serializer';
