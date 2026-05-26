// AI-арт-директор для image-генерации.
// Получает на вход: фото работы, бренд мастера, последние jobs, текущий выбор юзера.
// Через Polza gpt-4o-mini (vision) собирает кастомный промт + выбирает image-модель.
// Если упал — возвращает null, и process-job откатывается на дефолтные правила.
//
// ВАЖНО: агент НЕ заменяет жёсткие правила «POSITION LOCK» — он ОБЯЗАН их встроить в промт.
// Системный промт ниже принуждает модель к этому формату через JSON-схему.

import { env } from './env.ts';
import type { StyleId, FormatId } from './replicate.ts';

export type AgentModel = 'flux-kontext' | 'nano-banana';

export interface AgentBrand {
  masterName?: string;
  labName?: string;
  defaultStyle?: StyleId;
  logoPlacement?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  hashtags?: string[];
  hasLogo: boolean;
  /** Описание шрифта подписи на английском — попадает прямо в промт. */
  fontDescription?: string;
}

export interface AgentHistoryItem {
  style: StyleId;
  format: FormatId;
  workType?: string;
  branding?: string;
  createdAt?: string;
  /** Юзерский фидбэк: 'liked' | 'disliked' — сильный сигнал что повторять/избегать. */
  feedback?: 'liked' | 'disliked' | null;
}

export interface AgentInput {
  photoUrl: string;
  style: StyleId;
  format: FormatId;
  branding: 'logo' | 'name' | 'none';
  workType?: string;
  brand: AgentBrand;
  history: AgentHistoryItem[];
}

export interface AgentOutput {
  prompt: string;
  model: AgentModel;
  notes: string;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
}

const SYSTEM_PROMPT = `Ты — AI-арт-директор для зубных техников.
На входе: фото работы (см. image_url), бренд мастера, история его работ, параметры текущего поста.
На выходе: один JSON-объект без markdown, без префиксов, без \`\`\`.

ФОРМАТ ВЫХОДА (строго):
{
  "prompt": "<английский промт 250–500 символов>",
  "model": "flux-kontext" | "nano-banana",
  "notes": "<1 короткое предложение по-русски>"
}

ПРАВИЛА ПРОМТА (без них работа сломается):
- Сохрани зуб/реставрацию ОДИН-В-ОДИН: форма, цвет, текстура, позиция, ракурс, масштаб. Не перерисовывай.
- Запрети: руки, пальцы, перчатки, инструменты, новые объекты, лицо, пациента, кровь.
- Меняй только: фон, освещение, отражения, кадр, окружение.
- Стиль (обогати keywords под выбранный):
  - clean: studio white background, soft daylight, ceramic translucency, refractive highlights
  - dark: deep matte black or graphite background, rim light, premium luxury, subtle reflections
  - soft: soft pastel gradient (light blue/cream), morning daylight, airy mood
- workType учти, если есть (single crown / veneer / bridge / ceramic restoration).

BRANDING — ВАЖНО, СТРОГО:
- "none" → промт ОБЯЗАН содержать: "Do NOT add any text, signature, watermark, lab name, brand name, master name, logo, or any letters/numbers anywhere in the frame. The image must be completely clean of text and graphics." Это блокирует попытки модели сочинить подпись.
- "name" + masterName/labName есть → добавь инструкцию: "Render the text «<EXACT_NAME>» as a small minimal signature in the <placement> corner. Keep it tiny, thin, neutral white color, not overlapping the dental work. No other text anywhere." Используй ТОЧНО то имя, что дали (masterName или labName). Если задан signatureFont — обязательно встрой его описание в промт типографики (например "in a thin elegant garamond-style serif", "rendered as modern geometric sans-serif"). Это сильно меняет ощущение подписи.
- "logo" → "Use Image 2 as the logo reference, placed small and clean in the <placement> corner, proportional, undistorted, not over the dental work. Do NOT add any other text or signatures." Текст всё равно запрети.

ВЫБОР МОДЕЛИ:
- Если branding === "logo" → "nano-banana" (мульти-image).
- Иначе → "flux-kontext".

ИСТОРИЯ — ТВОЯ ПАМЯТЬ (используй активно):
- В history лежат предыдущие готовые работы юзера: формат "style/format/workType/branding 👍|👎".
  👍 = юзер лайкнул результат, 👎 = не понравилось, без эмодзи = без фидбэка.
- Прийми текущий выбор юзера (style/format/branding) как авторитет — не подменяй.
- ВАЖНО: учись на фидбэке.
  - Если в одной комбинации (например dark/4x5/veneer) есть 👎 — попробуй слегка изменить акценты (другие keywords освещения/текстуры/композиции), чтобы выйти из паттерна, который юзер отверг.
  - Если есть 👍 на похожей комбинации — повтори рабочую формулу, можно усилить.
  - Если 👍 и 👎 смешаны — придерживайся 👍-комбинаций.
- Внутри выбранного стиля подстраивайся под «почерк»:
  - Если он чаще снимает crown → промт может тоньше учитывать форму единичной коронки.
  - Повторяется один и тот же workType → deeper-keywords (виниры — translucency layers, мосты — connector aesthetics).
- Если history пустая — это первый пост юзера, выдай чистый шаблонный промт.
- В notes (по-русски) кратко скажи, что учёл из истории/фидбэка, либо «история пустая, базовый шаблон».

Никаких пояснений вне JSON. Никаких markdown.`;

