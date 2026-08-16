// POST /process-job  (вызывается напрямую из create-job ИЛИ pg_cron каждые 10 сек)
// Body: { jobId? } — если передан, берём именно этот job; иначе первый в очереди.
// Обрабатывает job (Image AI + Text AI), апдейтит статус, шлёт результат в чат через бота.
// Перед выбором добивает зависшие job-ы (см. sweepStale).
import { jsonResponse } from '../_shared/auth.ts';
import { db } from '../_shared/db.ts';
import { processImage } from '../_shared/replicate.ts';
import { generateText } from '../_shared/polza.ts';
import { signUrl, uploadFromUrl, publicUrl } from '../_shared/storage.ts';
import { sendPhoto } from '../_shared/telegram.ts';
import { buildPersonalizedPrompt } from '../_shared/agent.ts';

Deno.serve(async (req) => {
  // Защита: пускаем только если есть internal-secret в заголовке.
  // pg_cron триггерит функцию с этим заголовком (см. миграцию).
  const secret = req.headers.get('x-internal-secret');
  if (secret !== Deno.env.get('INTERNAL_SECRET')) {
    return jsonResponse({ error: 'forbidden' }, { status: 403 });
  }

  // create-job передаёт id только что созданного job — лочим именно его.
  // Cron и ручной вызов шлют пустое тело, тогда идём по общей очереди.
  let preferredId: string | undefined;
  try {
    const body = await req.json() as { jobId?: string } | null;
    if (typeof body?.jobId === 'string') preferredId = body.jobId;
  } catch { /* пустое или кривое тело — работаем по очереди */ }

  await sweepStale();

  const job = await pickJob(preferredId);
  if (!job) return jsonResponse({ ok: true, picked: 0 });

  try {
    const { data: brand } = await db.from('brand').select('*').eq('user_id', job.user_id).maybeSingle();

    // 1. Подписанные URL: входное фото (всегда) + логотип бренда (если ветка 'logo')
    const photoUrl = await signUrl('photos', job.photo_path, 60 * 15);
    const logoUrl  = job.branding === 'logo' && brand?.logo_path
      ? await signUrl('brand', brand.logo_path, 60 * 15)
      : undefined;

    // 2. AI-агент (опц., через env): vision-анализ фото + бренд + история → кастомный промт.
    //    AGENT_DISABLED=true — пропускаем, идём по дефолтным правилам.
    //    Это даёт быстрый kill-switch, если агент валится или раздувает таймаут процессинга.
    const hasDecor = Boolean(job.decor_preset);
    const agentDisabled = Deno.env.get('AGENT_DISABLED') === 'true';
    let agentResult: Awaited<ReturnType<typeof buildPersonalizedPrompt>> = null;

    if (!agentDisabled && !hasDecor) {
      // Память агента: 10 последних done-jobs юзера + их фидбэк (если есть).
      // Используем idx_jobs_user_done_created.
      const { data: prevJobs } = await db
        .from('jobs')
        .select('style, format, work_type, branding, created_at, feedback')
        .eq('user_id', job.user_id)
        .eq('status', 'done')
        .order('created_at', { ascending: false })
        .limit(10);

      agentResult = await buildPersonalizedPrompt({
        photoUrl,
        style:    job.style,
        format:   job.format,
        branding: job.branding,
        workType: job.work_type ?? undefined,
        brand: {
          masterName:    brand?.master_name ?? undefined,
          labName:       brand?.lab_name ?? undefined,
          defaultStyle:  brand?.default_style ?? undefined,
          logoPlacement: brand?.logo_placement ?? undefined,
          hashtags:      brand?.hashtags ?? [],
          hasLogo:       Boolean(brand?.logo_path),
          fontDescription: brand?.font_id ? describeFontForPrompt(brand.font_id) : undefined,
        },
        history: (prevJobs ?? []).map((p) => ({
          style:     p.style,
          format:    p.format,
          workType:  p.work_type ?? undefined,
          branding:  p.branding ?? undefined,
          createdAt: p.created_at,
          feedback:  p.feedback ?? null,
        })),
      });

      if (agentResult) {
        await logAi(job.id, 'agent', Deno.env.get('POLZA_AGENT_MODEL') ?? 'gpt-4o-mini', agentResult.durationMs, true, {
          prompt_tokens: agentResult.promptTokens,
          completion_tokens: agentResult.completionTokens,
        });
        console.log(`agent[${job.id}] model=${agentResult.model} notes="${agentResult.notes}"`);
      } else {
        await logAi(job.id, 'agent', 'fallback', 0, false, undefined, 'agent returned null, using default prompt');
      }
    }

    // 3. Image AI — используем кастомный промт агента (если есть).
    //    Выбор модели НЕ от агента: модель управляется env IMAGE_PROVIDER (сейчас polza),
    //    чтобы не вынуждать агента знать о текущем платёжном провайдере.
    const t0 = Date.now();
    const img = await processImage({
      photoUrl,
      logoUrl,
      style:         job.style,
      format:        job.format,
      customPrompt:  hasDecor ? undefined : agentResult?.prompt,
      decor:         hasDecor ? { surface: job.decor_surface, addition: job.decor_addition } : undefined,
    });
    await logAi(job.id, 'image-ai', img.provider, img.durationMs, true);

    // 3. Скачать результат и положить в bucket 'results'
    const resultPath = `${job.user_id}/${job.id}.jpg`;
    await uploadFromUrl('results', resultPath, img.imageUrl);

    // 4. Text AI
    const text = await generateText({
      workType: job.work_type ?? undefined,
      textType: job.text_type,
      masterName: brand?.master_name ?? undefined,
      brandHashtags: brand?.hashtags ?? [],
    });
    if (text.durationMs > 0) {
      await logAi(job.id, 'polza', Deno.env.get('POLZA_MODEL') ?? 'gpt-4o-mini', text.durationMs, true, {
        prompt_tokens: text.promptTokens,
        completion_tokens: text.completionTokens,
      });
    }

    // 5. Сохранить (включая «учебные» поля: какой промт реально ушёл в модель + outputs агента)
    await db.from('jobs').update({
      status: 'done',
      result_path: resultPath,
      caption_main: text.main,
      caption_alt: text.alt,
      hashtags: text.hashtags,
      finished_at: new Date().toISOString(),
      prompt_used: agentResult?.prompt ?? null,
      model_used: img.provider,
      agent_notes: agentResult?.notes ?? null,
    }).eq('id', job.id);

    // 6. Пуш в чат
    try {
      const captionFull = [
        text.main,
        '',
        text.hashtags.join(' '),
      ].filter(Boolean).join('\n');
      await sendPhoto(Number(job.user_id), publicUrl('results', resultPath), captionFull);
    } catch (e) {
      // Самый частый случай — юзер не начинал диалог с ботом: Telegram запрещает
      // боту писать первым (403 «bot can't initiate conversation with a user»).
      // Результат уже готов и виден в мини-аппе, поэтому job не валим. Но пишем
      // в ai_calls: иначе провал не видно нигде, кроме логов функции, а именно
      // он ломает обещание «свернём Telegram — пришлём уведомление».
      const message = e instanceof Error ? e.message : String(e);
      console.error('telegram push failed', message);
      await logAi(job.id, 'telegram', 'sendPhoto', 0, false, undefined, message);
    }

    console.log(`job ${job.id} done in ${Date.now() - t0}ms`);
    return jsonResponse({ ok: true, jobId: job.id, status: 'done' });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.from('jobs').update({
      status: 'failed',
      error_message: message,
      finished_at: new Date().toISOString(),
    }).eq('id', job.id);
    await logAi(job.id, 'pipeline', 'n/a', 0, false, undefined, message);
    return jsonResponse({ ok: false, jobId: job.id, error: message }, { status: 500 });
  }
});

