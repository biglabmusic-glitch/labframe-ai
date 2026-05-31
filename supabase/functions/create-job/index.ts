// POST /create-job
// Принимает: { photoPath, workType?, style, format, branding, textType }
// photoPath — путь в bucket 'photos' (фронт загружает фото через подписанный URL).
// Возвращает: { id, status: 'created' }
// Дальше воркер process-job (cron / pg_net) подхватывает job в статусе 'created'.
import { authorize, corsPreflight, jsonResponse } from '../_shared/auth.ts';
import { db } from '../_shared/db.ts';
import { resolveDecor } from '../_shared/decor.ts';

interface Body {
  photoPath: string;
  workType?: 'crown' | 'veneer' | 'bridge' | 'other';
  style: 'clean' | 'dark' | 'soft';
  format: '4x5' | '1x1' | '9x16';
  branding: 'logo' | 'name' | 'none';
  textType: 'short' | 'sell' | 'tech' | 'none';
  decorPreset?: string;     // id пресета / 'custom' / отсутствует = без декора
  decorAddition?: string;   // текст для 'custom'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight();
  if (req.method !== 'POST') return jsonResponse({ error: 'method' }, { status: 405 });

  const auth = await authorize(req);
  if ('response' in auth) return auth.response;
  const tg = auth.user;

  // Гарантируем, что юзер существует в БД (FK jobs.user_id → users.id).
  // Без этого первый запрос юзера падает с violates foreign key constraint,
  // если фронт не успел дёрнуть /me перед /create-job.
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

  // Проверяем ban — админ из /admin мог забанить юзера.
  const { data: userRow } = await db.from('users').select('banned').eq('id', tg.id).maybeSingle();
  if (userRow?.banned) {
    return jsonResponse({ error: 'banned' }, { status: 403 });
  }

  // Rate-limit per user: не больше 2 активных job одновременно (анти-спам, двойной клик).
  const { count } = await db
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', tg.id)
    .in('status', ['created', 'processing']);

  if ((count ?? 0) >= 2) {
    return jsonResponse({ error: 'too_many_in_progress' }, { status: 429 });
  }

  let body: Body;
  try { body = await req.json(); }
  catch { return jsonResponse({ error: 'bad_json' }, { status: 400 }); }

  const missing: string[] = [];
  if (!body.photoPath) missing.push('photoPath');
  if (!body.style)     missing.push('style');
  if (!body.format)    missing.push('format');
  if (missing.length) {
    return jsonResponse({ error: 'missing_fields', missing }, { status: 400 });
  }

  // Декор: резолвим выбор в {surface, addition}. null = декора нет.
  const decor = resolveDecor(body.decorPreset, body.decorAddition, body.style);

  // Premium-гейт: декор-генерации сверх лимита требуют подписки.
  if (decor) {
    const { data: u } = await db
      .from('users')
      .select('premium_used, premium_limit')
      .eq('id', tg.id)
      .maybeSingle();
    if ((u?.premium_used ?? 0) >= (u?.premium_limit ?? 3)) {
      return jsonResponse({ error: 'needs_subscription' }, { status: 402 });
    }
  }

  const { data: job, error } = await db
    .from('jobs')
    .insert({
      user_id: tg.id,
      photo_path: body.photoPath,
      work_type: body.workType ?? null,
      style: body.style,
      format: body.format,
      branding: body.branding ?? 'none',
      text_type: body.textType ?? 'short',
      decor_preset:   decor ? body.decorPreset : null,
      decor_surface:  decor?.surface  ?? null,
      decor_addition: decor?.addition ?? null,
      status: 'created',
    })
    .select('id, status')
    .single();

  if (error) {
    if (error.message.includes('usage_limit_reached')) {
      return jsonResponse({ error: 'usage_limit_reached' }, { status: 402 });
    }
    return jsonResponse({ error: error.message }, { status: 500 });
  }

  // Триггерим process-job асинхронно — пользователю отдаём id сразу,
  // обработка идёт фоном (15–25 сек), фронт опрашивает get-job до done.
  const internalSecret = Deno.env.get('INTERNAL_SECRET') ?? '';
  const supabaseUrl    = Deno.env.get('SUPABASE_URL')    ?? '';
  // @ts-expect-error EdgeRuntime is provided by Supabase Edge Runtime
  EdgeRuntime.waitUntil(
    fetch(`${supabaseUrl}/functions/v1/process-job`, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-internal-secret': internalSecret,
      },
      body: '{}',
    }).catch((e) => console.error('process-job trigger failed', e)),
  );

  return jsonResponse({ id: job.id, status: job.status });
});
