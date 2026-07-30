/**
 * Prepend a namespace to a cache key if namespace is provided.
 */
export function formatKey(key: string, namespace?: string): string {
  if (!namespace) {
    return key;
  }
  return `${namespace}:${key}`;
}

/**
 * Remove a namespace prefix from a raw key if namespace is present.
 */
export function stripNamespace(rawKey: string, namespace?: string): string {
  if (!namespace) {
    return rawKey;
  }
  const prefix = `${namespace}:`;
  if (rawKey.startsWith(prefix)) {
    return rawKey.slice(prefix.length);
  }
  return rawKey;
}
