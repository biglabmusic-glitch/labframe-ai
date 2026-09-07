// Наложение логотипа на готовую картинку — на сервере, до отправки в чат.
//
// Раньше брендирование жило только в браузере, на канвасе мини-аппа. Из-за
// этого фотография, которую бот присылает в чат — а её как раз и сохраняют,
// чтобы выложить, — уходила без логотипа. Брендированную версию видел только
// тот, кто открыл приложение и нажал «Скачать».
//
// Теперь единственная сохранённая версия уже с логотипом: и в чате, и в
// приложении, и при скачивании откуда угодно она одна и та же.
//
// Подпись именем (branding = 'name') пока остаётся на клиенте: для неё нужен
// шрифт конкретного семейства, а это отдельная история с загрузкой TTF.
import { Image } from 'https://deno.land/x/imagescript@1.2.17/mod.ts';

export type Placement = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

// Те же пропорции, что и на канвасе в мини-аппе, чтобы результат совпадал.
const PADDING_RATIO = 0.035;   // отступ от края — доля меньшей стороны
const MAX_W_RATIO   = 0.22;    // предел ширины логотипа — доля ширины кадра
const MAX_H_RATIO   = 0.12;    // предел высоты — доля меньшей стороны
const LOGO_OPACITY  = 0.92;    // чуть меньше единицы: не выглядит приклеенным

// Пороги вырезания однотонной подложки.
const CORNER_SPREAD = 12;      // насколько углы могут отличаться, чтобы счесть их фоном
const LOW_SATURATION = 40;     // разброс каналов, ниже которого логотип считаем монохромным
const MIN_CONTRAST = 70;       // если яркости логотипа и фона ближе — перекрашиваем
const NEAR = 26;               // ближе этого к цвету фона — полностью прозрачно
const FAR  = 64;               // дальше — точно логотип; между ними плавный переход

/**
 * Накладывает логотип на изображение. Возвращает JPEG.
 * При любой неудаче бросает — вызывающий решает, отдавать ли исходник.
 */
export async function applyLogo(
  baseBytes: Uint8Array,
  logoBytes: Uint8Array,
  placement: Placement,
): Promise<Uint8Array> {
  const base = await Image.decode(baseBytes);
  const logo = await Image.decode(logoBytes);

  knockOutSolidBackground(logo);

  // Ограничиваем обе стороны: если считать только по большей, широкий логотип
  // выходит визуально мелким, а квадратный — крупным.
  const minSide = Math.min(base.width, base.height);
  const maxW = base.width * MAX_W_RATIO;
  const maxH = minSide * MAX_H_RATIO;
  const scale = Math.min(maxW / logo.width, maxH / logo.height);
  if (scale < 1) {
    logo.resize(Math.max(1, Math.round(logo.width * scale)), Image.RESIZE_AUTO);
  }

  const pad = Math.round(minSide * PADDING_RATIO);
  const x = Math.max(0, Math.round(placement.endsWith('left') ? pad : base.width - pad - logo.width));
  const y = Math.max(0, Math.round(placement.startsWith('top') ? pad : base.height - pad - logo.height));

  adaptToBackground(logo, averageLuminance(base, x, y, logo.width, logo.height));
  logo.opacity(LOGO_OPACITY);
  base.composite(logo, x, y);
  return await base.encodeJPEG(92);
}

/**
 * Делает прозрачной однотонную подложку логотипа.
 *
 * Техники присылают логотипы в JPEG на белом фоне — формат прозрачности не
 * знает, и на тёмном кадре в углу оказывается белый прямоугольник. Именно это
 * и читается как наклейка.
 *
 * Трогаем только очевидные случаи: все четыре угла одного цвета и непрозрачны.
 * Логотип со сложным фоном или уже вырезанный оставляем как есть — вырезать
 * «на всякий случай» хуже, чем не вырезать.
 */
