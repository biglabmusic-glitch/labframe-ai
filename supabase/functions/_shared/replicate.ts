// Image AI — Replicate (по умолчанию Flux Kontext, image-to-image
// с сохранением структуры объекта). Промпт жёстко требует не трогать
// анатомию/цвет работы — ТЗ §11.1.
import { env } from './env.ts';

export type StyleId = 'clean' | 'dark' | 'soft';
export type FormatId = '4x5' | '1x1' | '9x16';

const STYLE_PROMPT: Record<StyleId, string> = {
  clean:
    'professional dental laboratory photography of a ceramic/zirconia tooth restoration, pure clean white seamless background, soft even studio lighting, no harsh shadows, sharp tack-focus on the dental work, natural refractive highlights on the ceramic surface, medical aesthetic, dental magazine quality',
  dark:
    'luxury dental laboratory photography of a ceramic/zirconia tooth restoration, deep dark charcoal gradient background, dramatic single-source rim lighting, premium feel, high contrast, sharp tack-focus on the dental work, glossy refractive highlights on the ceramic surface, dental magazine quality',
  soft:
    'soft studio dental laboratory photography of a ceramic/zirconia tooth restoration, light blue-grey gradient background, diffused window-style light, natural feel, gentle pastel tones, sharp tack-focus on the dental work, subtle refractive highlights on the ceramic surface',
};

const FORMAT_ASPECT: Record<FormatId, string> = {
  '4x5':  '4:5',
  '1x1':  '1:1',
  '9x16': '9:16',
};

// КРИТИЧНОЕ ограничение из ТЗ §11.1 — добавляется ко всем промптам.
// Дополнено явными запретами на типовые косяки Flux (лишние руки/инструменты,
// «сглаживание» зуба, изменение цвета — всё это убивает доверие техника к результату).
const PRESERVATION_GUARDRAIL =
  ' CRITICAL: Preserve the EXACT anatomy, EXACT shape, EXACT natural color,' +
  ' EXACT texture, surface translucency, and EXACT positioning of the dental restoration.' +
  ' Do NOT redraw, retouch, smooth, brighten, whiten, or modify the tooth itself.' +
  ' Do NOT add fingers, hands, gloves, instruments, mirrors, retractors, or any new objects to the scene.' +
  ' Only change the background, the ambient lighting on the background, the framing, and the composition.';

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

  // Используем model-specific эндпоинт `/v1/models/{owner}/{name}/predictions` —
  // эндпоинт `/v1/predictions` теперь требует явный `version` hash, что менее удобно.
  // Этот всегда дёргает последнюю версию модели и не требует `model` в body.
  const res = await fetch(
    `https://api.replicate.com/v1/models/${env.REPLICATE_MODEL}/predictions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
        Prefer: 'wait=60', // ждём до 60 сек
      },
      body: JSON.stringify({
        input: {
          prompt,
          input_image: input.photoUrl,
          aspect_ratio: FORMAT_ASPECT[input.format],
          output_format: 'jpg',
          safety_tolerance: 2,
          prompt_upsampling: false,   // не давать модели «улучшать» наш промпт
        },
      }),
    },
  );

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
