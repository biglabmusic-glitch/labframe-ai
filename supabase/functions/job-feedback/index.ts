// POST /job-feedback — юзер оценивает результат job: 👍 / 👎.
// Body: { jobId, feedback: 'liked' | 'disliked' }
// Сохраняем в jobs.feedback. Это сигнал для AI-агента «нравится / не нравится»,
// он позже учитывает это в истории работ для подбора более удачного промта.
//
// Сейчас агент только КОПИТ фидбэк (поле feedback в last 10 jobs).
// Активная адаптация поведения по фидбэку — следующий шаг (L2 → L4 в roadmap).
import { authorize, corsPreflight, jsonResponse } from '../_shared/auth.ts';
import { db } from '../_shared/db.ts';

interface Body {
  jobId: string;
  feedback: 'liked' | 'disliked';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight();
  if (req.method !== 'POST') return jsonResponse({ error: 'method' }, { status: 405 });

  const auth = await authorize(req);
  if ('response' in auth) return auth.response;
  const tg = auth.user;

  let body: Body;
  try { body = await req.json(); }
  catch { return jsonResponse({ error: 'bad_json' }, { status: 400 }); }

  if (!body.jobId || (body.feedback !== 'liked' && body.feedback !== 'disliked')) {
    return jsonResponse({ error: 'bad_input' }, { status: 400 });
  }

  // .eq('user_id', tg.id) — гарантия, что юзер ставит оценку только своему job.
  const { error } = await db
    .from('jobs')
    .update({ feedback: body.feedback })
    .eq('id', body.jobId)
    .eq('user_id', tg.id);

  if (error) return jsonResponse({ error: error.message }, { status: 500 });
  return jsonResponse({ ok: true });
});
