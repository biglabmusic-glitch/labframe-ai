// GET /list-jobs?limit=24 — возвращает последние done jobs текущего пользователя
// для ленты «ВАШИ РАБОТЫ» на Home. Не возвращает failed/processing — лента должна
// показывать только готовые посты.
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
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '24', 10) || 24, 1), 100);

  const { data: jobs, error } = await db
    .from('jobs')
    .select('id, style, format, work_type, result_path, caption_main, created_at')
    .eq('user_id', tg.id)
    .eq('status', 'done')
    .not('result_path', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return jsonResponse({ error: error.message }, { status: 500 });

  const items = (jobs ?? []).map((j) => ({
    id:          j.id,
    style:       j.style,
    format:      j.format,
    workType:    j.work_type ?? undefined,
    resultUrl:   j.result_path ? publicUrl('results', j.result_path) : undefined,
    captionMain: j.caption_main ?? undefined,
    createdAt:   new Date(j.created_at).getTime(),
  }));

  return jsonResponse({ items });
});
