// POST /sign-upload
// Body: { filename, contentType }
// Returns: { uploadUrl, photoPath, token }
import { authorize, corsPreflight, jsonResponse } from '../_shared/auth.ts';
import { db } from '../_shared/db.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight();
  if (req.method !== 'POST') return jsonResponse({ error: 'method' }, { status: 405 });

  const auth = await authorize(req);
  if ('response' in auth) return auth.response;
  const tg = auth.user;

  let body: { filename?: string; contentType?: string };
  try { body = await req.json(); }
  catch { return jsonResponse({ error: 'bad_json' }, { status: 400 }); }

  const filename = (body.filename ?? 'photo.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
  const ext = filename.includes('.') ? filename.split('.').pop() : 'jpg';
  const photoPath = `${tg.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  const { data, error } = await db.storage
    .from('photos')
    .createSignedUploadUrl(photoPath);

  if (error || !data) return jsonResponse({ error: error?.message ?? 'sign_failed' }, { status: 500 });

  return jsonResponse({
    uploadUrl: data.signedUrl,
    photoPath: data.path ?? photoPath,
    token: data.token,
  });
});
