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
}

export interface AgentHistoryItem {
  style: StyleId;
  format: FormatId;
  workType?: string;
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
- branding:
  - "name" + masterName/labName есть → добавь в углу logoPlacement маленькую тонкую подпись, нейтральный цвет, минималистично, не перекрывая зуб.
  - "logo" → используй image 2 как логотип, маленький, в углу logoPlacement, не искажай.
  - "none" → ничего не добавляй.

ВЫБОР МОДЕЛИ:
- Если branding === "logo" → "nano-banana" (мульти-image).
- Иначе → "flux-kontext".

ИСТОРИЯ:
- Если в history преобладает один стиль ≠ текущему, прийми текущий выбор юзера, но в notes можно отметить.

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
    input.history.length
      ? `history (last ${input.history.length}): ${input.history
          .map((h) => `${h.style}/${h.format}${h.workType ? `/${h.workType}` : ''}`)
          .join(', ')}`
      : 'history: empty',
  ].filter(Boolean);
  return lines.join('\n');
}

export async function buildPersonalizedPrompt(input: AgentInput): Promise<AgentOutput | null> {
  const t0 = Date.now();
  const model = Deno.env.get('POLZA_AGENT_MODEL') ?? 'gpt-4o-mini';
  const baseUrl = env.POLZA_BASE_URL;

  const userText = buildUserContext(input);

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.POLZA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: userText },
              { type: 'image_url', image_url: { url: input.photoUrl } },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4,
      }),
      signal: AbortSignal.timeout(20_000),
    });

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
