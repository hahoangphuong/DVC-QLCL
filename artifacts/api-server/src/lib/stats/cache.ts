type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  staleUntil: number;
};

const valueCache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

export async function getOrSetCached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  staleWhileRevalidateMs = 0,
): Promise<T> {
  const now = Date.now();
  const cached = valueCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value as T;
  }

  if (cached && cached.staleUntil > now) {
    const pending = inFlight.get(key);
    if (pending) {
      return cached.value as T;
    }

    const refreshPromise = loader()
      .then((value) => {
        valueCache.set(key, {
          value,
          expiresAt: Date.now() + ttlMs,
          staleUntil: Date.now() + ttlMs + staleWhileRevalidateMs,
        });
        return value;
      })
      .catch(() => cached.value as T)
      .finally(() => {
        inFlight.delete(key);
      });

    inFlight.set(key, refreshPromise);
    return cached.value as T;
  }

  const pending = inFlight.get(key);
  if (pending) {
    return pending as Promise<T>;
  }

  const nextPromise = loader()
    .then((value) => {
      valueCache.set(key, {
        value,
        expiresAt: Date.now() + ttlMs,
        staleUntil: Date.now() + ttlMs + staleWhileRevalidateMs,
      });
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, nextPromise);
  return nextPromise;
}

export function clearCachedByPrefix(prefix: string): void {
  for (const key of valueCache.keys()) {
    if (key.startsWith(prefix)) valueCache.delete(key);
  }
  for (const key of inFlight.keys()) {
    if (key.startsWith(prefix)) inFlight.delete(key);
  }
}
