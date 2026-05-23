// GET /me — вернёт профиль текущего пользователя (по Telegram initData)
// и upsert его в таблицу users при первом запросе.
import { corsPreflight, jsonResponse, verifyInitData } from '../_shared/auth.ts';
import { db } from '../_shared/db.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight();

  const initData = req.headers.get('x-telegram-initdata') ?? '';
  const tg = await verifyInitData(initData);
  if (!tg) return jsonResponse({ error: 'unauthorized' }, { status: 401 });

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
