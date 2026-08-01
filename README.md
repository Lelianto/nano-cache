<p align="center">
  <h1 align="center">nano-cache</h1>
  <p align="center">Universal, lightweight, zero-dependency TypeScript caching library with pluggable adapters.</p>
  <p align="center">
    <a href="https://www.npmjs.com/package/@antihero/nano-cache"><img alt="npm" src="https://img.shields.io/npm/v/@antihero/nano-cache?style=flat-square&color=6366f1" /></a>
    <a href="https://github.com/Lelianto/nano-cache/actions"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/Lelianto/nano-cache/ci.yml?style=flat-square&label=CI" /></a>
    <img alt="coverage" src="https://img.shields.io/badge/coverage-93%25-22c55e?style=flat-square" />
    <img alt="license" src="https://img.shields.io/npm/l/@antihero/nano-cache?style=flat-square" />
    <img alt="size" src="https://img.shields.io/bundlejs/size/@antihero/nano-cache?style=flat-square" />
  </p>
</p>

---

**One cache API that works everywhere.** Write your caching logic once, then choose where the data
lives — memory, `localStorage`, `sessionStorage`, IndexedDB, Redis, or your own backend — by swapping
a single line.

```ts
const cache = createCache({ adapter: memoryAdapter() });   // Node, tests
const cache = createCache({ adapter: localStorageAdapter() }); // browser, survives reload
const cache = createCache({ adapter: redisAdapter(redis) }); // shared across servers
```

Everything else in your code stays identical.

## Table of contents

