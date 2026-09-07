// Утилиты для работы со Storage: подписанные URL для входного фото,
// upload результирующего изображения по HTTP.
import { db } from './db.ts';

export async function signUrl(bucket: string, path: string, ttlSec = 60 * 10): Promise<string> {
  const { data, error } = await db.storage.from(bucket).createSignedUrl(path, ttlSec);
  if (error || !data) throw new Error(`signUrl ${bucket}/${path}: ${error?.message}`);
  return data.signedUrl;
}

export async function uploadFromUrl(
  bucket: string,
  path: string,
  url: string,
): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`uploadFromUrl fetch ${res.status}`);
  const blob = await res.blob();
  const { error } = await db.storage.from(bucket).upload(path, blob, {
    upsert: true,
    contentType: blob.type || 'image/jpeg',
  });
  if (error) throw new Error(`uploadFromUrl: ${error.message}`);
  return path;
}

/** Тянет файл в память. Нужен, когда картинку надо изменить перед сохранением. */
export async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetchBytes ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Кладёт готовые байты в bucket. Нужен, когда картинку перед сохранением меняем. */
export async function uploadBytes(
  bucket: string,
  path: string,
  bytes: Uint8Array,
  contentType = 'image/jpeg',
): Promise<string> {
  const { error } = await db.storage.from(bucket).upload(path, bytes, {
    upsert: true,
    contentType,
  });
  if (error) throw new Error(`uploadBytes: ${error.message}`);
  return path;
}

export function publicUrl(bucket: string, path: string): string {
  const { data } = db.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
