export interface AdminRequestCache<T> {
  peek(): T | null;
  load(force?: boolean): Promise<T>;
}

/** Screen-owned memory only: private admin data never goes into browser storage. */
export function createAdminRequestCache<T>(
  fetcher: () => Promise<T>,
  ttlMs = 15_000,
  now = Date.now,
): AdminRequestCache<T> {
  let cached: { value: T; at: number } | null = null;
  let pending: Promise<T> | null = null;
  function load(force = false): Promise<T> {
    if (pending) return force ? pending.then(() => load(true), () => load(true)) : pending;
    if (!force && cached && now() - cached.at < ttlMs) return Promise.resolve(cached.value);
    pending = Promise.resolve().then(fetcher).then((value) => {
      cached = { value, at: now() };
      return value;
    }).finally(() => { pending = null; });
    return pending;
  }
  return { peek: () => cached?.value ?? null, load };
}
