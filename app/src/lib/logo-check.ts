// Проверка при загрузке: похоже ли присланное на логотип.
//
// Примерно треть «логотипов» в базе — фото работ и селфи. Сервер такие на посты
// не ставит (supabase/functions/_shared/branding.ts), и без предупреждения
// человек просто не понимает, куда делся его логотип. Здесь та же логика,
// что на сервере, в упрощённом виде — пороги держим одинаковыми.

const BORDER_TOLERANCE = 40;
const BORDER_SHARE = 0.9;
const NEAR = 22;
const FAR = 80;
const MAX_SEMI_SHARE = 0.5;

/** Проверяем на уменьшенной копии: рамке и полутонам этого хватает. */
const CHECK_SIZE = 400;

export const PHOTO_LOGO_WARNING =
  'Похоже, это фото, а не логотип — на посты его ставить не будем. ' +
  'Загрузите логотип на однотонном фоне или PNG с прозрачным фоном.';

export function looksLikePhoto(img: HTMLImageElement): boolean {
  const scale = Math.min(1, CHECK_SIZE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(4, Math.round(img.naturalWidth * scale));
  const h = Math.max(4, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(img, 0, 0, w, h);
  return looksLikePhotoPixels(ctx.getImageData(0, 0, w, h).data, w, h);
}

/** То же по готовым RGBA-пикселям — отдельно, чтобы проверять без браузера. */
export function looksLikePhotoPixels(px: Uint8ClampedArray, w: number, h: number): boolean {
  // Рамка в два пикселя: у логотипа она прозрачная или одного цвета.
  const border: number[] = [];
  for (let x = 0; x < w; x++) for (const y of [0, 1, h - 2, h - 1]) border.push((y * w + x) * 4);
  for (let y = 2; y < h - 2; y++) for (const x of [0, 1, w - 2, w - 1]) border.push((y * w + x) * 4);

  if (border.filter((i) => px[i + 3] < 200).length / border.length > 0.05) return false;

  const median = (c: number) => {
    const v = border.map((i) => px[i + c]).sort((a, b) => a - b);
    return v[v.length >> 1];
  };
  const bg = [median(0), median(1), median(2)];
  const dist = (i: number) =>
    Math.max(Math.abs(px[i] - bg[0]), Math.abs(px[i + 1] - bg[1]), Math.abs(px[i + 2] - bg[2]));

  if (border.filter((i) => dist(i) <= BORDER_TOLERANCE).length / border.length < BORDER_SHARE) return true;

  // Фото работы на тёмном фоне проходит проверку рамки, но после вырезания
  // фона у него почти всё полупрозрачное — тени и полутона.
  let visible = 0;
  let semi = 0;
  for (let i = 0; i < px.length; i += 4) {
    const t = Math.min(1, Math.max(0, (dist(i) - NEAR) / (FAR - NEAR)));
    const alpha = t * t * (3 - 2 * t) * px[i + 3];
    if (alpha <= 24) continue;
    visible++;
    if (alpha < 230) semi++;
  }
  return visible > 0 && semi / visible > MAX_SEMI_SHARE;
}
