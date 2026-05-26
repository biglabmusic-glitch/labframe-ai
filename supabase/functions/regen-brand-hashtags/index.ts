// POST /regen-brand-hashtags
// Возвращает: { hashtags: string[] }
//
// Генерит «вечнозелёный» набор брендовых хэштегов под текущего юзера:
// — берёт его имя/лабораторию,
// — смотрит последние типы работ из истории (что чаще снимает: коронки/виниры/мосты),
// — добавляет ниша-популярные теги (зуботехника, керамика, циркон).
//
// В отличие от /regen-hashtags (привязан к конкретному job), этот запускается из ScreenMyBrand
// и сохраняет результат в brand.hashtags. Дальше эти теги дефолтные для всех будущих постов.
import { authorize, corsPreflight, jsonResponse } from '../_shared/auth.ts';
import { db } from '../_shared/db.ts';
import { env } from '../_shared/env.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight();
  if (req.method !== 'POST') return jsonResponse({ error: 'method' }, { status: 405 });

  const auth = await authorize(req);
  if ('response' in auth) return auth.response;
  const tg = auth.user;

  // Бренд — нужен для имени/лабы/уже введённых тегов.
  const { data: brand } = await db
    .from('brand')
    .select('master_name, lab_name, hashtags, default_style')
    .eq('user_id', tg.id)
    .maybeSingle();

  // История — топ-3 типа работ, чтобы хэштеги отражали что мастер реально снимает.
  const { data: jobs } = await db
    .from('jobs')
    .select('work_type, style')
    .eq('user_id', tg.id)
    .eq('status', 'done')
    .order('created_at', { ascending: false })
    .limit(30);

  const workCounts: Record<string, number> = {};
  for (const j of jobs ?? []) {
    if (j.work_type) workCounts[j.work_type] = (workCounts[j.work_type] ?? 0) + 1;
  }
  const topWorks = Object.entries(workCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([w]) => w);

  const masterName    = brand?.master_name ?? '';
  const labName       = brand?.lab_name    ?? '';
  const existingTags  = brand?.hashtags    ?? [];

  const userPrompt = [
    `Сгенерируй 12 хэштегов для Instagram зубного техника / зуботехнической лаборатории.`,
    `Это «вечнозелёный» брендовый набор — будет крепиться к будущим постам, поэтому без сиюминутности и трендов.`,
    masterName ? `Имя мастера: ${masterName}.` : '',
    labName    ? `Название лаборатории: ${labName}.` : '',
    topWorks.length ? `Чаще всего публикует работы типа: ${topWorks.join(', ')}.` : '',
    existingTags.length ? `Текущие хэштеги (могут быть слабыми — можешь полностью переписать): ${existingTags.join(', ')}` : '',
    ``,
    `Структура набора (примерно):`,
    `  • 3-4 нишевых русских: #зубнойтехник, #зуботехническаялаборатория, #керамика, #циркон, #виниры, #коронкиизциркония и т.п.`,
    `  • 3-4 нишевых английских: #dentaltechnician, #dentallab, #dentalceramics, #zirconia, #porcelainveneers и т.п.`,
    `  • 1-2 персональных: если есть имя/лаба — слитное (без пробелов) и/или с подчёркиванием.`,
    `  • 2-3 «эстетических»: #smile_design, #estetica_dental, #цифроваястоматология, #dentalart, #dentalphotography.`,
    ``,
    `Анализируй популярность в нише: какие реально используются мастерами уровня выше среднего (не любительские). Не пиши «#красивыезубы» — это шумные.`,
    `Все теги через #, в одном слове (без пробелов), не более 25 символов каждый, без эмодзи.`,
    ``,
    `Верни СТРОГО JSON: { "hashtags": ["#...", "#..."] } без markdown. 10-12 штук.`,
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
            'Ты — копирайтер для зубных техников. Знаешь Instagram-ниши: dental art, ceramic, zirconia, dental photography. Отвечаешь СТРОГО JSON без markdown, без префиксов.' },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5,
      max_tokens: 400,
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

  // Нормализуем: гарантируем # в начале, дедуп, обрезаем до 12.
  const cleaned = (parsed.hashtags ?? [])
    .map((h) => h.trim())
    .filter(Boolean)
    .map((h) => h.startsWith('#') ? h : `#${h.replace(/\s+/g, '')}`)
    .filter((h) => h.length > 1 && h.length <= 26);
  const merged = [...new Set(cleaned)].slice(0, 12);

  // Сохраняем в brand.hashtags — это новый «вечнозелёный» набор.
  await db.from('brand').upsert(
    { user_id: tg.id, hashtags: merged, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );

  return jsonResponse({ hashtags: merged });
});