- [Install](#install)
- [Quick start](#quick-start)
- [Core concepts](#core-concepts)
- [Real-world use cases](#real-world-use-cases)
- [API reference](#api-reference)
- [Adapters](#adapters)
- [Events and stats](#events-and-stats)
- [Serialization](#serialization)
- [Gotchas](#gotchas)
- [TypeScript](#typescript)

## Install

```bash
npm install @antihero/nano-cache
```

```bash
pnpm add @antihero/nano-cache
```

```bash
yarn add @antihero/nano-cache
```

Requires Node 16+. Ships both ESM and CommonJS builds with TypeScript types. No runtime dependencies.

## Quick start

```ts
import { createCache, memoryAdapter } from '@antihero/nano-cache';

const cache = createCache({
  adapter: memoryAdapter({ max: 1000 }), // evict least-recently-used past 1000 entries
  ttl: '5m',                             // default expiry for every entry
});

await cache.set('user:1', { name: 'Ada' });
await cache.get('user:1');   // { name: 'Ada' }
await cache.has('user:1');   // true

await cache.set('otp', '123456', { ttl: '30s' }); // override the default TTL
await cache.delete('otp');
```

Every method returns a promise, even with synchronous adapters like memory. That is deliberate: it
means switching to Redis or IndexedDB later requires no changes to your call sites.

## Core concepts

### TTL — how long an entry lives

Pass a number of milliseconds, or a duration string.

```ts
await cache.set('a', 1, { ttl: 3000 });   // 3000 ms
await cache.set('b', 1, { ttl: '500ms' });
await cache.set('c', 1, { ttl: '30s' });
await cache.set('d', 1, { ttl: '10m' });
await cache.set('e', 1, { ttl: '2h' });
await cache.set('f', 1, { ttl: '7d' });
await cache.set('g', 1);                  // no TTL -> never expires
```

Expiry is **lazy**: nothing runs on a timer. An entry is removed when you try to read it after it
expired, or when `keys()` / `size()` sweeps the store. There is no background interval to leak.

### Namespaces — keep unrelated caches apart

A namespace prefixes every key, so two caches can share one backend without colliding.

```ts
const users = createCache({ namespace: 'users', adapter: memoryAdapter() });
const posts = createCache({ namespace: 'posts', adapter: memoryAdapter() });

await users.set('1', { name: 'Ada' });
await posts.set('1', { title: 'Hello' });   // different entry, same key "1"

await users.keys();   // ['1'] — namespace is stripped from what you get back
```

### Tags — invalidate groups of entries

Tags let you drop many related entries at once, without knowing their keys.

```ts
await cache.set('post:1', post1, { tags: ['posts', 'author:7'] });
await cache.set('post:2', post2, { tags: ['posts', 'author:9'] });

await cache.invalidateTag('author:7'); // drops post:1 only
await cache.invalidateTag('posts');    // drops everything tagged "posts"
```

## Real-world use cases

### 1. Stop hammering a slow API

`fetch()` is the method you will reach for most. It returns the cached value if present, otherwise
runs your function, caches the result, and returns it.

```ts
import { createCache, memoryAdapter } from '@antihero/nano-cache';

const cache = createCache({ adapter: memoryAdapter(), ttl: '10m' });

async function getExchangeRates() {
  return cache.fetch('rates', async () => {
    const res = await fetch('https://api.example.com/rates');
    return res.json();
  });
}

await getExchangeRates(); // hits the network
await getExchangeRates(); // instant, from cache
```

Force a refresh when you need fresh data:

```ts
await cache.fetch('rates', loadRates, { force: true });
```

### 2. Survive a traffic spike (stampede protection)

If 100 requests ask for the same missing key at once, a naive cache runs your loader 100 times.
`fetch()` deduplicates concurrent calls: the first one runs, the other 99 wait for the same promise.

```ts
let hits = 0;

const load = async () => {
  hits++;
  await new Promise((r) => setTimeout(r, 50));
  return 'data';
};

await Promise.all(Array.from({ length: 100 }, () => cache.fetch('key', load)));

console.log(hits); // 1 — not 100
```

This is the difference between a cold cache being a non-event and it taking down your database.

### 3. Cache per user, and clear one user cleanly

```ts
const cache = createCache({ adapter: memoryAdapter(), ttl: '15m' });

async function getDashboard(userId: string) {
  return cache.fetch(
    `dashboard:${userId}`,
    () => db.buildDashboard(userId),
    { tags: [`user:${userId}`] },
  );
}

// User changed their settings — drop everything cached for them
async function onUserUpdated(userId: string) {
  await cache.invalidateTag(`user:${userId}`);
}
```

### 4. Remember a form draft in the browser

`sessionStorage` keeps the draft through an accidental reload, but clears when the tab closes.

```ts
import { createCache, sessionStorageAdapter } from '@antihero/nano-cache';

const drafts = createCache({
  adapter: sessionStorageAdapter(),
  namespace: 'draft',
});

// as the user types
await drafts.set('signup', { email, plan });

// when the form mounts
const draft = await drafts.get('signup');
if (draft) restore(draft);

// on successful submit
await drafts.delete('signup');
```

Use `localStorageAdapter()` instead if the draft should survive closing the browser.

### 5. Offline-first storage with IndexedDB

IndexedDB holds far more data than `localStorage` and stores structured values, which makes it a good
fit for caching lists of records for offline use.

```ts
import { createCache, indexedDBAdapter } from '@antihero/nano-cache';

const offline = createCache({
  adapter: indexedDBAdapter({ dbName: 'my-app', storeName: 'articles' }),
  ttl: '7d',
});

async function getArticles() {
  return offline.fetch('articles', async () => {
    const res = await fetch('/api/articles');
    return res.json();
  });
}
```

If IndexedDB is unavailable — private browsing, an old browser, server-side rendering — the adapter
silently falls back to in-memory storage instead of throwing.

### 6. Share one cache across many servers with Redis

Memory caches are per-process, so with several instances behind a load balancer each keeps its own
copy. Redis gives all of them one shared cache.

```ts
import Redis from 'ioredis';
import { createCache, redisAdapter } from '@antihero/nano-cache';

const cache = createCache({
  adapter: redisAdapter(new Redis(process.env.REDIS_URL), { prefix: 'myapp:' }),
  ttl: '1h',
});

await cache.set('session:abc', { userId: 7 }); // visible to every instance
```

TTLs are pushed down to Redis itself, so Redis expires the key for you.

The adapter calls `client.set(key, value, 'PX', ms)`, which is the **ioredis** signature. For
`node-redis` v4, wrap the client:

```ts
import { createClient } from 'redis';

const client = createClient();
await client.connect();

const shim = {
  get: (k: string) => client.get(k),
  set: (k: string, v: string, mode?: string, ttl?: number) =>
    mode === 'PX' ? client.set(k, v, { PX: ttl! }) : client.set(k, v),
  del: (...keys: string[]) => client.del(keys),
  keys: (pattern: string) => client.keys(pattern),
};

const cache = createCache({ adapter: redisAdapter(shim) });
```

### 7. Memoize an expensive computation

Caching is not only for I/O. Anything slow and deterministic is a candidate.

```ts
const cache = createCache({ adapter: memoryAdapter({ max: 500 }) });

async function renderMarkdown(doc: string) {
  return cache.fetch(`md:${hash(doc)}`, () => heavyMarkdownToHtml(doc));
}
```

`max: 500` caps memory: once full, the least recently used entry is evicted automatically.

### 8. Bring your own storage backend

Any store with get/set/delete can become an adapter. Here is one backed by a plain `Map`, which is
also the shape you would use for SQLite, a file, or a KV service.

```ts
import { createCache, createAdapter } from '@antihero/nano-cache';

const store = new Map<string, any>();

const cache = createCache({
  adapter: createAdapter({
    get: (key) => store.get(key) ?? null,
    set: (key, item) => void store.set(key, item),
    delete: (key) => store.delete(key),
    clear: () => store.clear(),
    keys: () => Array.from(store.keys()),
  }),
});
```

Only `get`, `set`, `delete`, and `clear` are required. Supply `keys` as well if you want `keys()`,
`size()`, and tag invalidation to work. Expiry, tags, namespacing, stats, and events are handled for
you above the adapter.

### 9. Warm a cache, then read it in bulk

```ts
await cache.setMany([
  { key: 'a', value: 1 },
  { key: 'b', value: 2, options: { ttl: '1m' } },
]);

await cache.getMany(['a', 'b', 'missing']);
// { a: 1, b: 2, missing: null }

await cache.deleteMany(['a', 'b']); // 2
```

### 10. See whether your cache is actually helping

```ts
const s = await cache.stats();
const total = s.hits + s.misses;
console.log(`hit rate: ${((s.hits / total) * 100).toFixed(1)}%`);
```

A low hit rate usually means your TTL is too short or your keys are too specific.

## API reference

Create a cache with `createCache(options)`, or `new NanoCache(options)`.

| Option      | Type           | Default            | Description                                        |
| ----------- | -------------- | ------------------ | -------------------------------------------------- |
| `adapter`   | `CacheAdapter` | `memoryAdapter()`  | Where entries are stored                           |
| `ttl`       | `TTL`          | none               | Default expiry for every entry                     |
| `namespace` | `string`       | none               | Prefix applied to all keys                         |
| `max`       | `number`       | unlimited          | LRU capacity — only when `adapter` is **not** given |

### Methods

| Method                        | Returns                    | Notes                                                |
| ----------------------------- | -------------------------- | ---------------------------------------------------- |
| `set(key, value, options?)`   | `Promise<void>`            | `options`: `{ ttl, tags }`                           |
| `get(key)`                    | `Promise<T \| null>`       | `null` when missing or expired                       |
| `has(key)`                    | `Promise<boolean>`         | Counts toward hit/miss stats                         |
| `delete(key)`                 | `Promise<boolean>`         | `true` if an entry was removed                       |
| `clear()`                     | `Promise<void>`            | Removes everything in the adapter                    |
| `keys()`                      | `Promise<string[]>`        | Non-expired keys, namespace stripped                 |
| `size()`                      | `Promise<number>`          | Count of non-expired entries                         |
| `fetch(key, fn, options?)`    | `Promise<T>`               | Read-through + concurrency dedup; `{ ttl, tags, force }` |
| `invalidateTag(tag)`          | `Promise<void>`            | Drops every entry carrying the tag                   |
| `getMany(keys)`               | `Promise<Record<…>>`       | Missing keys map to `null`                           |
| `setMany(entries)`            | `Promise<void>`            | `[{ key, value, options? }]`                         |
| `deleteMany(keys)`            | `Promise<number>`          | Count actually deleted                               |
| `on(event, listener)`         | `() => void`               | Returns an unsubscribe function                      |
| `off(event, listener)`        | `void`                     |                                                      |
| `stats()`                     | `Promise<CacheStats>`      | Counters plus entry count                            |

## Adapters

| Adapter                       | Where            | Persists     | Notes                                          |
| ----------------------------- | ---------------- | ------------ | ---------------------------------------------- |
| `memoryAdapter({ max })`      | anywhere         | no           | LRU eviction, fastest, per-process             |
| `localStorageAdapter()`       | browser          | yes          | ~5 MB, strings only (serialized for you)       |
| `sessionStorageAdapter()`     | browser          | per tab      | Cleared when the tab closes                    |
| `indexedDBAdapter()`          | browser          | yes          | Large capacity, falls back to memory           |
| `redisAdapter(client)`        | Node             | yes          | Shared across processes, native TTL            |
| `createAdapter(config)`       | anywhere         | up to you    | Wrap any custom store                          |

Shared options: `localStorageAdapter`, `sessionStorageAdapter`, and `redisAdapter` accept
`{ prefix, serializer }`. `indexedDBAdapter` accepts `{ dbName, storeName, version }`.
`memoryAdapter` accepts `{ max }`.

## Events and stats

```ts
const off = cache.on('expired', (key, value) => {
  console.log('expired:', key, value);
});

off(); // unsubscribe
```

| Event     | Listener signature              |
| --------- | ------------------------------- |
| `set`     | `(key, value, options?) => void` |
| `get`     | `(key, value) => void`          |
| `delete`  | `(key) => void`                 |
| `expired` | `(key, value) => void`          |
| `clear`   | `() => void`                    |

`get` fires only on a hit, and `expired` fires when a read discovers a stale entry. Exceptions thrown
inside a listener are swallowed, so a bad listener cannot break a cache operation.

`stats()` returns `hits`, `misses`, `sets`, `deletes`, `expired`, `entries`, and `memoryUsage`.

## Serialization

String-based adapters (`localStorage`, `sessionStorage`, Redis) need values converted to text. Plain
`JSON.stringify` would turn a `Date` into a string and a `Map` into `{}`. The built-in serializer
handles `Date`, `Map`, `Set`, and `BigInt` and restores their real types on read.

```ts
await cache.set('when', new Date());
(await cache.get('when')) instanceof Date; // true

await cache.set('m', new Map([['a', 1]]));
(await cache.get('m')).get('a'); // 1
```

Register your own type with a transformer:

```ts
import { defaultSerializer } from '@antihero/nano-cache';

class Money {
  constructor(public cents: number) {}
}

defaultSerializer.registerTransformer<Money>({
  name: 'Money',
  match: (v) => v instanceof Money,
  serialize: (v) => v.cents,
  deserialize: (cents) => new Money(cents),
});
```

## Gotchas

Behaviours that are easy to trip over. Each one is verified against the current release.

**Operations fail silently.** A failed `set` — Redis down, `localStorage` quota exceeded — does not
throw; it is a no-op. A failed `get` returns `null`. This keeps a cache outage from taking down your
app, but it also means you should never treat the cache as your source of truth.

**You cannot cache `null`.** `get()` returns `null` for both "missing" and "stored `null`", so
`set(key, null)` is indistinguishable from a miss, and `has()` reports `false`. As a result `fetch()`
re-runs your loader every time its result is `null` — there is no negative caching. Store a sentinel
such as `{ empty: true }` if you need to remember "this does not exist".

**An invalid TTL string is ignored, not rejected.** `{ ttl: '10min' }` or `{ ttl: 'abc' }` does not
throw — it is treated as "no TTL", so the entry never expires. Valid units are `ms`, `s`, `m`, `h`,
`d`.

**`max` only applies when you omit `adapter`.** `createCache({ max: 100 })` works, but
`createCache({ adapter: memoryAdapter(), max: 100 })` silently ignores `max`. Pass it to the adapter
instead: `memoryAdapter({ max: 100 })`.

**`serializer` on `createCache` does nothing.** It belongs to the adapter:
`localStorageAdapter({ serializer })`, not `createCache({ serializer })`.

**`stats().memoryUsage` is process heap, not cache size.** It comes from `process.memoryUsage()` and
reports your whole Node process; it is `0` in browsers. Use `size()` for the number of entries.

**`has()` affects your stats.** It is implemented on top of `get()`, so it increments `hits` or
`misses`.

**Browser adapters are no-ops on the server.** With no `window`, `localStorageAdapter()` stores
nothing and reads return `null`. That makes SSR safe by default, but a server-rendered pass will
always miss.

## TypeScript

Types ship with the package; no `@types` install needed. Values are typed per call:

```ts
import { createCache, memoryAdapter, type CacheStats } from '@antihero/nano-cache';

interface User {
  id: string;
  name: string;
}

const cache = createCache({ adapter: memoryAdapter() });

await cache.set<User>('u1', { id: '1', name: 'Ada' });

const user = await cache.get<User>('u1'); // User | null
if (user) console.log(user.name);         // narrow the null away first

const stats: CacheStats = await cache.stats();
```

Exported types: `TTL`, `CacheItem`, `SetOptions`, `FetchOptions`, `CacheOptions`, `CacheStats`,
`CacheEventMap`, `EventKey`, `CacheAdapter`, `CacheSerializer`, `TypeTransformer`, plus the option
types for each adapter.

## Contributing

```bash
pnpm install
pnpm test          # run the suite
pnpm test:coverage # with coverage
pnpm lint
pnpm typecheck
pnpm build
```

## License

MIT

---

## 🚀 More TypeScript Projects

If you find this package useful, you may also like these open-source projects.

| Project | Description |
|---------|-------------|
| **💰 Monify** | Lightweight currency formatting library with multi-currency support. |
| **🤖 AgentifAI** | Vendor-neutral AI agent event model and debugging toolkit. |
| **⚡ Statelite** | Lightweight reactive state management for TypeScript. |
| **🗄️ Nano Cache** | Universal cache abstraction for memory, Redis, IndexedDB, and more. |
| **🔌 PlugnPlay** | Bootstrap cloud backends with minimal configuration. |
| **🎨 Sagara UI** | Utility-first CSS framework optimized for AI-assisted development. |

### Explore the ecosystem

- 💰 Monify → https://github.com/Lelianto/monify
- 🤖 AgentifAI → https://github.com/Lelianto/agentifai
- ⚡ Statelite → https://github.com/Lelianto/statelite
- 🗄️ Nano Cache → https://github.com/Lelianto/nano-cache
- 🔌 PlugnPlay → https://github.com/Lelianto/plugnplay
- 🎨 Sagara UI → https://github.com/Lelianto/sagaraui

⭐ If you enjoy this project, consider giving it a star. It helps others discover the ecosystem.
