// Each invocation advances one leased job. Cron and owner polling resume provider IDs.
import { jsonResponse } from '../_shared/auth.ts';
import { db } from '../_shared/db.ts';
import { buildImageInput, type FormatId, type StyleId } from '../_shared/replicate.ts';
import { generateText, type TextType, type WorkType } from '../_shared/polza.ts';
import { fetchBytes, signUrl, uploadBytes } from '../_shared/storage.ts';
import { backfillThumbs, saveThumb } from '../_shared/thumbs.ts';
import { sendMessage, sendPhoto } from '../_shared/telegram.ts';
import { applyLogo, type Placement } from '../_shared/branding.ts';
import { snapshotProviderBalance } from '../_shared/balance.ts';
import { explainJobFailure } from '../_shared/job-error.ts';
import { supportButton } from '../_shared/support.ts';
import { buildPersonalizedPrompt } from '../_shared/agent.ts';
import { advanceJobImage } from '../_shared/job-images.ts';
import { readJsonBody } from '../_shared/http-body.ts';

class LeaseLost extends Error {}
class TemporaryStorageError extends Error {}
interface Job {
  id: string;
  user_id: number;
  worker_token: string;
  photo_path: string;
  style: StyleId;
  format: FormatId;
  text_type: TextType;
  work_type: WorkType | null;
  branding: 'none' | 'name' | 'logo';
  decor_preset: string | null;
  decor_surface: string;
  decor_addition: string;
  result_path: string | null;
  model_used: string | null;
  prompt_used: string | null;
  is_test: boolean;
  test_provider?: string | null;
}

async function checkpoint(job: Job, values: Record<string, unknown>) {
  const { data, error } = await db.from('jobs').update(values).eq('id', job.id).eq(
    'worker_token',
    job.worker_token,
  )
    .eq('status', 'processing').select('id').maybeSingle();
  if (error) throw new TemporaryStorageError();
  if (!data) throw new LeaseLost();
}

async function defer(job: Job) {
  await checkpoint(job, {
    worker_lease_until: null,
    next_poll_at: new Date(Date.now() + 10_000).toISOString(),
  });
}

