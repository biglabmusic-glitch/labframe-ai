// Text AI — polza.ai (OpenAI-совместимый эндпоинт, дешевле OpenAI напрямую).
import { env } from './env.ts';

// Polza иногда возвращает символы с потерянной кодировкой (U+FFFD «replacement»)
// или одинокие половинки surrogate-пар — это рендерится как «��». Чистим.
function cleanText(s: string): string {
  return s
    .replace(/�/g, '')
    .replace(/[\uD800-\uDFFF]/g, '')
    .trim();
}

export type WorkType = 'crown' | 'veneer' | 'bridge' | 'other';
export type TextType = 'short' | 'sell' | 'tech' | 'none';

const WORK_LABEL: Record<WorkType, string> = {
  crown:  'коронка',
  veneer: 'виниры',
  bridge: 'мост',
  other:  'зуботехническая работа',
};

const STYLE_BRIEF: Record<Exclude<TextType, 'none'>, string> = {
  short: 'Короткая профессиональная подпись, 1–2 предложения. Сухой тон без эмоций.',
  sell:  'Эмоциональный продающий текст 3–4 предложения. Показывает ценность для пациента.',
  tech:  'Технический текст 3–4 предложения с акцентом на мастерство, текстуру, форму.',
};

// Few-shot эталоны хорошего тона — снимают типовые косяки gpt-4o-mini
// (канцелярит, эмодзи, «улыбка вашей мечты», восклицательные знаки).
const STYLE_EXAMPLES: Record<Exclude<TextType, 'none'>, string> = {
  short:
    'Пример: «Винир на 2.1 после переделки. Цветопередача — A2, текстура повторяет соседний натуральный зуб.»',
  sell:
    'Пример: «Когда работа сидит так, что пациент забывает, какой зуб — свой, а какой — наш. Передача формы и фактуры — без компромиссов, ради того самого «не вижу разницы». Записаться можно через директ.»',
  tech:
    'Пример: «Циркониевая коронка на жевательную группу: послойная керамика, имитация мамелонов на пришеечной зоне, опаловая прозрачность по режущему краю. Финишная полировка алмазной пастой.»',
};

export interface GenerateTextInput {
  workType?: WorkType;
  textType: TextType;
  masterName?: string;
  brandHashtags?: string[];
}

export interface GenerateTextOutput {
  main: string;
  alt: string;
  hashtags: string[];
  promptTokens?: number;
  completionTokens?: number;
  durationMs: number;
}

export async function generateText(input: GenerateTextInput): Promise<GenerateTextOutput> {
  if (input.textType === 'none') {
    return { main: '', alt: '', hashtags: [], durationMs: 0 };
  }

  const t0 = Date.now();
  const workLabel = WORK_LABEL[input.workType ?? 'other'];
  const brief = STYLE_BRIEF[input.textType];
  const example = STYLE_EXAMPLES[input.textType];

  const userPrompt = [
    `Ты пишешь подпись к посту в Instagram для зубного техника / керамиста.`,
    `Стиль текста: ${brief}`,
    `Тип работы: ${workLabel}.`,
    input.masterName ? `Имя мастера/бренда: ${input.masterName}.` : '',
    ``,
    `${example}`,
    ``,
    `Верни строго JSON без markdown в формате:`,
    `{ "main": "...", "alt": "...", "hashtags": ["#...", "#..."] }`,
    `main — основной текст, alt — альтернативный (тот же смысл, другими словами),`,
    `hashtags — массив из 5–8 русских и английских хэштегов для этой ниши.`,
  ].filter(Boolean).join('\n');

  // Текст — вспомогательная часть работы, и ждать его долго незачем: лучше
  // отдать картинку с запасной подписью, чем уронить всю работу по таймауту.
  const res = await fetch(`${env.POLZA_BASE_URL}/chat/completions`, {
    signal: AbortSignal.timeout(45_000),
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.POLZA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.POLZA_MODEL,
      messages: [
        { role: 'system', content:
            'Ты — копирайтер для зубных техников и керамистов. Пишешь для Instagram.' +
            ' Правила: без обещаний результата, без медицинских утверждений, без цен,' +
            ' без избыточного пафоса и канцелярита, без эмодзи, без восклицательных знаков.' +
            ' Язык — русский, грамотный, без англицизмов без необходимости.' +
            ' Отвечаешь СТРОГО валидным JSON без markdown, без префиксов, без ```.' },
        { role: 'user',   content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5,        // строгий формат — креатив тут вредит
      max_tokens: 600,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`polza ${res.status}: ${text}`);
  }

  const data = await res.json() as {
    choices: { message: { content: string } }[];
    usage?: { prompt_tokens: number; completion_tokens: number };
  };

  const raw = data.choices[0]?.message?.content ?? '{}';
  let parsed: { main: string; alt: string; hashtags: string[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { main: raw, alt: '', hashtags: [] };
  }

  // Дополняем фирменными хэштегами клиента (без дублей)
  const tags = [...new Set([...(parsed.hashtags ?? []), ...(input.brandHashtags ?? [])])].slice(0, 12);

  return {
    main: cleanText(parsed.main ?? ''),
    alt:  cleanText(parsed.alt ?? ''),
    hashtags: tags.map(cleanText).filter(Boolean),
    promptTokens: data.usage?.prompt_tokens,
    completionTokens: data.usage?.completion_tokens,
    durationMs: Date.now() - t0,
  };
}

/**
 * Остаток и накопленный расход на счёте polza.ai.
 *
 * Ответ выглядит так:
 *   {"amount":"1373.37","available":"1373.37","reservedAmount":"0.00",
 *    "spentAmount":"3626.62","updatedAt":"..."}
 *
 * Числа приходят СТРОКАМИ — на этом первая версия и споткнулась. Берём
 * available (свободные деньги, без зарезервированных) и spentAmount, который
 * избавляет от необходимости выводить расход из разностей остатка.
 *
 * Причину отказа возвращаем наружу: она видна в админке, а смотрят туда как
 * раз тогда, когда деньги кончаются и лезть в логи некогда.
 */
export type BalanceResult =
  | { ok: true; balance: number; spentTotal: number | null; currency: string }
  | { ok: false; error: string };

export async function fetchBalance(): Promise<BalanceResult> {
  const base = (Deno.env.get('POLZA_BASE_URL') ?? 'https://api.polza.ai/api/v1').replace(/\/+$/, '');
  try {
    const res = await fetch(`${base}/balance`, {
      headers: { Authorization: `Bearer ${Deno.env.get('POLZA_API_KEY') ?? ''}` },
      // Баланс — справочная величина: висеть из-за неё нельзя, иначе она
      // задержит работу, ради которой функцию и вызвали.
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.text();
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 160)}` };

    let raw: unknown;
    try { raw = JSON.parse(body); }
    catch { return { ok: false, error: `не JSON: ${body.slice(0, 160)}` }; }

    const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const nested = (obj.data ?? obj.result ?? obj) as Record<string, unknown>;

    // available — свободные деньги; amount включает зарезервированное.
    const balance = num(nested.available) ?? num(nested.amount) ?? num(nested.balance);
    if (balance === null) {
      return { ok: false, error: `незнакомый формат: ${body.slice(0, 200)}` };
    }

    return {
      ok: true,
      balance,
      spentTotal: num(nested.spentAmount) ?? num(nested.spent),
      currency: typeof nested.currency === 'string' ? nested.currency : 'RUB',
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Числа у них строками, поэтому принимаем оба вида. */
function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}
