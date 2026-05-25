// POST /save-brand — upsert бренда текущего пользователя.
// Принимает camelCase, кладёт в БД snake_case.
// Лого как файл здесь НЕ обновляется — он загружается отдельным потоком (storage upload).
// Если в теле пришёл logoFileName="" или null — это знак «удалили лого», обнуляем logo_path.
import { authorize, corsPreflight, jsonResponse } from '../_shared/auth.ts';
import { db } from '../_shared/db.ts';

interface Body {
  masterName?: string | null;
  labName?: string | null;
  defaultStyle?: 'clean' | 'dark' | 'soft' | null;
  logoPlacement?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  hashtags?: string[];
  // Передаётся когда юзер удалил лого через UI (logoUrl=undefined),
  // тогда в БД logo_path занулим. Когда лого было загружено — поле приходит непустое.
  removeLogo?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight();
  if (req.method !== 'POST') return jsonResponse({ error: 'method' }, { status: 405 });

  const auth = await authorize(req);
  if ('response' in auth) return auth.response;
  const tg = auth.user;

  let body: Body;
  try { body = await req.json(); }
  catch { return jsonResponse({ error: 'bad_json' }, { status: 400 }); }

  // Гарантируем, что user-row есть (FK brand.user_id → users.id).
  await db.from('users').upsert(
    {
      id: tg.id,
      username:   tg.username   ?? null,
      first_name: tg.first_name ?? null,
      last_name:  tg.last_name  ?? null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'id', ignoreDuplicates: false },
  );

  const patch: Record<string, unknown> = {
    user_id:        tg.id,
    master_name:    body.masterName?.trim() || null,
    lab_name:       body.labName?.trim() || null,
    default_style:  body.defaultStyle ?? null,
    logo_placement: body.logoPlacement ?? 'bottom-right',
    hashtags:       body.hashtags ?? [],
    updated_at:     new Date().toISOString(),
  };
  if (body.removeLogo) patch.logo_path = null;

  const { error } = await db.from('brand').upsert(patch, { onConflict: 'user_id' });
  if (error) return jsonResponse({ error: error.message }, { status: 500 });

  return jsonResponse({ ok: true });
});
