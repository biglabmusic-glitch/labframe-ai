// POST /create-job: reserve, enforce limits and insert in one database transaction.
import { authorize, corsPreflight, jsonResponse } from '../_shared/auth.ts';
import { db } from '../_shared/db.ts';
import { BodyError, readJsonBody } from '../_shared/http-body.ts';
import { boundedInt, JobInputError, jobSettings, requestKey } from '../_shared/job-input.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight();
  if (req.method !== 'POST') return jsonResponse({ error: 'method' }, { status: 405 });
  const auth = await authorize(req);
  if ('response' in auth) return auth.response;
  const tg = auth.user;
  let settings: Record<string, string | null>;
  let key: string | null;
  try {
    const body = await readJsonBody<Record<string, unknown>>(req);
    settings = jobSettings(body, tg.id);
    key = requestKey(body.requestKey);
  } catch (e) {
    const error = e instanceof BodyError || e instanceof JobInputError
      ? e.message
      : 'invalid_settings';
    return jsonResponse({ error }, {
      status: e instanceof BodyError ? e.status : error === 'forbidden_path' ? 403 : 400,
    });
  }
  const secret = Deno.env.get('INTERNAL_SECRET');
  if (!secret) return jsonResponse({ error: 'processing_unavailable' }, { status: 503 });
  const { error: profileError } = await db.from('users').upsert({
    id: tg.id,
    username: tg.username ?? null,
    first_name: tg.first_name ?? null,
    last_name: tg.last_name ?? null,
    photo_url: tg.photo_url ?? null,
    language_code: tg.language_code ?? 'ru',
    last_seen_at: new Date().toISOString(),
  }, { onConflict: 'id', ignoreDuplicates: false });
  if (profileError) return jsonResponse({ error: 'profile_unavailable' }, { status: 503 });

  const { data: job, error } = await db.rpc('create_job_atomic', {
    p_user_id: tg.id,
    p_request_key: key,
    p_settings: settings,
    p_billing_exempt: Deno.env.get('LIMITS_DISABLED') === '1',
    p_daily_limit: boundedInt(Deno.env.get('JOBS_PER_USER_PER_DAY'), 50),
  });
  if (error) {
    const status: Record<string, number> = {
      banned: 403,
      consent_required: 403,
      forbidden_path: 403,
      too_many_in_progress: 429,
      daily_limit: 429,
      idempotency_conflict: 409,
      invalid_settings: 400,
    };
    const known = Object.keys(status).find((code) => error.message === code);
    if (!known) console.error('create_job_atomic unavailable', error.code);
    return jsonResponse({ error: known ?? 'job_create_unavailable' }, {
      status: known ? status[known] : 503,
    });
  }
  if (job?.error === 'insufficient_credits') return jsonResponse(job, { status: 402 });
  if (!job?.id) return jsonResponse({ error: 'job_create_unavailable' }, { status: 503 });
  if (job.status === 'created' || job.status === 'processing') {
    const run = fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/process-job`, {
      method: 'POST',
      signal: AbortSignal.timeout(120_000),
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
      body: JSON.stringify({ jobId: job.id }),
    }).then((r) => {
      if (!r.ok) console.error('worker dispatch status', r.status);
      return r.body?.cancel();
    })
      .catch(() => console.error('worker dispatch unavailable; cron will resume'));
    // @ts-ignore Supabase Edge Runtime global
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(run);
  }
  return jsonResponse({ id: job.id, status: job.status });
});
