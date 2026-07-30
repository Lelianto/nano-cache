import { CacheSerializer } from '../types/cache';

export interface TypeTransformer<T = any> {
  name: string;
  match: (value: any) => boolean;
  serialize: (value: T) => any;
  deserialize: (data: any) => T;
}

export class DefaultSerializer implements CacheSerializer {
  private transformers: Map<string, TypeTransformer> = new Map();

  constructor() {
    this.registerBuiltIns();
  }

  /**
   * Register a custom type transformer for serialization/deserialization.
   */
  public registerTransformer<T>(transformer: TypeTransformer<T>): void {
    this.transformers.set(transformer.name, transformer);
  }

  private registerBuiltIns(): void {
    // Date — must be registered FIRST so it takes priority.
    // Note: JSON.stringify calls Date.toJSON() BEFORE invoking the replacer,
    // so by the time the replacer fires the value is already a string.
    // We use the `this[key]` trick to access the original object.
    this.registerTransformer<Date>({
      name: 'Date',
      match: (val) => val instanceof Date,
      serialize: (val) => val.toISOString(),
      deserialize: (val) => new Date(val),
    });

    // Map
    this.registerTransformer<Map<any, any>>({
      name: 'Map',
      match: (val) => val instanceof Map,
      serialize: (val) => Array.from(val.entries()),
      deserialize: (val) => new Map(val),
    });

    // Set
    this.registerTransformer<Set<any>>({
      name: 'Set',
      match: (val) => val instanceof Set,
      serialize: (val) => Array.from(val.values()),
      deserialize: (val) => new Set(val),
    });

    // BigInt
    this.registerTransformer<bigint>({
      name: 'BigInt',
      match: (val) => typeof val === 'bigint',
      serialize: (val) => val.toString(),
      deserialize: (val) => BigInt(val),
    });
  }

  public serialize(value: any): string {
    const transformers = this.transformers;
    // Use a regular function (not arrow) so `this` inside the replacer refers
    // to the containing object, giving us access to the *pre-toJSON* value.
    return JSON.stringify(value, function (this: any, key, val) {
      // Grab the original un-JSON-coerced value from the parent object
      const original = key === '' ? value : this[key];
      for (const transformer of transformers.values()) {
        if (transformer.match(original)) {
          return {
            __nano_type__: transformer.name,
            value: transformer.serialize(original),
          };
        }
      }
      return val;
    });
  }

  public deserialize<T = any>(text: string): T {
    if (!text) {
      return text as any;
    }

    return JSON.parse(text, (_key, val) => {
      if (val && typeof val === 'object' && '__nano_type__' in val) {
        const typeName = val.__nano_type__;
        const transformer = this.transformers.get(typeName);
        if (transformer) {
          return transformer.deserialize(val.value);
        }
      }
      return val;
    });
  }
}

export const defaultSerializer = new DefaultSerializer();
