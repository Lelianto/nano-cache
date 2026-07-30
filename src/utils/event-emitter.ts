import { CacheEventMap, EventKey } from '../types/cache';

type AnyListener = (...args: any[]) => void;

export class NanoEventEmitter {
  private listeners: Map<EventKey, Set<AnyListener>> = new Map();

  /**
   * Subscribe to a cache event.
   */
  public on<K extends EventKey>(event: K, listener: CacheEventMap[K]): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);

    return () => this.off(event, listener);
  }

  /**
   * Unsubscribe from a cache event.
   */
  public off<K extends EventKey>(event: K, listener: CacheEventMap[K]): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /**
   * Emit an event to all subscribers. Safely catches listener exceptions to prevent cache crash.
   */
  public emit<K extends EventKey>(event: K, ...args: Parameters<CacheEventMap[K]>): void {
    const set = this.listeners.get(event);
    if (!set) return;

    for (const listener of Array.from(set)) {
      try {
        listener(...args);
      } catch (err) {
        // Prevent event handlers from crashing cache operations
      }
    }
  }

  /**
   * Remove all listeners.
   */
  public removeAllListeners(): void {
    this.listeners.clear();
  }
}
