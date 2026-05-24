// GET /get-job?id=<uuid>
import { authorize, corsPreflight, jsonResponse } from '../_shared/auth.ts';
import { db } from '../_shared/db.ts';
import { publicUrl } from '../_shared/storage.ts';

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

  if (error) return jsonResponse({ error: error.message }, { status: 500 });
  if (!job)  return jsonResponse({ error: 'not_found' }, { status: 404 });

  return jsonResponse({
    id: job.id,
    status: job.status,
    resultUrl: job.result_path ? publicUrl('results', job.result_path) : null,
    caption: {
      main: job.caption_main ?? '',
      alt: job.caption_alt ?? '',
      hashtags: job.hashtags ?? [],
    },
    error: job.error_message ?? null,
  });
});
