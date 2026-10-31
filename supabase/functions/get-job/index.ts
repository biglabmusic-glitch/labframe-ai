// GET /get-job?id=<uuid>
import { authorize, corsPreflight, jsonResponse } from '../_shared/auth.ts';
import { db } from '../_shared/db.ts';
import { signUrl } from '../_shared/storage.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight();
  if (req.method !== 'GET') return jsonResponse({ error: 'method' }, { status: 405 });

  const auth = await authorize(req);
  if ('response' in auth) return auth.response;
  const tg = auth.user;

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return jsonResponse({ error: 'missing_id' }, { status: 400 });

  const { data: job, error } = await db
    .from('jobs')
    .select('*')
    .eq('id', id)
    .eq('user_id', tg.id)
    .maybeSingle();

  if (error) return jsonResponse({ error: 'job_read_unavailable' }, { status: 503 });
  if (!job)  return jsonResponse({ error: 'not_found' }, { status: 404 });

  let resultUrl: string | null = null;
  try { if (job.status === 'done' && job.result_path) resultUrl = await signUrl('results', job.result_path, 3600); }
  catch { return jsonResponse({ error: 'result_unavailable' }, { status: 503 }); }
  // Background recovery is owner-bound and claim_job enforces its polling interval.
  if (job.status === 'created' || job.status === 'processing') {
    const secret = Deno.env.get('INTERNAL_SECRET');
    if (secret && (job.status==='created' || job.worker_token) && (!job.next_poll_at || new Date(job.next_poll_at).getTime() <= Date.now()) &&
        (!job.worker_lease_until || new Date(job.worker_lease_until).getTime() <= Date.now())) {
      const task = fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/process-job`, { method: 'POST',
        signal: AbortSignal.timeout(120_000),headers:{'Content-Type':'application/json','x-internal-secret':secret},body:JSON.stringify({jobId:job.id}),
      }).then((r)=>r.body?.cancel()).catch(()=>{});
      // @ts-ignore Supabase Edge Runtime global
      if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(task);
    }
  }
  return jsonResponse({
    id: job.id,
    status: job.status,
    resultUrl,
    stage: job.status === 'created' ? 'queued' : job.result_path ? 'caption' : 'image',
    caption: {
      main: job.caption_main ?? '',
      alt: job.caption_alt ?? '',
      hashtags: job.hashtags ?? [],
      source: job.caption_source ?? 'ai',
    },
    error: job.error_message ?? null,
  });
});
