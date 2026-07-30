import { describe, expect, it } from 'vitest';
import { createAdapter, createCache } from '../src';

describe('Custom Adapter Support', () => {
  it('should support custom adapters created via createAdapter()', async () => {
    const memory = new Map<string, any>();

    const custom = createAdapter({
      get: (k) => memory.get(k) || null,
      set: (k, item) => { memory.set(k, item); },
      delete: (k) => memory.delete(k),
      clear: () => memory.clear(),
      keys: () => Array.from(memory.keys()),
    });

    const cache = createCache({ adapter: custom });

    await cache.set('customKey', 'customValue');
    expect(await cache.get('customKey')).toBe('customValue');
    expect(await cache.keys()).toEqual(['customKey']);

    await cache.clear();
    expect(await cache.get('customKey')).toBeNull();
  });
});
