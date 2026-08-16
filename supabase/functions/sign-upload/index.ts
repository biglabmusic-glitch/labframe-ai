// POST /sign-upload
// Body: { filename, contentType, kind?: 'photo' | 'logo' (default 'photo') }
// Returns: { uploadUrl, photoPath, token }
//
// kind='photo' → bucket 'photos' (фото работы для AI-обработки)
// kind='logo'  → bucket 'brand'  (логотип бренда мастера)
import { authorize, corsPreflight, jsonResponse } from '../_shared/auth.ts';
import { db } from '../_shared/db.ts';

// Расширения, которые сохраняем как есть. Всё остальное превращаем в jpg.
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'avif', 'gif']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight();
  if (req.method !== 'POST') return jsonResponse({ error: 'method' }, { status: 405 });

  const auth = await authorize(req);
  if ('response' in auth) return auth.response;
  const tg = auth.user;

  let body: { filename?: string; contentType?: string; kind?: 'photo' | 'logo' };
  try { body = await req.json(); }
  catch { return jsonResponse({ error: 'bad_json' }, { status: 400 }); }

  const kind = body.kind === 'logo' ? 'logo' : 'photo';
  const bucket = kind === 'logo' ? 'brand' : 'photos';

  // Принимаем только картинки. Проверяем именно префикс image/, а не белый список
  // подтипов: iOS шлёт heic/heif, Android — webp, и запрещать их нельзя.
  // Пустой contentType пропускаем — некоторые мобильные WebView не проставляют его,
  // и отказ здесь сломал бы загрузку у части живых юзеров.
  const contentType = body.contentType?.trim() ?? '';
  if (contentType && !contentType.startsWith('image/')) {
    return jsonResponse({ error: 'unsupported_type' }, { status: 400 });
  }

  const filename = (body.filename ?? `${kind}.jpg`).replace(/[^a-zA-Z0-9._-]/g, '_');
  const rawExt = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : '';
  // Расширение идёт в путь объекта, поэтому неизвестное сводим к jpg —
  // чтобы в bucket не оседали пути вида `<id>/….exe`.
  const ext = IMAGE_EXTENSIONS.has(rawExt) ? rawExt : 'jpg';
  const path = `${tg.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  const { data, error } = await db.storage
    .from(bucket)
    .createSignedUploadUrl(path);

  if (error || !data) return jsonResponse({ error: error?.message ?? 'sign_failed' }, { status: 500 });

  return jsonResponse({
    uploadUrl: data.signedUrl,
    photoPath: data.path ?? path,    // оставляем имя поля для обратной совместимости с upload-фото
    token: data.token,
  });
});
