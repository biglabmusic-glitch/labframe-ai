// Image AI — Replicate (по умолчанию Flux Kontext, image-to-image
// с сохранением структуры объекта). Промпт жёстко требует не трогать
// анатомию/цвет работы — ТЗ §11.1.
import { env } from './env.ts';

export type StyleId = 'clean' | 'dark' | 'soft';
export type FormatId = '4x5' | '1x1' | '9x16';

const FORMAT_ASPECT: Record<FormatId, string> = {
  '4x5':  '4:5',
  '1x1':  '1:1',
  '9x16': '9:16',
};

// Промпты-эталоны от пользователя — длинные, с явным preservation-листом, разрешёнными правками,
// стилевыми и композиционными ограничениями. `{BRAND}` подставляется из brandText (или пустая строка).
// Format crop из промтов убран — aspect_ratio передаётся через input и приоритетнее текста.
function buildPrompt(style: StyleId, brandText?: string): string {
  const brand = brandText && brandText.trim() ? brandText.trim().toUpperCase() : 'LABFRAME AI';
  return STYLE_PROMPT[style].replace(/\{BRAND\}/g, brand);
}

const STYLE_PROMPT: Record<StyleId, string> = {
  clean: `Use the uploaded image as the base photo layer.

Create a clean white Instagram portfolio image for a dental technician.

Important:
do not recreate or regenerate the dental restoration.
Preserve the crown / veneer / bridge / ceramic restoration exactly as in the source image.

Do not change:
shape, anatomy, incisal edge, edges, contours, cusps, fissures,
surface texture, shade, color, translucency, gloss, proportions, fit, gypsum model.

Treat the restoration and gypsum model as preserved objects.
Only improve the visual presentation around them.

Allowed edits:
clean or simplify the background, adjust lighting, improve exposure,
improve white balance, add soft natural shadows,
straighten the image using the incisal edge of the central incisors,
create a clean bright studio look, add small corner branding.

Style:
Clean White, white or light gray studio background, soft professional lighting,
clean medical aesthetic, minimal premium portfolio,
realistic dental lab photography, natural ceramic texture.

Composition:
single image, subject centered, restoration fully visible,
enough clean space around the subject,
no collage, no large text, no face, no patient, no blood, no clinical treatment scene.

Optional small corner branding: "{BRAND}".

Final goal: make the same dental work look clean, bright, and professionally presented, without changing the restoration itself.`,

  dark: `Use the uploaded image as the base photo layer.

Create a premium dark Instagram portfolio image for a dental technician.

Important:
do not recreate or regenerate the dental restoration.
Preserve the crown / veneer / bridge / ceramic restoration exactly as in the source image.

Do not change:
shape, anatomy, incisal edge, edges, contours, cusps, fissures,
surface texture, shade, color, translucency, gloss, proportions, fit, gypsum model.

Treat the restoration and gypsum model as preserved objects.
Only improve the visual presentation around them.

Allowed edits:
clean or simplify the background, adjust lighting, improve exposure,
improve white balance, add soft natural shadows,
straighten the image using the incisal edge of the central incisors,
create a premium dark visual mood, add small corner branding.

Style:
Premium Dark, dark graphite or luxury black background,
soft directional studio lighting, elegant shadows,
realistic dental lab photography, high-end Instagram portfolio,
minimal luxury medical aesthetic.

Composition:
single image, subject centered, restoration fully visible, clean framing,
balanced contrast, no collage, no large text, no face, no patient, no blood, no clinical treatment scene.

Optional small corner branding: "{BRAND}".

Final goal: make the same dental work look professionally presented on a premium dark background, without changing the restoration itself.`,

  soft: `Use the uploaded image as the base photo layer.

Create a soft studio Instagram portfolio image for a dental technician.

Important:
do not recreate or regenerate the dental restoration.
Preserve the crown / veneer / bridge / ceramic restoration exactly as in the source image.

Do not change:
shape, anatomy, incisal edge, edges, contours, cusps, fissures,
surface texture, shade, color, translucency, gloss, proportions, fit, gypsum model.

Treat the restoration and gypsum model as preserved objects.
Only improve the visual presentation around them.

Allowed edits:
clean or simplify the background, adjust lighting, improve exposure,
improve white balance, add soft natural shadows,
straighten the image using the incisal edge of the central incisors,
create a calm studio look, add small corner branding.

Style:
Soft Studio, warm neutral beige or soft gray background,
soft diffused studio lighting, gentle natural shadows,
calm premium medical aesthetic, realistic dental lab photography,
natural ceramic texture, elegant Instagram portfolio look.

Composition:
single image, subject centered, restoration fully visible, clean framing,
no collage, no large text, no face, no patient, no blood, no clinical treatment scene.

Optional small corner branding: "{BRAND}".

Final goal: make the same dental work look softly lit, elegant, and portfolio-ready, without changing the restoration itself.`,
};

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
  const prompt = buildPrompt(input.style, input.brandText);

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
