import { describe, expect, it } from 'vitest';
import { createCache } from '../src';

describe('Batch Operations (setMany, getMany, deleteMany)', () => {
  it('should set, get, and delete multiple keys in batch', async () => {
    const cache = createCache();

    await cache.setMany([
      { key: 'num:1', value: 100 },
      { key: 'num:2', value: 200 },
      { key: 'num:3', value: 300 },
    ]);

    const res = await cache.getMany<number>(['num:1', 'num:2', 'num:4']);
    expect(res).toEqual({
      'num:1': 100,
      'num:2': 200,
      'num:4': null,
    });

    const deletedCount = await cache.deleteMany(['num:1', 'num:2']);
    expect(deletedCount).toBe(2);
    expect(await cache.get('num:1')).toBeNull();
    expect(await cache.get('num:3')).toBe(300);
  });
});
