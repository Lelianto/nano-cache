<p align="center">
  <h1 align="center">nano-cache</h1>
  <p align="center">Universal, lightweight, zero-dependency TypeScript caching library with pluggable adapters.</p>
  <p align="center">
    <a href="https://www.npmjs.com/package/@lelianto/nano-cache"><img alt="npm" src="https://img.shields.io/npm/v/@lelianto/nano-cache?style=flat-square&color=6366f1" /></a>
    <a href="https://github.com/Lelianto/nano-cache/actions"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/Lelianto/nano-cache/ci.yml?style=flat-square&label=CI" /></a>
    <img alt="coverage" src="https://img.shields.io/badge/coverage-95%25-22c55e?style=flat-square" />
    <img alt="license" src="https://img.shields.io/npm/l/@lelianto/nano-cache?style=flat-square" />
    <img alt="size" src="https://img.shields.io/bundlephobia/minzip/@lelianto/nano-cache?style=flat-square" />
  </p>
</p>

---

## Features

- 🔌 **Pluggable adapters** — Memory, LocalStorage, SessionStorage, IndexedDB, Redis, or Custom
- 🌍 **Universal** — Node.js, Browser, React, Next.js, Vue, Svelte, Vanilla JS
- ⚡ **Zero dependencies** — no hidden runtime deps
- 🔒 **Type-safe** — full TypeScript inference, zero casting needed
- ⏱️ **TTL support** — human-readable (`10s`, `5m`, `1h`, `1d`) or milliseconds
- 🏷️ **Tags** — group-invalidate related entries instantly
- 🔁 **Request deduplication** — prevents cache stampede for concurrent fetches
- 📦 **Batch operations** — `getMany`, `setMany`, `deleteMany`
- 📊 **Stats** — hits, misses, sets, deletes, expired, memory usage
- 🗜️ **LRU eviction** — optional max capacity with automatic LRU pruning
- 🎯 **Events** — `set`, `get`, `delete`, `clear`, `expired`
- 🔧 **Extensible serializer** — supports `Date`, `Map`, `Set`, `BigInt`, and custom types
- 📬 **Tree-shakeable** — import only what you use

---

## Installation

```bash
npm install @lelianto/nano-cache
# or
pnpm add @lelianto/nano-cache
# or
yarn add @lelianto/nano-cache
```

---

## Quick Start

```ts
import { createCache, memoryAdapter } from '@lelianto/nano-cache';

const cache = createCache({
  adapter: memoryAdapter(),
  ttl: '5m',
  namespace: 'my-app',
});

// Set
await cache.set('user:1', { id: 1, name: 'Alice' });

// Get
const user = await cache.get<User>('user:1');

// Fetch with auto-cache + stampede protection
const data = await cache.fetch('users', fetchUsers, { ttl: '10m' });
```

---

## Core API

### `createCache(options?)`

```ts
const cache = createCache({
  adapter: memoryAdapter(),   // storage backend
  ttl: '1h',                  // default TTL
  namespace: 'auth',          // key prefix
  max: 1000,                  // LRU max entries (memory adapter)
});
```

### `set(key, value, options?)`

```ts
await cache.set('token', jwt, { ttl: '30m', tags: ['auth'] });
```

### `get<T>(key)`

```ts
const token = await cache.get<string>('token');
// → string | null
```

### `has(key)`

```ts
const exists = await cache.has('token'); // → boolean
```

### `delete(key)`

```ts
await cache.delete('token'); // → boolean
```

### `clear()`

```ts
await cache.clear();
```

### `keys()`

```ts
const keys = await cache.keys(); // → string[]
```

### `size()`

```ts
const count = await cache.size(); // → number
```

### `fetch(key, callback, options?)`

Cache-aside with automatic **request deduplication** — if 10 concurrent calls hit the same uncached key, the callback is executed exactly once.

```ts
const users = await cache.fetch(
  'users',
  async () => fetchUsersFromDB(),
  { ttl: '5m', force: false }
);
```

### `invalidateTag(tag)`

```ts
await cache.set('user:1', data, { tags: ['users'] });
await cache.set('user:2', data, { tags: ['users'] });

await cache.invalidateTag('users'); // removes both entries
```

### Batch Operations

```ts
await cache.setMany([
  { key: 'a', value: 1 },
  { key: 'b', value: 2, options: { ttl: '1m' } },
]);

const results = await cache.getMany<number>(['a', 'b', 'c']);
// → { a: 1, b: 2, c: null }

const count = await cache.deleteMany(['a', 'b']);
// → 2
```

### Events

```ts
cache.on('set', (key, value) => console.log('cached:', key));
cache.on('expired', (key, value) => console.log('expired:', key));
cache.on('delete', (key) => console.log('deleted:', key));
cache.on('clear', () => console.log('cleared'));

// Unsubscribe
const unsub = cache.on('get', handler);
unsub();

// Or manually
cache.off('set', handler);
```

### Stats

