// GET /me — вернёт профиль текущего пользователя (по Telegram initData)
// и upsert его в таблицу users при первом запросе.
import { authorize, corsPreflight, jsonResponse } from '../_shared/auth.ts';
import { db } from '../_shared/db.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight();

  const auth = await authorize(req);
  if ('response' in auth) return auth.response;
  const tg = auth.user;

  // upsert user
  await db.from('users').upsert(
    {
      id: tg.id,
      username:      tg.username      ?? null,
      first_name:    tg.first_name    ?? null,
      last_name:     tg.last_name     ?? null,
      photo_url:     tg.photo_url     ?? null,
      language_code: tg.language_code ?? 'ru',
      last_seen_at:  new Date().toISOString(),
    },
    { onConflict: 'id', ignoreDuplicates: false },
  );

  const { data: user } = await db.from('users').select('*').eq('id', tg.id).single();
  const { data: brand } = await db.from('brand').select('*').eq('user_id', tg.id).maybeSingle();

  return jsonResponse({ user, brand });
});
