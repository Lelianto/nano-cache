import { describe, expect, it, vi } from 'vitest';
import { createCache } from '../src';

describe('Cache Event Emitter', () => {
  it('should emit set, get, delete, clear, and expired events', async () => {
    vi.useFakeTimers();

    const cache = createCache({ ttl: '5s' });

    const onSet = vi.fn();
    const onGet = vi.fn();
    const onDelete = vi.fn();
    const onClear = vi.fn();
    const onExpired = vi.fn();

    cache.on('set', onSet);
    cache.on('get', onGet);
    cache.on('delete', onDelete);
    cache.on('clear', onClear);
    cache.on('expired', onExpired);

    // set event
    await cache.set('item', 'value');
    expect(onSet).toHaveBeenCalledWith('item', 'value', undefined);

    // get event
    await cache.get('item');
    expect(onGet).toHaveBeenCalledWith('item', 'value');

    // delete event
    await cache.delete('item');
    expect(onDelete).toHaveBeenCalledWith('item');

    // expired event: set with 1s TTL, advance time past expiry, then get triggers the event
    await cache.set('expiring', 'bye', { ttl: '1s' });
    vi.advanceTimersByTime(2_000); // move clock forward 2 seconds
    await cache.get('expiring'); // should detect expiry and emit 'expired'
    expect(onExpired).toHaveBeenCalledWith('expiring', 'bye');

    // clear event
    await cache.clear();
    expect(onClear).toHaveBeenCalled();

    vi.useRealTimers();
  });
});