function buildUserContext(input: AgentInput): string {
  const lines = [
    `style: ${input.style}`,
    `format: ${input.format}`,
    `branding: ${input.branding}`,
    input.workType ? `workType: ${input.workType}` : null,
    input.brand.masterName ? `masterName: ${input.brand.masterName}` : null,
    input.brand.labName ? `labName: ${input.brand.labName}` : null,
    input.brand.defaultStyle ? `defaultStyle: ${input.brand.defaultStyle}` : null,
    input.brand.logoPlacement ? `logoPlacement: ${input.brand.logoPlacement}` : null,
    `hasLogo: ${input.brand.hasLogo}`,
    input.brand.fontDescription ? `signatureFont: ${input.brand.fontDescription}` : null,
    input.history.length
      ? `history (last ${input.history.length}, новейшая первая): ${input.history
          .map((h) => {
            const fb = h.feedback === 'liked' ? ' 👍' : h.feedback === 'disliked' ? ' 👎' : '';
            return `${h.style}/${h.format}${h.workType ? `/${h.workType}` : ''}${h.branding ? `/${h.branding}` : ''}${fb}`;
          })
          .join(', ')}`
      : 'history: empty',
  ].filter(Boolean);
  return lines.join('\n');
}

// Ручной таймаут — не зависим от наличия AbortSignal.timeout в среде.
// fetch получает signal от AbortController, который мы отменяем по таймеру.
function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  return fetch(url, { ...init, signal: ctl.signal }).finally(() => clearTimeout(timer));
}

export async function buildPersonalizedPrompt(input: AgentInput): Promise<AgentOutput | null> {
  const t0 = Date.now();
  const model = Deno.env.get('POLZA_AGENT_MODEL') ?? 'gpt-4o-mini';
  const baseUrl = env.POLZA_BASE_URL;

  // Текстовый режим — без image_url. Polza-прокси не гарантирует vision для всех моделей;
  // текстового контекста (бренд + история + параметры) хватает на адаптацию промта.
  // Если позже захочется vision — переключаемся на gpt-4o или claude-3.5-sonnet через Polza.
  const userText = buildUserContext(input);

  try {
    const res = await fetchWithTimeout(
      `${baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.POLZA_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user',   content: userText },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.4,
        }),
      },
      8_000,
    );

    if (!res.ok) {
      const text = (await res.text()).slice(0, 400);
      console.error(`agent ${res.status}: ${text}`);
      return null;
    }

    const data = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) {
      console.error('agent: empty content');
      return null;
    }

    let parsed: { prompt?: string; model?: string; notes?: string };
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Иногда LLM возвращает с markdown — попробуем вытащить JSON из ```...```
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) {
        console.error('agent: no JSON in', raw.slice(0, 200));
        return null;
      }
      parsed = JSON.parse(m[0]);
    }

    if (!parsed.prompt || typeof parsed.prompt !== 'string') {
      console.error('agent: missing prompt in', JSON.stringify(parsed).slice(0, 200));
      return null;
    }

    // Принудительно валидируем model — если LLM придумала своё, скатываемся к flux-kontext.
    const chosenModel: AgentModel =
      parsed.model === 'nano-banana' || parsed.model === 'flux-kontext'
        ? parsed.model
        : (input.branding === 'logo' ? 'nano-banana' : 'flux-kontext');

    return {
      prompt: parsed.prompt,
      model: chosenModel,
      notes: parsed.notes ?? '',
      durationMs: Date.now() - t0,
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
    };
  } catch (e) {
    console.error('agent failed', e);
    return null;
  }
}
