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
// стилевыми и композиционными ограничениями. Брендинг (имя/лого) НЕ передаём в промт —
// Flux рисует текст и логотипы мусором. Брендирование делается постпроцессингом на фронте.
// Format crop из промтов убран — aspect_ratio передаётся через input и приоритетнее текста.
function buildPrompt(style: StyleId): string {
  return STYLE_PROMPT[style];
}

// Единый «скелет» промта — preservation + position lock + allowed edits + общие запреты.
// Меняется только STYLE и FINAL GOAL для каждого варианта.
const POSITION_LOCK = `Use the uploaded image as the base photo.

Do not regenerate the image.
Do not recreate the subject.
Do not reinterpret the dental work.

Preserve the dental restoration and gypsum model exactly as in the source image.

POSITION LOCK:
keep the dental work in the exact same position, angle, scale, perspective, and location in the frame.
Do not move the restoration.
Do not rotate the restoration.
Do not resize the restoration.
Do not reposition the restoration.
Do not change the camera angle.
Do not change the perspective.
Do not change the distance to the object.
Do not change how the work lies or stands.
Do not change the placement of the gypsum model.

Do not change:
tooth shape, anatomy, incisal edge, contours, cusps, fissures,
surface texture, shade, color, translucency, gloss, proportions, fit,
the crown, the veneer, the bridge, the ceramic restoration, or the gypsum model.

Only improve:
background cleanup, background simplification, exposure, white balance,
contrast, noise reduction, slight sharpening, soft studio lighting,
natural shadows, studio-quality presentation.

Make the same photo look like a professional studio portfolio image, without changing the object or its position.`;

const COMMON_OUTPUT = `Output:
single image, same framing as source, studio-quality final look,
no collage, no large text, no logo, no watermark, no new scene,
no face, no patient, no blood, no clinical treatment scene,
no changed dental work, no changed position.`;

const STYLE_BLOCK: Record<StyleId, string> = {
  clean: `Style:
clean white dental photography,
white or light gray studio background,
soft even studio lighting,
clean minimal shadows,
bright premium presentation,
clinical but elegant portfolio style,
minimal medical aesthetic.`,

  dark: `Style:
premium dark dental photography,
dark graphite or luxury black background,
soft directional studio lighting,
elegant shadows,
high contrast but realistic,
luxury portfolio presentation,
minimal premium medical aesthetic.`,

  soft: `Style:
soft studio dental photography,
soft beige or neutral gray background,
diffused studio lighting,
gentle natural shadows,
warm premium presentation,
calm elegant portfolio style,
refined natural look.`,
};

const STYLE_PROMPT: Record<StyleId, string> = {
  clean: `${POSITION_LOCK}\n\n${STYLE_BLOCK.clean}\n\n${COMMON_OUTPUT}`,
  dark:  `${POSITION_LOCK}\n\n${STYLE_BLOCK.dark}\n\n${COMMON_OUTPUT}`,
  soft:  `${POSITION_LOCK}\n\n${STYLE_BLOCK.soft}\n\n${COMMON_OUTPUT}`,
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
  const prompt = buildPrompt(input.style);
  void input.brandText; // больше не идёт в промт — обрабатываем брендинг постпроцессингом

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