Deno.serve(async (req) => {
  const expected = Deno.env.get('INTERNAL_SECRET');
  if (!expected || req.headers.get('x-internal-secret') !== expected) {
    return jsonResponse({ error: 'forbidden' }, { status: 403 });
  }
  if (req.method !== 'POST') return jsonResponse({ error: 'method' }, { status: 405 });
  let preferred: string | null = null;
  try {
    if (req.body && req.headers.get('content-length') !== '0') {
      const body = await readJsonBody<{ jobId?: unknown }>(req);
      if (body.jobId !== undefined) {
        if (typeof body.jobId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.jobId)) {
          throw new Error();
        }
        preferred = body.jobId;
      }
    }
  } catch {
    return jsonResponse({ error: 'bad_json' }, { status: 400 });
  }
  await sweepStale();
  const { data: claimed, error: claimError } = await db.rpc('claim_job', { p_job_id: preferred });
  if (claimError) return jsonResponse({ error: 'queue_unavailable' }, { status: 503 });
  const job = claimed?.[0] as Job | undefined;
  if (!job) {
    const thumbs = preferred ? 0 : await backfillThumbs(4).catch(() => 0);
    return jsonResponse({ ok: true, picked: 0, thumbs });
  }
  let stage = 'prepare';
  try {
    let resultPath = job.result_path;
    let model: string = job.model_used ?? '';
    if (!resultPath) {
      const { data: brand, error: brandError } = await db.from('brand').select('*').eq(
        'user_id',
        job.user_id,
      ).maybeSingle();
      if (brandError) throw new TemporaryStorageError();
      const photoUrl = await signUrl('photos', job.photo_path, 15 * 60);
      const logoUrl = job.branding === 'logo' && brand?.logo_path
        ? await signUrl('brand', brand.logo_path, 15 * 60)
        : undefined;
      let prompt = job.prompt_used;
      if (!prompt) {
        let customPrompt: string | undefined;
        let agentNotes: string | null = null;
        if (
          Deno.env.get('AGENT_DISABLED') !== 'true' && !job.decor_preset &&
          Deno.env.get('POLZA_API_KEY')
        ) {
          const { data: history, error: historyError } = await db.from('jobs').select(
            'style,format,work_type,branding,created_at,feedback',
          )
            .eq('user_id', job.user_id).eq('status', 'done').order('created_at', {
              ascending: false,
            }).limit(10);
          if (historyError) throw new TemporaryStorageError();
          const failure: { reason?: string } = {};
          const agent = await buildPersonalizedPrompt({
            photoUrl,
            style: job.style,
            format: job.format,
            branding: job.branding,
            workType: job.work_type ?? undefined,
            brand: {
              masterName: brand?.master_name ?? undefined,
              labName: brand?.lab_name ?? undefined,
              defaultStyle: brand?.default_style ?? undefined,
              logoPlacement: brand?.logo_placement ?? undefined,
              hashtags: brand?.hashtags ?? [],
              hasLogo: Boolean(brand?.logo_path),
              fontDescription: describeFont(brand?.font_id),
            },
            history: (history ?? []).map((p) => ({
              style: p.style,
              format: p.format,
              workType: p.work_type ?? undefined,
              branding: p.branding ?? undefined,
              createdAt: p.created_at,
              feedback: p.feedback ?? null,
            })),
          }, failure);
          customPrompt = agent?.prompt;
          agentNotes = agent?.notes ?? null;
          await logAi(
            job.id,
            'agent',
            agent?.model ?? 'fallback',
            agent?.durationMs ?? 0,
            Boolean(agent),
            agent
              ? {
                prompt_tokens: agent.promptTokens,
                completion_tokens: agent.completionTokens,
              }
              : undefined,
            agent ? undefined : 'planner_unavailable',
          );
        }
        prompt = buildImageInput({
          photoUrl,
          logoUrl,
          style: job.style,
          format: job.format,
          customPrompt,
          decor: job.decor_preset
            ? { surface: job.decor_surface, addition: job.decor_addition }
            : undefined,
        }).prompt;
        await checkpoint(job, { prompt_used: prompt, agent_notes: agentNotes });
      }
      stage = 'generate_image';
      const image = await advanceJobImage(job.id, job.worker_token, {
        photoUrl,
        style: job.style,
        format: job.format,
        prompt,
      }, job.is_test ? job.test_provider ?? undefined : undefined);
      if (image.status === 'pending') {
        await defer(job);
        return jsonResponse({ ok: true, jobId: job.id, status: 'processing' });
      }
      model = image.provider;
      stage = 'download_image';
      const base = await fetchBytes(image.imageUrl);
      let final = base;
      if (logoUrl) {
        try {
          final = await applyLogo(
            base,
            await fetchBytes(logoUrl),
            (brand?.logo_placement ?? 'bottom-right') as Placement,
          ) ?? base;
        } catch {
          console.error('branding unavailable; retaining generated image');
        }
      }
      resultPath = `${job.user_id}/${job.id}.jpg`;
      stage = 'save_image';
      await uploadBytes(
        'results',
        resultPath,
        final,
        final[0] === 0x89 && final[1] === 0x50 ? 'image/png' : 'image/jpeg',
      );
      // A durable checkpoint: retries of later stages cannot create another image.
      await checkpoint(job, { result_path: resultPath, model_used: model });
      await saveThumb(job.id, resultPath, final);
      await logAi(job.id, 'image-ai', model, image.durationMs, true);
    }
    stage = 'generate_caption';
    const { data: brand, error: brandError } = await db.from('brand').select('master_name,hashtags')
      .eq('user_id', job.user_id).maybeSingle();
    if (brandError) throw new TemporaryStorageError();
    const text = await generateText({
      workType: job.work_type ?? undefined,
      textType: job.text_type,
      masterName: brand?.master_name ?? undefined,
      brandHashtags: brand?.hashtags ?? [],
    });
    if (text.source !== 'none') {
      await logAi(
        job.id,
        text.source === 'ai' ? 'polza' : 'text-fallback',
        text.source === 'ai' ? Deno.env.get('POLZA_MODEL') ?? 'gpt-4o-mini' : 'local',
        text.durationMs,
        text.source === 'ai',
        {
          prompt_tokens: text.promptTokens,
          completion_tokens: text.completionTokens,
        },
        text.fallbackReason,
      );
    }
    stage = 'complete';
    await checkpoint(job, {
      status: 'done',
      result_path: resultPath,
      model_used: model,
      caption_main: text.main,
      caption_alt: text.alt,
      hashtags: text.hashtags,
      caption_source: text.source,
      finished_at: new Date().toISOString(),
      worker_token: null,
      worker_lease_until: null,
      next_poll_at: null,
      error_message: null,
    });
    void snapshotProviderBalance().catch(() => {});
    try {
      if (!job.is_test) {
        await sendPhoto(
          Number(job.user_id),
          await signUrl('results', resultPath, 15 * 60),
          [text.main, text.hashtags.join(' ')].filter(Boolean).join('\n\n'),
        );
      }
    } catch {
      await logAi(job.id, 'telegram', 'sendPhoto', 0, false, undefined, 'push_unavailable');
    }
    return jsonResponse({ ok: true, jobId: job.id, status: 'done' });
  } catch (error) {
    if (error instanceof LeaseLost) {
      return jsonResponse({ ok: true, jobId: job.id, status: 'processing' });
    }
    const code = error instanceof Error ? error.message : '';
    if (
      error instanceof TemporaryStorageError ||
      [
        'storage_unavailable',
        'attempt_unavailable',
        'attempt_save_unavailable',
        'provider_health_unavailable',
      ].includes(code) || /^(signUrl|uploadBytes|fetchBytes)/.test(code)
    ) {
      console.error('job stage deferred', {
        jobId: job.id,
        stage,
        code: /^fetchBytes [a-z_0-9]+$/.test(code)
          ? code.replace('fetchBytes ', 'download_')
          : 'storage_unavailable',
      });
      await defer(job).catch(() => {});
      return jsonResponse({ error: 'processing_unavailable', jobId: job.id }, { status: 503 });
    }
    const safe =
      /^(image_providers_unavailable|provider_daily_limit|provider_[a-z_0-9]+|account_\d{3})$/.test(
          code,
        )
        ? code
        : 'processing_failed';
    console.error('job stage failed', { jobId: job.id, stage, code: safe });
    try {
      await checkpoint(job, {
        status: 'failed',
        error_message: safe,
        finished_at: new Date().toISOString(),
        worker_token: null,
        worker_lease_until: null,
        next_poll_at: null,
      });
    } catch {
      return jsonResponse({ error: 'processing_unavailable' }, { status: 503 });
    }
    await logAi(job.id, 'pipeline', 'n/a', 0, false, undefined, safe);
    try {
      const support = supportButton();
      if (!job.is_test) {
        await sendMessage(
          Number(job.user_id),
          explainJobFailure(safe).text,
          support.length ? { inline: [support] } : undefined,
        );
      }
    } catch { /* result state is authoritative */ }
    return jsonResponse({ ok: false, jobId: job.id, error: safe }, { status: 502 });
  }
});