```ts
const stats = await cache.stats();
// {
//   hits: 42,
//   misses: 3,
//   sets: 15,
//   deletes: 2,
//   expired: 1,
//   memoryUsage: 10485760,
//   entries: 10
// }
```

---

## TTL Formats

| Format  | Example | Duration        |
|---------|---------|-----------------|
| `ms`    | `500ms` | 500 milliseconds|
| `s`     | `10s`   | 10 seconds      |
| `m`     | `5m`    | 5 minutes       |
| `h`     | `1h`    | 1 hour          |
| `d`     | `7d`    | 7 days          |
| number  | `3000`  | 3000 ms         |

---

## Adapters

### Memory (default)

```ts
import { createCache, memoryAdapter } from '@lelianto/nano-cache';

const cache = createCache({
  adapter: memoryAdapter({ max: 1000 }), // LRU cap
  ttl: '10m',
});
```

### LocalStorage

```ts
import { createCache, localStorageAdapter } from '@lelianto/nano-cache';

const cache = createCache({
  adapter: localStorageAdapter({ prefix: 'myapp:' }),
});
```

### SessionStorage

```ts
import { createCache, sessionStorageAdapter } from '@lelianto/nano-cache';

const cache = createCache({
  adapter: sessionStorageAdapter(),
});
```

### IndexedDB

```ts
import { createCache, indexedDBAdapter } from '@lelianto/nano-cache';

const cache = createCache({
  adapter: indexedDBAdapter({ dbName: 'my-cache' }),
});
```

Gracefully falls back to in-memory if IndexedDB is unavailable (SSR, Node.js).

### Redis

Works with **any Redis-compatible client** (`ioredis`, `@redis/client`, Upstash):

```ts
import Redis from 'ioredis';
import { createCache, redisAdapter } from '@lelianto/nano-cache';

const client = new Redis();
const cache = createCache({
  adapter: redisAdapter(client, { prefix: 'myapp:' }),
  ttl: '1h',
});
```

### Custom Adapter

```ts
import { createAdapter, createCache } from '@lelianto/nano-cache';

const adapter = createAdapter({
  get: async (key) => myStorage.get(key),
  set: async (key, item) => myStorage.set(key, item),
  delete: async (key) => myStorage.delete(key),
  clear: async () => myStorage.clear(),
  keys: async () => myStorage.keys(),
});

const cache = createCache({ adapter });
```

---

## Framework Examples

### React

```tsx
import { createCache, localStorageAdapter } from '@lelianto/nano-cache';
import { useEffect, useState } from 'react';

const cache = createCache({ adapter: localStorageAdapter(), ttl: '10m' });

export function useUsers() {
  const [users, setUsers] = useState(null);

  useEffect(() => {
    cache.fetch('users', fetchUsers).then(setUsers);
  }, []);

  return users;
}
```

### Next.js (Server)

```ts
// lib/cache.ts
import { createCache, memoryAdapter } from '@lelianto/nano-cache';

export const serverCache = createCache({
  adapter: memoryAdapter({ max: 500 }),
  ttl: '5m',
  namespace: 'api',
});

// app/users/route.ts
export async function GET() {
  const users = await serverCache.fetch('users', () =>
    db.query('SELECT * FROM users')
  );
  return Response.json(users);
}
```

### Express.js

```ts
import express from 'express';
import { createCache, memoryAdapter } from '@lelianto/nano-cache';

const cache = createCache({ ttl: '2m' });
const app = express();

app.get('/api/users', async (req, res) => {
  const users = await cache.fetch('users', () => db.getUsers());
  res.json(users);
});
```

---

## Serialization

`nano-cache` handles `Date`, `Map`, `Set`, and `BigInt` automatically across all string-based adapters (localStorage, sessionStorage, Redis):

```ts
await cache.set('meta', {
  createdAt: new Date(),
  ids: new Set([1, 2, 3]),
  lookup: new Map([['a', 1]]),
  big: BigInt(9007199254740991),
});

const meta = await cache.get('meta');
meta.createdAt instanceof Date // ✅ true
meta.ids instanceof Set        // ✅ true
```

### Custom Type Serializers

```ts
import { defaultSerializer } from '@lelianto/nano-cache';

defaultSerializer.registerTransformer({
  name: 'Decimal',
  match: (val) => val instanceof Decimal,
  serialize: (val) => val.toString(),
  deserialize: (str) => new Decimal(str),
});
```

---

## Namespaces

Namespaces prefix all keys to avoid collisions when sharing a storage backend:

```ts
const authCache = createCache({ namespace: 'auth', adapter });
const userCache = createCache({ namespace: 'user', adapter });

await authCache.set('token', jwt);   // stored as "auth:token"
await userCache.set('token', id);    // stored as "user:token"
```

---

## LRU Eviction

```ts
const cache = createCache({
  max: 1000, // evict least-recently-used when capacity exceeded
});
```

---

## License

MIT © [Lelianto](https://github.com/Lelianto)
