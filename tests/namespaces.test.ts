import { describe, expect, it } from 'vitest';
import { createCache, memoryAdapter } from '../src';

describe('Namespace Isolation', () => {
  it('should isolate keys using namespace prefix', async () => {
    const sharedAdapter = memoryAdapter();
    const authCache = createCache({ adapter: sharedAdapter, namespace: 'auth' });
    const userCache = createCache({ adapter: sharedAdapter, namespace: 'user' });

    await authCache.set('token', 'auth-123');
    await userCache.set('token', 'user-456');

    expect(await authCache.get('token')).toBe('auth-123');
    expect(await userCache.get('token')).toBe('user-456');

    expect(await authCache.keys()).toEqual(['token']);
    expect(await userCache.keys()).toEqual(['token']);
  });
});
