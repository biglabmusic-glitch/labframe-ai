// Утилиты для работы со Storage: подписанные URL для входного фото,
// загрузка готовых картинок.
import { db } from './db.ts';
import { env } from './env.ts';
import { readBodyBytes } from './http-body.ts';

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
const FETCH_TIMEOUT_MS = 30_000;

export async function signUrl(bucket: string, path: string, ttlSec = 60 * 10): Promise<string> {
  const { data, error } = await db.storage.from(bucket).createSignedUrl(path, ttlSec);
  if (error || !data) throw new Error(`signUrl ${bucket}/${path}: ${error?.message}`);
  return data.signedUrl;
}

/** Тянет файл в память. */
export async function fetchBytes(url: string): Promise<Uint8Array> {
  const location = new URL(url);
  const owned = location.origin === new URL(env.SUPABASE_URL).origin && location.pathname.startsWith('/storage/v1/object/');
  const provider = ['polza.ai','replicate.delivery','fal.media'].some((host) => location.hostname === host || location.hostname.endsWith(`.${host}`));
  if (location.username || location.password || (!owned && (!provider || location.protocol !== 'https:' || location.port))) {
    throw new Error('fetchBytes invalid_location');
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: 'error' });
  if (!res.ok) throw new Error(`fetchBytes ${res.status}`);
  return await readBodyBytes(res, 20 * 1024 * 1024, FETCH_TIMEOUT_MS);
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
