import { createCache, memoryAdapter } from '@antihero/nano-cache';

async function runNodeExample() {
  const cache = createCache({
    adapter: memoryAdapter({ max: 100 }),
    ttl: '5m',
    namespace: 'node-app',
  });

  // Basic set & get
  await cache.set('config', { env: 'production', debug: false });
  const config = await cache.get<{ env: string; debug: boolean }>('config');
  console.log('Config:', config);

  // Fetch with request deduplication
  const user = await cache.fetch('user:101', async () => {
    console.log('Fetching user 101 from database...');
    return { id: 101, name: 'Alice Smith' };
  });

  console.log('Fetched User:', user);

  // Stats
  const stats = await cache.stats();
  console.log('Cache Stats:', stats);
}

runNodeExample();
