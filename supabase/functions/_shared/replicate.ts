// Image AI — модуль с промтами + тонкая обёртка над роутером моделей (image-providers.ts).
// Сюда добавляем все промты, оттуда — выбираем провайдер (flux-kontext / nano-banana / polza).
import { generateImage, type ProviderName } from './image-providers.ts';

export type StyleId = 'clean' | 'dark' | 'soft';
export type FormatId = '4x5' | '1x1' | '9x16';

// Промпт для случая «БЕЗ логотипа» (single-image модель).
function buildPrompt(style: StyleId): string {
  return STYLE_PROMPT[style];
}

// Промпт для случая «С логотипом» — image-модель НЕ рисует логотип сама
// (рендерит криво). Просим оставить пустой угол, лого наложим на фронте через canvas.
function buildPromptWithLogo(style: StyleId): string {
  const base = STYLE_PROMPT[style];
  const reserveBlock = `

LOGO PLACEMENT:
keep a corner of the frame clean and uncluttered;
leave space for a logo to be added in post-processing;
do NOT render any logo, letters, or text in the image yourself.`;
  return base + reserveBlock;
}

// Единый «скелет» промта — preservation + position lock + allowed edits + общие запреты.
// Меняется только STYLE и FINAL GOAL для каждого варианта.
// Экспортируем POSITION_LOCK и COMMON_OUTPUT — agent.ts оборачивает свой промт ими.
export const POSITION_LOCK = `Use the uploaded image as the base photo.

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

// Жёсткий запрет любого текста и подписей — иначе модели «фантазируют»
// случайные подписи лабораторий и водяные знаки. Эта часть применяется ВСЕГДА,
// для бренд-логики надстройка делается в агенте/buildPromptWithLogo.
export const COMMON_OUTPUT = `Output:
single clean image, same framing as source, studio-quality final look.

ABSOLUTELY NO TEXT in the image:
no signature, no watermark, no lab name, no brand name, no master name,
no logo, no caption, no letters, no numbers, no characters of any kind,
no autograph, no stamp, no website, no @handle, no copyright mark.
The frame must be completely free of any text or graphics.

Also forbidden:
no collage, no new scene, no face, no patient, no blood, no clinical treatment scene,
no changed dental work, no changed position, no added hands, no instruments.`;

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
  logoUrl?: string;                  // если есть — пойдём через multi-image модель
  style: StyleId;
  format: FormatId;
  brandText?: string;
  forceProvider?: ProviderName;      // 'auto' (default) / 'flux-kontext' / 'nano-banana' / 'polza'
  customPrompt?: string;             // если задан — используется вместо STYLE_PROMPT (см. agent.ts)
}

export interface ProcessImageOutput {
  imageUrl: string;
  durationMs: number;
  provider: string;
}

export async function processImage(input: ProcessImageInput): Promise<ProcessImageOutput> {
  void input.brandText; // больше не идёт в промт — брендирование постпроцессингом
  // Если агент дал свой промт — оборачиваем его нашим железным контекстом:
  // POSITION_LOCK (нельзя менять зуб) + промт агента + COMMON_OUTPUT (нельзя добавлять текст).
  // Это страховка: GPT-4o-mini может смягчить запреты, sandwich этого не даст.
  const prompt = input.customPrompt
    ? `${POSITION_LOCK}\n\n${input.customPrompt}\n\n${COMMON_OUTPUT}`
    : (input.logoUrl ? buildPromptWithLogo(input.style) : buildPrompt(input.style));

  return generateImage(
    {
      photoUrl: input.photoUrl,
      logoUrl:  input.logoUrl,
      style:    input.style,
      format:   input.format,
      prompt,
    },
    input.forceProvider ?? 'auto',
  );
}
