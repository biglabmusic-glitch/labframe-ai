// Image AI — Replicate (по умолчанию Flux Kontext, image-to-image
// с сохранением структуры объекта). Промпт жёстко требует не трогать
// анатомию/цвет работы — ТЗ §11.1.
import { env } from './env.ts';

export type StyleId = 'clean' | 'dark' | 'soft';
export type FormatId = '4x5' | '1x1' | '9x16';

const STYLE_PROMPT: Record<StyleId, string> = {
  clean:
    'professional dental photography of a tooth restoration, pure clean white seamless background, soft even studio lighting, no harsh shadows, sharp focus on the dental work, medical aesthetic, magazine quality',
  dark:
    'luxury dental photography of a tooth restoration, deep dark gradient background, dramatic side rim lighting, premium feel, contrasty, sharp focus on the dental work, magazine quality',
  soft:
    'soft studio dental photography of a tooth restoration, light blue-grey gradient background, diffused window light, natural feel, gentle pastel tones, sharp focus on the dental work',
};

const FORMAT_ASPECT: Record<FormatId, string> = {
  '4x5':  '4:5',
  '1x1':  '1:1',
  '9x16': '9:16',
};

// КРИТИЧНОЕ ограничение из ТЗ §11.1 — добавляется ко всем промптам
const PRESERVATION_GUARDRAIL =
  ' Preserve the exact anatomy, exact shape, exact natural color, exact texture, and exact positioning of the dental restoration. Do not redraw, retouch, or modify the tooth itself. Only change the background, the lighting on the background, the framing, and the composition.';

export interface ProcessImageInput {
  photoUrl: string;
  style: StyleId;
  format: FormatId;
  brandText?: string;
}

export interface ProcessImageOutput {
  imageUrl: string;
  durationMs: number;
}

export async function processImage(input: ProcessImageInput): Promise<ProcessImageOutput> {
  const t0 = Date.now();
  const prompt = STYLE_PROMPT[input.style] + PRESERVATION_GUARDRAIL;

  // Replicate predictions API — синхронный режим (Prefer: wait)
  const res = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
      Prefer: 'wait=60', // ждём до 60 сек
    },
    body: JSON.stringify({
      model: env.REPLICATE_MODEL,
      input: {
        prompt,
        input_image: input.photoUrl,
        aspect_ratio: FORMAT_ASPECT[input.format],
        output_format: 'jpg',
        safety_tolerance: 2,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`replicate ${res.status}: ${text}`);
  }

  const data = await res.json() as { output?: string | string[]; status?: string; error?: string };
  if (data.error) throw new Error(`replicate: ${data.error}`);

  const out = Array.isArray(data.output) ? data.output[0] : data.output;
  if (!out) throw new Error('replicate: no output');

  return { imageUrl: out, durationMs: Date.now() - t0 };
}
