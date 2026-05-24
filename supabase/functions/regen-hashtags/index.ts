// POST /regen-hashtags
// Body: { jobId: string }
// Возвращает: { hashtags: string[] }
//
// Генерит свежий пакет хэштегов под бренд юзера для уже завершённого job.
// Использует polza.ai (gpt-4o-mini), как и текстовая генерация для постов.
import { authorize, corsPreflight, jsonResponse } from '../_shared/auth.ts';
import { db } from '../_shared/db.ts';
import { env } from '../_shared/env.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight();
  if (req.method !== 'POST') return jsonResponse({ error: 'method' }, { status: 405 });

  const auth = await authorize(req);
  if ('response' in auth) return auth.response;
  const tg = auth.user;

  let body: { jobId?: string };
  try { body = await req.json(); }
  catch { return jsonResponse({ error: 'bad_json' }, { status: 400 }); }

  if (!body.jobId) return jsonResponse({ error: 'missing_jobId' }, { status: 400 });

  // Подтянем job (для контекста: тип работы + текущий текст) и бренд (для имени и существующих хэштегов).
  const { data: job, error: jobErr } = await db
    .from('jobs')
    .select('id, work_type, caption_main, hashtags')
    .eq('id', body.jobId)
    .eq('user_id', tg.id)
    .maybeSingle();
  if (jobErr || !job) return jsonResponse({ error: 'job_not_found' }, { status: 404 });

  const { data: brand } = await db
    .from('brand')
    .select('master_name, lab_name, hashtags')
    .eq('user_id', tg.id)
    .maybeSingle();

  const masterName    = brand?.master_name ?? '';
  const labName       = brand?.lab_name    ?? '';
  const brandHashtags = brand?.hashtags    ?? [];

  const userPrompt = [
    `Сгенерируй 8 хэштегов для Instagram-поста зубного техника.`,
    `Тип работы: ${job.work_type ?? 'зуботехническая работа'}.`,
    masterName ? `Имя мастера/бренда: ${masterName}.` : '',
    labName    ? `Название лаборатории: ${labName}.` : '',
    brandHashtags.length ? `Уже используемые брендовые хэштеги (можешь дополнить, но не дублируй): ${brandHashtags.join(', ')}` : '',
    ``,
    `Правила: смесь русских и английских, ниша — стоматология/зубные техники/керамика/циркон/виниры. Без воды.`,
    `Если есть имя мастера или лаборатории — обязательно сделай 1-2 персональных хэштега (#${(masterName || labName).replace(/\s+/g, '').toLowerCase()}_*).`,
    ``,
    `Верни СТРОГО JSON: { "hashtags": ["#...", "#..."] } без markdown.`,
  ].filter(Boolean).join('\n');

  const res = await fetch(`${env.POLZA_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.POLZA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.POLZA_MODEL,
      messages: [
        { role: 'system', content:
            'Ты — копирайтер для зубных техников. Пишешь хэштеги для Instagram. Отвечаешь СТРОГО JSON без markdown.' },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4,
      max_tokens: 300,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return jsonResponse({ error: `polza ${res.status}: ${text.slice(0, 200)}` }, { status: 502 });
  }

  const data = await res.json() as { choices: { message: { content: string } }[] };
  let parsed: { hashtags?: string[] };
  try { parsed = JSON.parse(data.choices[0]?.message?.content ?? '{}'); }
  catch { parsed = {}; }

  // Объединяем сгенерированные + брендовые, де-дуп, обрезаем до 12.
  const merged = [...new Set([...(parsed.hashtags ?? []), ...brandHashtags])]
    .filter((h) => h.startsWith('#'))
    .slice(0, 12);

  // Сохраняем в job, чтобы при перезагрузке экрана юзер видел новые хэштеги.
  await db.from('jobs').update({ hashtags: merged }).eq('id', job.id);

  return jsonResponse({ hashtags: merged });
});
