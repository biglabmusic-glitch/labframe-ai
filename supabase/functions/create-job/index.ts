// POST /create-job
// Принимает: { photoPath, workType?, style, format, branding, textType }
// photoPath — путь в bucket 'photos' (фронт загружает фото через подписанный URL).
// Возвращает: { id, status: 'created' }
// Дальше воркер process-job (cron / pg_net) подхватывает job в статусе 'created'.
import { authorize, corsPreflight, jsonResponse } from '../_shared/auth.ts';
import { creditCost } from '../_shared/credits.ts';
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

// Через сколько минут активный job считается зависшим и перестаёт занимать слот
// в rate-limit. Должно быть не меньше порогов sweepStale в process-job.
const STALE_ACTIVE_MIN = 15;

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
  // Считаем только свежие: job старше STALE_ACTIVE_MIN — это зависший хвост, его
  // добьёт sweepStale в воркере. Раньше пара таких намертво блокировала юзера
  // ошибкой too_many_in_progress, и починить это можно было только руками в БД.
  const { count } = await db
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', tg.id)
    .in('status', ['created', 'processing'])
    .gte('created_at', new Date(Date.now() - STALE_ACTIVE_MIN * 60_000).toISOString());

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

  // Лимиты — один выключатель на весь бэк: LIMITS_DISABLED != '0' (по умолчанию ВКЛ)
  // значит демо-период, всё открыто всем.
  //
  // Баланс проверяем здесь, а не триггером enforce_usage_limit: тот снят
  // миграцией 0005 и возвращать его не нужно, иначе «включить оплату» означало
  // бы ещё и накатить миграцию на прод в момент запуска продаж.
  // Включение оплаты: supabase secrets set LIMITS_DISABLED=0
  //
  // Здесь только гейт. Само списание — в триггере spend_credits_on_done, по
  // факту done: за упавшую генерацию пользователь платить не должен.
  const cost = creditCost(decor ? body.decorPreset : null);
  const limitsDisabled = (Deno.env.get('LIMITS_DISABLED') ?? '1') !== '0';
  if (!limitsDisabled) {
    const { data: u } = await db
      .from('users')
      .select('credits')
      .eq('id', tg.id)
      .maybeSingle();

    // needed/have отдаём наружу: фронту нужно показать «нужно 3, у вас 1».
    if ((u?.credits ?? 0) < cost) {
      return jsonResponse(
        { error: 'insufficient_credits', needed: cost, have: u?.credits ?? 0 },
        { status: 402 },
      );
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
    return jsonResponse({ error: error.message }, { status: 500 });
  }

  // Триггерим process-job асинхронно — пользователю отдаём id сразу,
  // обработка идёт фоном (15–25 сек), фронт опрашивает get-job до done.
  // Передаём jobId: воркер заберёт именно этот job, а не «самый старый в очереди»,
  // иначе два одновременных create-job дрались за одного кандидата и один из job-ов
  // мог остаться необработанным.
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
      body: JSON.stringify({ jobId: job.id }),
    }).catch((e) => console.error('process-job trigger failed', e)),
  );

  return jsonResponse({ id: job.id, status: job.status });
});
