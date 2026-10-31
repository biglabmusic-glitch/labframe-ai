// GET /list-jobs?limit=24 — возвращает последние done jobs текущего пользователя
// для ленты «ВАШИ РАБОТЫ» на Home. Не возвращает failed/processing — лента должна
// показывать только готовые посты.
import { authorize, corsPreflight, jsonResponse } from '../_shared/auth.ts';
import { db } from '../_shared/db.ts';

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
    .select('id, style, format, work_type, result_path, thumb_path, caption_main, created_at')
    .eq('user_id', tg.id)
    .eq('status', 'done')
    .not('result_path', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return jsonResponse({ error: 'history_unavailable' }, { status: 503 });
  const paths = [...new Set((jobs ?? []).flatMap((j) => [j.result_path,j.thumb_path]).filter((p): p is string => Boolean(p)))];
  const urls = new Map<string,string>();
  if (paths.length) {
    const {data:signed,error:signError}=await db.storage.from('results').createSignedUrls(paths,3600);
    if (signError) return jsonResponse({error:'history_unavailable'},{status:503});
    for (const item of signed ?? []) if(item.path && item.signedUrl) urls.set(item.path,item.signedUrl);
  }

  const items = (jobs ?? []).map((j) => ({
    id:          j.id,
    style:       j.style,
    format:      j.format,
    workType:    j.work_type ?? undefined,
    resultUrl:   urls.get(j.result_path),
    // Миниатюра для квадратика истории — в десять раз легче полной картинки.
    // У старых работ её может ещё не быть: фон доделывает, а пока — полная.
    thumbUrl:    urls.get(j.thumb_path),
    captionMain: j.caption_main ?? undefined,
    createdAt:   new Date(j.created_at).getTime(),
  }));

  return jsonResponse({ items });
});