// Сколько кандидатов пробуем забрать за один проход и сколько раз перечитываем очередь.
const PICK_ATTEMPTS = 5;

// Пороги «зависших» job-ов для watchdog-а ниже.
// processing — воркер умер или Replicate не ответил (нормальная обработка < 2 мин).
// created    — триггер из create-job не доехал и никто job так и не подобрал.
const STALE_PROCESSING_MIN = 5;
const STALE_CREATED_MIN = 15;

function minutesAgo(min: number): string {
  return new Date(Date.now() - min * 60_000).toISOString();
}

/**
 * Оптимистическая блокировка: ставим processing, только если статус всё ещё created.
 * Вернёт полную строку job или null, если её уже забрал другой воркер
 * (без этой проверки второй воркер тратил бы деньги Replicate на тот же job).
 */
async function lockJob(id: string) {
  const { data } = await db
    .from('jobs')
    .update({ status: 'processing', started_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'created')
    .select('*')
    .maybeSingle();
  return data ?? null;
}

/**
 * Выбирает job в работу.
 * 1. Если create-job передал свой jobId — забираем именно его, гонки за чужой job нет.
 * 2. Иначе (или если наш уже забрали) — идём по очереди, пробуя несколько кандидатов
 *    подряд и перечитывая её.
 *
 * Раньше воркер брал только самый старый job и при проигранной гонке выходил ни с чем.
 * Два одновременных create-job выбирали одного и того же кандидата, проигравший
 * возвращал lost_race — и второй job оставался в created навсегда, потому что
 * pg_cron (0002_cron.sql) на проекте не включён и подобрать его было некому.
 */
async function pickJob(preferredId?: string) {
  if (preferredId) {
    const mine = await lockJob(preferredId);
    if (mine) return mine;
  }

  for (let attempt = 0; attempt < PICK_ATTEMPTS; attempt++) {
    const { data: candidates, error } = await db
      .from('jobs')
      .select('id')
      .eq('status', 'created')
      .order('created_at', { ascending: true })
      .limit(PICK_ATTEMPTS);

    if (error) {
      console.error('pickJob query failed:', error.message);
      return null;
    }
    if (!candidates?.length) return null;

    for (const c of candidates) {
      const locked = await lockJob(c.id);
      if (locked) return locked;
    }
  }
  return null;
}

/**
 * Добивает зависшие job-ы, чтобы они не висели вечно: фронт из-за таких крутил
 * спиннер без конца, а rate-limit в create-job считал их активными и блокировал юзера.
 *
 * Намеренно дублирует cron из 0003_watchdog.sql: pg_cron на проекте может быть
 * не включён, а воркер стартует на каждое создание job — то есть система
 * самовосстанавливается при первом же действии любого пользователя.
 * Ошибки только логируем: сбой уборки не должен мешать основной обработке.
 */
async function sweepStale() {
  const now = new Date().toISOString();
  try {
    const { error: procErr } = await db
      .from('jobs')
      .update({ status: 'failed', error_message: 'timeout', finished_at: now })
      .eq('status', 'processing')
      .lt('started_at', minutesAgo(STALE_PROCESSING_MIN));
    if (procErr) console.error('sweepStale processing:', procErr.message);

    const { error: createdErr } = await db
      .from('jobs')
      .update({ status: 'failed', error_message: 'not_picked_up', finished_at: now })
      .eq('status', 'created')
      .lt('created_at', minutesAgo(STALE_CREATED_MIN));
    if (createdErr) console.error('sweepStale created:', createdErr.message);
  } catch (e) {
    console.error('sweepStale threw:', e instanceof Error ? e.message : e);
  }
}

// Маппинг шрифта (id из app/src/lib/fonts.ts) → описание для image-промта.
// Дублирование с фронтом намеренное: edge-функции не разделяют код с app/.
// При добавлении шрифта в fonts.ts нужно синхронно обновить эту таблицу.
function describeFontForPrompt(fontId: string): string | undefined {
  const map: Record<string, string> = {
    inter:      'modern minimal sans-serif, regular weight, neutral',
    playfair:   'classical high-contrast serif with elegant thin strokes, luxury editorial feel',
    cormorant:  'thin elegant garamond-style serif, refined, delicate',
    cinzel:     'classical Roman capitals, all-caps, monumental and premium',
    italiana:   'fashion magazine style serif, very thin, feminine elegant',
    bodoni:     'high-contrast Bodoni serif, ultra-thin hairlines, fashion editorial',
    montserrat: 'clean geometric sans-serif, even strokes, modern lifestyle brand feel',
    tenor:      'minimalist thin sans-serif, wide proportions, gallery signage feel',
  };
  return map[fontId];
}

// Логирование AI-вызовов в ai_calls. Любая ошибка здесь — только console.error,
// НИКОГДА не throw: иначе сбой логирования валит весь пайплайн обработки job.
// Раньше этот выброс из logAi (вероятно) был причиной «load failed» при включённом агенте.
async function logAi(
  jobId: string,
  provider: string,
  model: string,
  durationMs: number,
  ok: boolean,
  tokens?: { prompt_tokens?: number; completion_tokens?: number },
  error?: string,
) {
  try {
    const { error: insertErr } = await db.from('ai_calls').insert({
      job_id: jobId,
      provider,
      model,
      duration_ms: durationMs,
      prompt_tokens: tokens?.prompt_tokens ?? null,
      completion_tokens: tokens?.completion_tokens ?? null,
      ok,
      error: error ?? null,
    });
    if (insertErr) console.error(`[logAi:${provider}] insert failed:`, insertErr.message);
  } catch (e) {
    console.error(`[logAi:${provider}] threw:`, e instanceof Error ? e.message : e);
  }
}