function knockOutSolidBackground(logo: Image): void {
  const corners = [
    logo.getPixelAt(1, 1),
    logo.getPixelAt(logo.width, 1),
    logo.getPixelAt(1, logo.height),
    logo.getPixelAt(logo.width, logo.height),
  ].map((c) => Image.colorToRGBA(c));

  // Прозрачность уже есть — фон вырезали за нас.
  if (corners.some(([, , , a]) => a < 250)) return;

  const [r0, g0, b0] = corners[0];
  const spread = Math.max(
    ...corners.map(([r, g, b]) =>
      Math.max(Math.abs(r - r0), Math.abs(g - g0), Math.abs(b - b0))),
  );
  if (spread > CORNER_SPREAD) return;

  for (const [x, y, color] of logo.iterateWithColors()) {
    const [r, g, b, a] = Image.colorToRGBA(color);
    const d = Math.max(Math.abs(r - r0), Math.abs(g - g0), Math.abs(b - b0));
    if (d > FAR) continue;

    // Плавный переход у границы: без него по краям букв остаётся рваная кайма
    // от JPEG-сжатия.
    const alpha = d <= NEAR ? 0 : Math.round(a * ((d - NEAR) / (FAR - NEAR)));
    logo.setPixelAt(x, y, Image.rgbaToColor(r, g, b, alpha));
  }
}

/** Средняя яркость участка кадра, куда ляжет логотип. */
function averageLuminance(img: Image, x: number, y: number, w: number, h: number): number {
  let sum = 0;
  let n = 0;
  // Шаг по пикселям: считать каждый незачем, а на больших кадрах это заметная работа.
  const step = Math.max(1, Math.floor(Math.min(w, h) / 24));
  for (let dy = 0; dy < h; dy += step) {
    for (let dx = 0; dx < w; dx += step) {
      const px = x + dx + 1;
      const py = y + dy + 1;
      if (px < 1 || py < 1 || px > img.width || py > img.height) continue;
      const [r, g, b] = Image.colorToRGBA(img.getPixelAt(px, py));
      sum += 0.299 * r + 0.587 * g + 0.114 * b;
      n++;
    }
  }
  return n ? sum / n : 128;
}

/**
 * Перекрашивает монохромный логотип, если он сливается с фоном.
 *
 * После вырезания белой подложки от чёрно-белого логотипа остаются тёмные
 * штрихи — а «премиальный тёмный» кадр тоже тёмный, и логотип пропадает
 * совсем. Раньше на его месте был хотя бы белый прямоугольник: некрасиво,
 * но видно. Поэтому поступаем как с подписью именем — светлый знак на тёмном
 * фоне, тёмный на светлом.
 *
 * Цветные логотипы НЕ трогаем: перекрасить фирменный знак — значит испортить
 * айдентику, ради которой всё и затевалось. Их оставляем как есть, даже если
 * контраст неидеален.
 */
function adaptToBackground(logo: Image, bgLuminance: number): void {
  let sum = 0;
  let n = 0;
  let colored = false;

  for (const [, , color] of logo.iterateWithColors()) {
    const [r, g, b, a] = Image.colorToRGBA(color);
    if (a < 32) continue;  // прозрачное — не часть знака
    if (Math.max(r, g, b) - Math.min(r, g, b) > LOW_SATURATION) colored = true;
    sum += 0.299 * r + 0.587 * g + 0.114 * b;
    n++;
  }
  if (!n || colored) return;

  const inkLuminance = sum / n;
  if (Math.abs(inkLuminance - bgLuminance) >= MIN_CONTRAST) return;

  // Тон выбираем по фону, а не по исходному цвету знака.
  const [nr, ng, nb] = bgLuminance < 128 ? [245, 245, 248] : [22, 24, 34];
  for (const [x, y, color] of logo.iterateWithColors()) {
    const [, , , a] = Image.colorToRGBA(color);
    if (a < 8) continue;
    logo.setPixelAt(x, y, Image.rgbaToColor(nr, ng, nb, a));
  }
}
