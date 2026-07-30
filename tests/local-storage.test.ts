import { describe, expect, it } from 'vitest';
import { createCache, localStorageAdapter, sessionStorageAdapter } from '../src';

describe('LocalStorage & SessionStorage Adapters', () => {
  it('should work with localStorage', async () => {
    const cache = createCache({
      adapter: localStorageAdapter({ prefix: 'test_ls:' }),
    });

    await cache.set('user', { id: 1, name: 'Alice' });
    expect(await cache.get('user')).toEqual({ id: 1, name: 'Alice' });

    expect(await cache.has('user')).toBe(true);
    expect(await cache.keys()).toContain('user');

    await cache.delete('user');
    expect(await cache.get('user')).toBeNull();
  });

  it('should work with sessionStorage', async () => {
    const cache = createCache({
      adapter: sessionStorageAdapter({ prefix: 'test_ss:' }),
    });

    await cache.set('token', 'abc-123');
    expect(await cache.get('token')).toBe('abc-123');

    await cache.clear();
    expect(await cache.get('token')).toBeNull();
  });
});
