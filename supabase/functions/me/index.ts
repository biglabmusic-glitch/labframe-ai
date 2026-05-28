// GET /me — вернёт профиль текущего пользователя (по Telegram initData)
// и upsert его в таблицу users при первом запросе.
// Бренд возвращается в camelCase (фронт не должен заниматься маппингом),
// логотип — как подписанный URL из bucket 'brand' (TTL сутки).
import { authorize, corsPreflight, jsonResponse } from '../_shared/auth.ts';
import { db } from '../_shared/db.ts';
import { signUrl } from '../_shared/storage.ts';

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

  // ADMIN_IDS — «супер-админ bootstrap»: такие id всегда админы. Синхронизируем
  // флаг в БД, чтобы админы реально отражались в Supabase (а не только в env).
  // Никогда не сбрасываем is_admin в false отсюда — снятие только через /admin.
  const adminIds = (Deno.env.get('ADMIN_IDS') ?? '')
    .split(',').map((s) => Number(s.trim())).filter(Boolean);
  const envIsAdmin = adminIds.includes(tg.id);
  if (envIsAdmin) {
    try { await db.from('users').update({ is_admin: true }).eq('id', tg.id); }
    catch { /* колонка is_admin могла ещё не появиться — не валим /me */ }
  }

  const { data: user } = await db.from('users').select('*').eq('id', tg.id).single();
  const { data: brand } = await db.from('brand').select('*').eq('user_id', tg.id).maybeSingle();

  // Маппим бренд в camelCase + подписываем логотип (если есть).
  let brandOut: Record<string, unknown> | null = null;
  if (brand) {
    let logoUrl: string | undefined;
    if (brand.logo_path) {
      try {
        logoUrl = await signUrl('brand', brand.logo_path, 60 * 60 * 24);
      } catch {
        // если лого пропал из storage — просто не возвращаем url, бренд остальной не теряем
      }
    }
    brandOut = {
      masterName:    brand.master_name ?? undefined,
      labName:       brand.lab_name ?? undefined,
      defaultStyle:  brand.default_style ?? undefined,
      logoPlacement: brand.logo_placement ?? 'bottom-right',
      hashtags:      brand.hashtags ?? [],
      logoUrl,
      logoFileName:  brand.logo_path ? brand.logo_path.split('/').pop() : undefined,
      fontId:        brand.font_id ?? undefined,
    };
  }

  // isAdmin = флаг из БД (назначаемые админы) ИЛИ env ADMIN_IDS (bootstrap).
  // Фронт показывает админ-плашку по этому флагу.
  const isAdmin = Boolean(user?.is_admin) || envIsAdmin;

  return jsonResponse({
    user: user ? {
      telegramId: user.id,
      username:   user.username ?? undefined,
      firstName:  user.first_name ?? undefined,
      lastName:   user.last_name ?? undefined,
      photoUrl:   user.photo_url ?? undefined,
      plan:       user.plan ?? 'free',
      usageUsed:  user.usage_used ?? 0,
      usageLimit: user.usage_limit ?? 3,
      isAdmin,
    } : null,
    brand: brandOut,
  });
});
