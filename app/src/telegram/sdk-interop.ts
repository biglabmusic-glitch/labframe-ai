/** Vite's dev and production CommonJS interop expose this SDK differently. */
export function resolveTelegramSdk<T>(imported: unknown): T {
  for (const candidate of [imported, (imported as { default?: unknown } | null)?.default]) {
    if (candidate && typeof candidate === 'object' &&
      typeof (candidate as { initData?: unknown }).initData === 'string' &&
      typeof (candidate as { ready?: unknown }).ready === 'function') {
      return candidate as T;
    }
  }
  throw new Error('Telegram SDK unavailable');
}
