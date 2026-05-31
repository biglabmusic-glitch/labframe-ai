// Декор-режим «Индивидуальность»: пресеты, резолвер и сборка статического промта.
// Чистая логика без сетевых импортов — тестируется через Deno.test (см. decor_test.ts).
// ВАЖНО: POSITION_LOCK добавляет replicate.ts ДО этого блока, COMMON_OUTPUT_DECOR — ПОСЛЕ.
import type { StyleId } from './replicate.ts';

export interface DecorPreset {
  id: string;
  surface: string;   // {{BASE_SURFACE}}
  addition: string;  // {{USER_ADDITION}}
}

// Источник истины набора пресетов. Фронт держит свой UI-список (presets.ts) с теми же id.
export const DECOR_PRESETS: Record<string, DecorPreset> = {
  snake:       { id: 'snake',       surface: 'black stone',             addition: 'a single elegant white snake resting beside the work' },
  amethyst:    { id: 'amethyst',    surface: 'dark marble',             addition: 'a small decorative amethyst crystal geode' },
  calligraphy: { id: 'calligraphy', surface: 'black velvet',            addition: 'two japanese ink brushes and subtle calligraphy in the background' },
  water:       { id: 'water',       surface: 'still water',             addition: 'subtle water ripples and a soft reflection' },
  stone:       { id: 'stone',       surface: 'a matte ceramic platform', addition: 'a minimal natural stone accent' },
  metal:       { id: 'metal',       surface: 'brushed metal',           addition: 'a premium metallic tray' },
};

export const DECOR_CUSTOM_ID = 'custom';

// Поверхность по умолчанию для «своего варианта» — берётся под выбранный стиль.
export const DEFAULT_SURFACE: Record<StyleId, string> = {
  clean: 'a clean matte white surface',
  soft:  'a soft neutral studio surface',
  dark:  'a dark premium matte surface',
};

export interface ResolvedDecor {
  surface: string;
  addition: string;
}

// Чистим текст «своего варианта»: одна строка, только буквы/цифры/базовая пунктуация, до 120 симв.
export function sanitizeAddition(s: string): string {
  return s
    .replace(/[\n\r]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s.,'\-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

// Резолвим выбор пользователя в финальную пару {surface, addition}.
// Возвращает null, если декора нет (пустой preset / неизвестный id / пустой custom-текст).
export function resolveDecor(
  preset: string | undefined | null,
  customAddition: string | undefined | null,
  style: StyleId,
): ResolvedDecor | null {
  if (!preset) return null;
  if (preset === DECOR_CUSTOM_ID) {
    const add = sanitizeAddition(customAddition ?? '');
    if (!add) return null;
    return { surface: DEFAULT_SURFACE[style], addition: add };
  }
  const p = DECOR_PRESETS[preset];
  if (!p) return null;
  return { surface: p.surface, addition: p.addition };
}

const DECOR_STYLE_BLOCK: Record<StyleId, string> = {
  clean: `STYLE:
clean white dental photography, bright minimal white background,
soft high-key studio lighting, clean medical aesthetic,
natural soft shadows, premium clinical portfolio presentation,
minimal and elegant composition.`,
  soft: `STYLE:
soft studio dental photography, smooth neutral beige background,
soft diffused lighting, gentle natural shadows, balanced contrast,
calm elegant studio atmosphere, minimal premium medical aesthetic.`,
  dark: `STYLE:
premium dark dental photography, dark graphite or luxury black background,
deep elegant shadows, soft directional studio lighting,
high contrast but realistic, cinematic dark studio mood,
luxury portfolio presentation.`,
};

// Средняя секция промта: стиль + поверхность + один декоративный элемент.
// POSITION_LOCK и COMMON_OUTPUT_DECOR навешивает replicate.ts.
export function buildDecorPrompt(style: StyleId, surface: string, addition: string): string {
  return `${DECOR_STYLE_BLOCK[style]}

BASE SURFACE:
Place the dental work on: ${surface}.
The base surface must look realistic, clean and premium, support the work naturally,
and must NOT distort, cover, hide, or alter the dental restoration or gypsum model.
Keep lighting, reflections, shadows and texture realistic and subtle.

ADDITIONAL DECORATIVE ELEMENT:
Add exactly one decorative element to the scene: ${addition}.
The element must be decorative and secondary. It must NOT touch, cover, hide, distort,
or overlap the dental restoration or gypsum model, and must NOT change its position,
angle, scale, color, anatomy or texture. Place it naturally in the background or around
the composition, with realistic lighting, perspective, shadows and reflections.
It should enhance the premium presentation without distracting from the dental work.`;
}

// Аналог COMMON_OUTPUT, но разрешает РОВНО ОДИН декоративный элемент + поверхность.
// Текст/руки/инструменты/изменения зуба по-прежнему запрещены. Снято только "no new scene".
export const COMMON_OUTPUT_DECOR = `Output:
single clean image, same framing as source, studio-quality final look.

You MAY add exactly one decorative element and the requested base surface as described above — nothing else new.

ABSOLUTELY NO TEXT in the image:
no signature, no watermark, no lab name, no brand name, no master name,
no logo, no caption, no letters, no numbers, no characters of any kind,
no autograph, no stamp, no website, no @handle, no copyright mark.
The frame must be completely free of any text or graphics.

Also forbidden:
no collage, no face, no patient, no blood, no clinical treatment scene,
no changed dental work, no changed position, no added hands, no fingers, no gloves, no instruments.`;
