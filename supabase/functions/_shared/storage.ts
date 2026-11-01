// Утилиты для работы со Storage: подписанные URL для входного фото,
// загрузка готовых картинок.
import { db } from './db.ts';
import { env } from './env.ts';
import { BodyError, readBodyBytes } from './http-body.ts';

// Сколько браузер и Telegram держат картинку в кеше, не спрашивая снова.
//
// Готовая работа и её миниатюра лежат по пути с id работы и больше не
// меняются, поэтому их можно кешировать надолго. Раньше стоял час по
// умолчанию: главный экран с историей из 24 картинок заново скачивал их при
// каждом открытии приложения — это тот самый исходящий трафик, в который
// упёрся бесплатный тариф Supabase.
const IMMUTABLE_CACHE = '31536000';

// Скачивание не должно висеть бесконечно: функция оборвётся по своему лимиту,
// и настоящая причина потеряется.
const FETCH_TIMEOUT_MS = 60_000;

export async function signUrl(bucket: string, path: string, ttlSec = 60 * 10): Promise<string> {
  const { data, error } = await db.storage.from(bucket).createSignedUrl(path, ttlSec);
  if (error || !data) throw new Error(`signUrl ${bucket}/${path}: ${error?.message}`);
  return data.signedUrl;
}

/** Тянет файл в память. */
export async function fetchBytes(url: string): Promise<Uint8Array> {
  let location: URL;
  try { location = new URL(url); }
  catch { throw new Error('fetchBytes invalid_location'); }
  const owned = location.origin === new URL(env.SUPABASE_URL).origin && location.pathname.startsWith('/storage/v1/object/');
  const provider = ['polza.ai','replicate.delivery','fal.media'].some((host) => location.hostname === host || location.hostname.endsWith(`.${host}`));
  if (location.username || location.password || (!owned && (!provider || location.protocol !== 'https:' || location.port))) {
    throw new Error('fetchBytes invalid_location');
  }
  // Keep every download failure in the retryable storage category. In particular,
  // fetch() throws a raw TimeoutError on a slow provider CDN: passing that through
  // used to fail a job permanently after its paid image had already succeeded.
  // process-job retries this same saved result URL; its watchdog bounds retries.
  // Use HTTP/1 for this CDN; provider APIs keep their normal client. Limit the
  // workaround to the file host and close only after consuming/cancelling the body.
  let client: Deno.HttpClient | undefined;
  const started = Date.now();
  let phase = 'headers';
  try {
    let res: Response;
    try {
      if (location.hostname === 's3.polza.ai') {
        client = Deno.createHttpClient({ http1: true, http2: false });
      }
      res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: 'error',
        ...(client ? { client } : {}),
      });
    } catch (error) {
      const timeout = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
      throw new Error(timeout ? 'fetchBytes timeout' : 'fetchBytes network');
    }
    if (!res.ok) {
      void res.body?.cancel().catch(() => {});
      throw new Error(`fetchBytes http_${res.status}`);
    }
    phase = 'body';
    try {
      return await readBodyBytes(res, 20 * 1024 * 1024, FETCH_TIMEOUT_MS);
    } catch (error) {
      void res.body?.cancel().catch(() => {});
      const timeout = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
      const reason = error instanceof BodyError ? error.code : timeout ? 'timeout' : 'body_unavailable';
      throw new Error(`fetchBytes ${reason}`);
    }
  } catch (error) {
    if (location.hostname === 's3.polza.ai') {
      console.error('result download deferred', { phase, elapsedMs: Date.now() - started });
    }
    throw error;
  } finally {
    client?.close();
  }
}

/** Кладёт готовую картинку в bucket — с долгим кешем, она не меняется. */
export async function uploadBytes(
  bucket: string,
  path: string,
  bytes: Uint8Array,
  contentType = 'image/jpeg',
): Promise<string> {
  const { error } = await db.storage.from(bucket).upload(path, bytes, {
    upsert: true,
    contentType,
    cacheControl: bucket === 'results' ? '3600' : IMMUTABLE_CACHE,
  });
  if (error) throw new Error(`uploadBytes: ${error.message}`);
  return path;
}
