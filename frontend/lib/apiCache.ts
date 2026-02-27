/**
 * Tiny in-memory TTL cache for API responses.
 * Avoids duplicate network requests when the user navigates away and back within a short period.
 * No external dependencies — intentionally simple.
 */

interface CacheEntry<T> {
  data: T;
  ts: number;
}

const store = new Map<string, CacheEntry<unknown>>();

/**
 * Fetch with cache.
 * @param key      Cache key (usually URL + serialised params)
 * @param fetcher  Async function that returns fresh data
 * @param ttlMs    How long the cached value is valid (default 30 s)
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = 30_000,
): Promise<T> {
  const hit = store.get(key) as CacheEntry<T> | undefined;
  if (hit && Date.now() - hit.ts < ttlMs) {
    return hit.data;
  }
  const data = await fetcher();
  store.set(key, { data, ts: Date.now() });
  return data;
}

/** Invalidate a specific cache key (e.g., after a write operation). */
export function invalidateCache(key: string): void {
  store.delete(key);
}

/** Invalidate all keys that start with a given prefix. */
export function invalidateCachePrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
