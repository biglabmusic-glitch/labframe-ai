// POST /process-job  (вызывается pg_cron каждые 10 сек ИЛИ напрямую из create-job)
// Берёт первый job в статусе 'created', обрабатывает (Image AI + Text AI),
// апдейтит статус, шлёт уведомление в чат через бота.
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

  // Берём один job в работу атомарно
  const { data: jobs, error: pickErr } = await db
    .from('jobs')
    .select('*')
    .eq('status', 'created')
    .order('created_at', { ascending: true })
    .limit(1);

  if (pickErr) return jsonResponse({ error: pickErr.message }, { status: 500 });
  if (!jobs?.length) return jsonResponse({ ok: true, picked: 0 });

  const job = jobs[0];

  // Оптимистическая блокировка: ставим processing только если статус всё ещё created.
  // Проверяем, что строка действительно обновилась — иначе job уже забрал другой воркер
  // (без этого второй воркер тратил бы деньги Replicate на тот же job).
  const { data: locked, error: lockErr } = await db
    .from('jobs')
    .update({ status: 'processing', started_at: new Date().toISOString() })
    .eq('id', job.id)
    .eq('status', 'created')
    .select('id')
    .maybeSingle();

  if (lockErr) return jsonResponse({ error: lockErr.message }, { status: 500 });
  if (!locked)  return jsonResponse({ ok: true, picked: 0, reason: 'lost_race' });

  try {
    const { data: brand } = await db.from('brand').select('*').eq('user_id', job.user_id).maybeSingle();

    // 1. Подписанные URL: входное фото (всегда) + логотип бренда (если ветка 'logo')
    const photoUrl = await signUrl('photos', job.photo_path, 60 * 15);
    const logoUrl  = job.branding === 'logo' && brand?.logo_path
      ? await signUrl('brand', brand.logo_path, 60 * 15)
      : undefined;

    // 2. AI-агент: vision-анализ фото + бренд + история → кастомный промт и выбор модели.
    //    Тянем последние 5 done-jobs юзера для контекста стилевых предпочтений.
    const { data: prevJobs } = await db
      .from('jobs')
      .select('style, format, work_type')
      .eq('user_id', job.user_id)
      .eq('status', 'done')
      .order('created_at', { ascending: false })
      .limit(5);

    const agentResult = await buildPersonalizedPrompt({
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
      },
      history: (prevJobs ?? []).map((p) => ({
        style:    p.style,
        format:   p.format,
        workType: p.work_type ?? undefined,
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

    // 3. Image AI — используем промт и модель агента, или fallback на дефолтную логику.
    const t0 = Date.now();
    const img = await processImage({
      photoUrl,
      logoUrl,
      style:         job.style,
      format:        job.format,
      customPrompt:  agentResult?.prompt,
      forceProvider: agentResult?.model,
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

    // 5. Сохранить
    await db.from('jobs').update({
      status: 'done',
      result_path: resultPath,
      caption_main: text.main,
      caption_alt: text.alt,
      hashtags: text.hashtags,
      finished_at: new Date().toISOString(),
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
      console.error('telegram push failed', e);
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

async function logAi(
  jobId: string,
  provider: string,
  model: string,
  durationMs: number,
  ok: boolean,
  tokens?: { prompt_tokens?: number; completion_tokens?: number },
  error?: string,
) {
  await db.from('ai_calls').insert({
    job_id: jobId,
    provider,
    model,
    duration_ms: durationMs,
    prompt_tokens: tokens?.prompt_tokens ?? null,
    completion_tokens: tokens?.completion_tokens ?? null,
    ok,
    error: error ?? null,
  });
}