async function sweepStale() {
  const finished_at = new Date().toISOString();
  for (
    const [status, age, error_message, column] of [['processing', 12, 'timeout', 'started_at'], [
      'created',
      15,
      'not_picked_up',
      'created_at',
    ]] as const
  ) {
    const { error } = await db.from('jobs').update({
      status: 'failed',
      error_message,
      finished_at,
      worker_token: null,
      worker_lease_until: null,
    })
      .eq('status', status).lt(column, new Date(Date.now() - age * 60_000).toISOString());
    if (error) console.error('queue cleanup unavailable', error.code);
  }
}
function describeFont(id?: string): string | undefined {
  const fonts: Record<string, string> = {
    inter: 'modern minimal sans-serif',
    playfair: 'classic luxury serif',
    cormorant: 'thin elegant garamond serif',
    cinzel: 'classical roman capitals',
    italiana: 'fashion magazine thin serif',
    bodoni: 'high-contrast fashion serif',
    montserrat: 'clean geometric sans-serif',
    tenor: 'minimal thin gallery sans-serif',
  };
  return id ? fonts[id] : undefined;
}
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
    const { error: writeError } = await db.from('ai_calls').insert({
      job_id: jobId,
      provider,
      model,
      duration_ms: durationMs,
      prompt_tokens: tokens?.prompt_tokens ?? null,
      completion_tokens: tokens?.completion_tokens ?? null,
      ok,
      error: error ?? null,
    });
    if (writeError) console.error('AI log unavailable', writeError.code);
  } catch {
    console.error('AI log unavailable');
  }
}
