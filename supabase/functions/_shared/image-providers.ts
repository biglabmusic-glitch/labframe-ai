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

// ─── Provider 3: Polza.ai (OpenAI-compatible) — заглушка, нужны актуальные имена моделей ─
// Polza проксирует OpenAI-API. У них может быть доступ к gpt-image-1, DALL-E 3,
// Gemini 2.5 Flash Image. Точные имена моделей зависят от юзерского аккаунта.
async function generatePolza(input: ImageInput): Promise<ImageOutput> {
  const t0 = Date.now();
  const model = Deno.env.get('POLZA_IMAGE_MODEL') ?? 'gemini-2.5-flash-image-preview';
  // Если Polza поддерживает images.edit с base64/url — используем её.
  // Здесь — попытка через /images/generations с reference в prompt.
  // ВАЖНО: после первого реального вызова — допилить под точный формат Polza.
  const res = await fetch(`${env.POLZA_BASE_URL}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.POLZA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt: input.prompt,
      n: 1,
      size: '1024x1024',
      response_format: 'url',
    }),
  });
  if (!res.ok) throw new Error(`polza-image ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json() as { data?: { url?: string; b64_json?: string }[] };
  const item = data.data?.[0];
  const url = item?.url ?? (item?.b64_json ? `data:image/png;base64,${item.b64_json}` : null);
  if (!url) throw new Error('polza-image: no output');
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
