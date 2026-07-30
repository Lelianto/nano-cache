import { describe, expect, it } from 'vitest';
import { createCache } from '../src';

describe('Tag-based Cache Invalidation', () => {
  it('should invalidate keys associated with specific tags', async () => {
    const cache = createCache();

    await cache.set('user:1', { name: 'Alice' }, { tags: ['users', 'vip'] });
    await cache.set('user:2', { name: 'Bob' }, { tags: ['users'] });
    await cache.set('post:1', { title: 'Hello World' }, { tags: ['posts'] });

    expect(await cache.get('user:1')).not.toBeNull();
    expect(await cache.get('user:2')).not.toBeNull();
    expect(await cache.get('post:1')).not.toBeNull();

    await cache.invalidateTag('users');

    expect(await cache.get('user:1')).toBeNull();
    expect(await cache.get('user:2')).toBeNull();
    expect(await cache.get('post:1')).toEqual({ title: 'Hello World' });
  });
});
