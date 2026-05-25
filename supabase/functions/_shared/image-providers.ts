// Роутер AI-моделей для image-обработки. Цель — поддержать несколько провайдеров
// (Replicate с разными моделями, Polza-через-OpenAI-API) и выбирать нужный
// по контексту задачи: с логотипом (multi-image) → Nano Banana, без — Flux Kontext.
//
// Каждый провайдер реализует один и тот же контракт {generate} с одинаковыми
// input/output, чтобы process-job не зависел от конкретной модели.

import { env } from './env.ts';
import type { StyleId, FormatId } from './replicate.ts';

export interface ImageInput {
  photoUrl: string;                // основное фото (работа)
  logoUrl?: string;                // опц. логотип для multi-image
  style: StyleId;
  format: FormatId;
  prompt: string;                  // готовый промт (уже собранный)
}

export interface ImageOutput {
  imageUrl: string;
  durationMs: number;
  provider: string;                // 'flux-kontext-pro' / 'nano-banana' / 'polza'
}

const FORMAT_ASPECT: Record<FormatId, string> = {
  '4x5':  '4:5',
  '1x1':  '1:1',
  '9x16': '9:16',
};

// ─── Provider 1: Replicate Flux Kontext Pro (single-image) ──────────────────
async function generateFluxKontext(input: ImageInput): Promise<ImageOutput> {
  const t0 = Date.now();
  const res = await fetch(
    'https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
        Prefer: 'wait=60',
      },
      body: JSON.stringify({
        input: {
          prompt: input.prompt,
          input_image: input.photoUrl,
          aspect_ratio: FORMAT_ASPECT[input.format],
          output_format: 'jpg',
          safety_tolerance: 2,
          prompt_upsampling: false,
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`flux-kontext ${res.status}: ${await res.text()}`);
  const data = await res.json() as { output?: string | string[]; error?: string };
  if (data.error) throw new Error(`flux-kontext: ${data.error}`);
  const out = Array.isArray(data.output) ? data.output[0] : data.output;
  if (!out) throw new Error('flux-kontext: no output');
  return { imageUrl: out, durationMs: Date.now() - t0, provider: 'flux-kontext-pro' };
}

// ─── Provider 2: Replicate Google Nano Banana (multi-image, Gemini 2.5 Flash Image) ─
async function generateNanoBanana(input: ImageInput): Promise<ImageOutput> {
  const t0 = Date.now();
  const imageInputs = [input.photoUrl, ...(input.logoUrl ? [input.logoUrl] : [])];
  const res = await fetch(
    'https://api.replicate.com/v1/models/google/nano-banana/predictions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
        Prefer: 'wait=60',
      },
      body: JSON.stringify({
        input: {
          prompt: input.prompt,
          image_input: imageInputs,
          output_format: 'jpg',
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`nano-banana ${res.status}: ${await res.text()}`);
  const data = await res.json() as { output?: string | string[]; error?: string };
  if (data.error) throw new Error(`nano-banana: ${data.error}`);
  const out = Array.isArray(data.output) ? data.output[0] : data.output;
  if (!out) throw new Error('nano-banana: no output');
  return { imageUrl: out, durationMs: Date.now() - t0, provider: 'nano-banana' };
}

// ─── Provider 3: Polza.ai — Nano Banana через /api/v1/media (Replicate-like) ─
// Polza имеет ДВА разных API:
//   1. /chat/completions — OpenAI-совместимый для text-моделей (используем для polza.ts)
//   2. /media — Replicate-like для image-моделей (этот провайдер)
//
// Формат media-запроса (из docs Polza):
//   POST https://polza.ai/api/v1/media
//   { "model": "...", "input": { "prompt": "...", "aspect_ratio": "1:1", ... } }
interface MediaResponse {
  // Гибкий парсер — Polza может класть URL картинки в любое из этих полей.
  // После первого реального вызова — увидим точный формат, оставим один.
  data?:   Array<{ url?: string; b64_json?: string }>;
  output?: string | string[];
  media?:  Array<{ url?: string }>;
  images?: Array<string | { url?: string }>;
  result?: { url?: string; images?: string[] };
  error?:  { message?: string } | string;
}

function extractMediaUrl(data: MediaResponse): string | null {
  if (data.data?.[0]?.url) return data.data[0].url;
  if (data.data?.[0]?.b64_json) return `data:image/png;base64,${data.data[0].b64_json}`;
  if (Array.isArray(data.output)) return data.output[0] ?? null;
  if (typeof data.output === 'string') return data.output;
  if (data.media?.[0]?.url) return data.media[0].url;
  if (data.images?.[0]) {
    const x = data.images[0];
    return typeof x === 'string' ? x : x.url ?? null;
  }
  if (data.result?.url) return data.result.url;
  if (data.result?.images?.[0]) return data.result.images[0];
  return null;
}

async function generatePolza(input: ImageInput): Promise<ImageOutput> {
  const t0 = Date.now();
  const model = Deno.env.get('POLZA_IMAGE_MODEL') ?? 'google/gemini-3.1-flash-image-preview';
  const mediaBase = Deno.env.get('POLZA_MEDIA_BASE_URL') ?? 'https://polza.ai/api/v1';

  // Polza-формат: input.images = [{ type: "url", data: "<url>" }, ...]
  // Первая картинка — основная (фото работы), вторая (если есть) — логотип для мульти-image моделей.
  const images: Array<{ type: 'url'; data: string }> = [
    { type: 'url', data: input.photoUrl },
    ...(input.logoUrl ? [{ type: 'url' as const, data: input.logoUrl }] : []),
  ];

  const aspectRatio = ({ '1x1': '1:1', '4x5': '4:5', '9x16': '9:16' } as const)[input.format];

  const body = {
    model,
    input: {
      prompt:       input.prompt,
      aspect_ratio: aspectRatio,
      max_images:   1,
      images,
    },
  };

  const res = await fetch(`${mediaBase}/media`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.POLZA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = (await res.text()).slice(0, 400);
    throw new Error(`polza ${res.status}: ${text}`);
  }
  const data = await res.json() as MediaResponse;
  const errMsg = typeof data.error === 'string' ? data.error : data.error?.message;
  if (errMsg) throw new Error(`polza: ${errMsg}`);

  const url = extractMediaUrl(data);
  if (!url) {
    const debugRaw = JSON.stringify(data, (_k, v) => {
      if (typeof v === 'string' && v.length > 200) return v.slice(0, 200) + `…[+${v.length - 200} chars]`;
      return v;
    }).slice(0, 800);
    throw new Error(`polza: no image in response (model=${model}) :: ${debugRaw}`);
  }

  return { imageUrl: url, durationMs: Date.now() - t0, provider: `polza:${model}` };
}

// ─── Router: выбирает провайдер по правилам ─────────────────────────────────
export type ProviderName = 'flux-kontext' | 'nano-banana' | 'polza' | 'auto';

export async function generateImage(
  input: ImageInput,
  forceProvider: ProviderName = 'auto',
): Promise<ImageOutput> {
  // 1) Жёсткий выбор через env (для A/B тестов из CLI)
  const envOverride = Deno.env.get('IMAGE_PROVIDER') as ProviderName | undefined;
  const decision: ProviderName =
    forceProvider !== 'auto' ? forceProvider :
    envOverride && envOverride !== 'auto' ? envOverride :
    // 2) Авто: с логотипом → multi-image модель, иначе быстрый Flux
    input.logoUrl ? 'nano-banana' :
    'flux-kontext';

  switch (decision) {
    case 'nano-banana': return generateNanoBanana(input);
    case 'polza':       return generatePolza(input);
    case 'flux-kontext':
    default:            return generateFluxKontext(input);
  }
}
