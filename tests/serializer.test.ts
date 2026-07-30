import { describe, expect, it } from 'vitest';
import { createCache, DefaultSerializer, localStorageAdapter } from '../src';

describe('Serialization (Date, Map, Set, BigInt, Custom)', () => {
  it('should preserve Date, Map, Set, BigInt types across serialization', async () => {
    const cache = createCache({
      adapter: localStorageAdapter({ prefix: 'ser:' }),
    });

    const now = new Date('2026-01-01T00:00:00.000Z');
    const myMap = new Map([
      ['a', 1],
      ['b', 2],
    ]);
    const mySet = new Set([10, 20, 30]);
    const myBigInt = BigInt('9007199254740991');

    await cache.set('date', now);
    await cache.set('map', myMap);
    await cache.set('set', mySet);
    await cache.set('bigint', myBigInt);

    const resDate = await cache.get<Date>('date');
    const resMap = await cache.get<Map<string, number>>('map');
    const resSet = await cache.get<Set<number>>('set');
    const resBigInt = await cache.get<bigint>('bigint');

    expect(resDate).toBeInstanceOf(Date);
    expect(resDate?.toISOString()).toBe(now.toISOString());

    expect(resMap).toBeInstanceOf(Map);
    expect(Array.from(resMap!.entries())).toEqual([
      ['a', 1],
      ['b', 2],
    ]);

    expect(resSet).toBeInstanceOf(Set);
    expect(Array.from(resSet!.values())).toEqual([10, 20, 30]);

    expect(typeof resBigInt).toBe('bigint');
    expect(resBigInt).toBe(myBigInt);
  });

  it('should allow registering custom type transformers', () => {
    const serializer = new DefaultSerializer();

    class Color {
      constructor(public hex: string) {}
    }

    serializer.registerTransformer<Color>({
      name: 'Color',
      match: (val) => val instanceof Color,
      serialize: (val) => val.hex,
      deserialize: (hex) => new Color(hex),
    });

    const original = { themeColor: new Color('#ff0000') };
    const str = serializer.serialize(original);
    const restored = serializer.deserialize<typeof original>(str);

    expect(restored.themeColor).toBeInstanceOf(Color);
    expect(restored.themeColor.hex).toBe('#ff0000');
  });
});
