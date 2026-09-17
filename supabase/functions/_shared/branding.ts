// Наложение логотипа на готовую картинку — на сервере, до отправки в чат.
//
// Раньше брендирование жило только в браузере, на канвасе мини-аппа. Из-за
// этого фотография, которую бот присылает в чат — а её как раз и сохраняют,
// чтобы выложить, — уходила без логотипа. Теперь единственная сохранённая
// версия уже с логотипом: и в чате, и в приложении, и при скачивании.
//
// Подпись именем (branding = 'name') пока остаётся на клиенте: для неё нужен
// шрифт конкретного семейства, а это отдельная история с загрузкой TTF.
//
// Что сюда реально присылают (разбор всех загруженных логотипов, сентябрь 2026):
// белый знак на чёрном скриншоте телефона с огромными полями, цветной знак
// на белом JPEG, PNG с прозрачностью — и примерно в трети случаев вовсе не
// логотип, а фото работы или селфи. Код ниже рассчитан на всё это.
//
// Работаем с сырыми пикселями, а не через методы ImageScript: его resize умеет
// только «ближайшего соседа», и логотип при уменьшении в пять-восемь раз
// рассыпался в рваные края и нечитаемый текст.
import { Image } from 'https://deno.land/x/imagescript@1.2.17/mod.ts';

export type Placement = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
type RGB = [number, number, number];

// Размер и место. Логотип подбирается по ПЛОЩАДИ: при ограничении только
// по ширине или высоте широкий знак выходит мелким, а квадратный — крупным.
const TARGET_SIDE_RATIO = 0.14;  // сторона квадрата той же площади — доля меньшей стороны кадра
const MAX_W_RATIO = 0.30;        // потолок ширины — доля ширины кадра
const MAX_H_RATIO = 0.14;        // потолок высоты — доля меньшей стороны
const PADDING_RATIO = 0.04;      // отступ от края — доля меньшей стороны
const LOGO_OPACITY = 0.95;       // чуть меньше единицы: не выглядит приклеенным

// Однотонная подложка: доля пикселей рамки, совпадающих с её медианным цветом.
const BORDER_TOLERANCE = 40;
const BORDER_SHARE = 0.9;
// Вырезание подложки: ближе NEAR к её цвету — прозрачно, дальше FAR — знак.
const NEAR = 22;
const FAR = 80;
// У логотипов полупрозрачных пикселей после вырезания до трети (градиентная
// подложка), у фото работы на тёмном фоне — две трети.
const MAX_SEMI_SHARE = 0.5;

// Цвет и контраст.
const COLORED_SATURATION = 40;   // разброс каналов, с которого пиксель считаем цветным
const COLORED_SHARE = 0.08;      // столько цветных пикселей — и логотип цветной
const LOW_CONTRAST = 45;         // разница яркости с кадром под пикселем, ниже которой его не видно
const LOST_SHARE = 0.3;          // столько знака не видно — спасаем: перекраска или свечение
const REVERSE_SHARE = 0.5;       // не видно почти весь цветной — ставим его светлую или тёмную версию

export type LogoKind = 'transparent' | 'solid' | 'photo';

export interface LogoAnalysis {
  kind: LogoKind;
  /** Цвет подложки, если она однотонная. */
  background: RGB | null;
  /** Доля пикселей рамки, совпавших с подложкой, — для отладки порогов. */
  borderShare: number;
}

/**
 * Накладывает логотип на изображение. Возвращает JPEG.
 * null — картинка не похожа на логотип (фото, селфи), накладывать нечего.
 * При сбое декодирования бросает — вызывающий решает, отдавать ли исходник.
 */
export async function applyLogo(
  baseBytes: Uint8Array,
  logoBytes: Uint8Array,
  placement: Placement,
): Promise<Uint8Array | null> {
  const base = await Image.decode(baseBytes);
  const logo = prepareLogo(await Image.decode(logoBytes));
  if (!logo) return null;

  const minSide = Math.min(base.width, base.height);
  const scale = Math.min(
    1, // не растягиваем: увеличенный логотип мылится сильнее, чем мелкий
    Math.sqrt((TARGET_SIDE_RATIO * minSide) ** 2 / (logo.width * logo.height)),
    (MAX_W_RATIO * base.width) / logo.width,
    (MAX_H_RATIO * minSide) / logo.height,
  );
  const sized = scale < 1
    ? resizeArea(logo, Math.max(1, Math.round(logo.width * scale)), Math.max(1, Math.round(logo.height * scale)))
    : logo;

  const pad = Math.round(minSide * PADDING_RATIO);
  const x = Math.max(0, placement.endsWith('left') ? pad : base.width - pad - sized.width);
  const y = Math.max(0, placement.startsWith('top') ? pad : base.height - pad - sized.height);

  const layer = adaptToBackground(sized, base, x, y);
  multiplyAlpha(layer.image, LOGO_OPACITY);
  base.composite(layer.image, x - layer.offset, y - layer.offset);
  return await base.encodeJPEG(92);
}

/**
 * Готовит логотип к наложению: вырезает подложку и обрезает пустые поля.
 * null — это не логотип, либо после вырезания ничего не осталось.
 */
export function prepareLogo(img: Image): Image | null {
  const analysis = analyzeLogo(img);
  if (analysis.kind === 'photo') return null;
  if (analysis.kind === 'solid') knockOut(img, analysis.background!);
  const trimmed = trimTransparent(img);
  if (!trimmed) return null;

  // Второй фильтр от фотографий: снимок работы на тёмном фоне проходит
  // проверку рамки, но после вырезания у него почти всё полупрозрачное —
  // тени и полутона. У логотипа полупрозрачны только края знака.
  if (analysis.kind === 'solid' && semiTransparentShare(trimmed) > MAX_SEMI_SHARE) return null;
  return trimmed;
}

/** Доля полупрозрачных пикселей среди видимых. */
function semiTransparentShare(img: Image): number {
  const px = img.bitmap;
  let visible = 0;
  let semi = 0;
  for (let i = 3; i < px.length; i += 4) {
    if (px[i] <= 24) continue;
    visible++;
    if (px[i] < 230) semi++;
  }
  return visible ? semi / visible : 1;
}

/**
 * Что за картинка пришла вместо логотипа.
 *
 * Смотрим на рамку в два пикселя. У логотипа она либо прозрачная, либо
 * почти целиком одного цвета — это подложка. У фотографии по краям всегда
 * что-то своё: стол, руки, фон комнаты.
 *
 * Фото в углу поста выглядит хуже, чем отсутствие логотипа, поэтому такое
 * не накладываем. Лучше пропустить настоящий логотип на пёстром фоне, чем
 * приклеить к работе селфи.
 */
export function analyzeLogo(img: Image): LogoAnalysis {
  const { width: w, height: h, bitmap } = img;
  const border: number[] = [];
  const take = (x: number, y: number) => border.push((y * w + x) * 4);
  for (let x = 0; x < w; x++) for (const y of [0, 1, h - 2, h - 1]) if (y >= 0 && y < h) take(x, y);
  for (let y = 2; y < h - 2; y++) for (const x of [0, 1, w - 2, w - 1]) if (x >= 0 && x < w) take(x, y);

  const transparent = border.filter((i) => bitmap[i + 3] < 200).length;
  if (transparent / border.length > 0.05) {
    return { kind: 'transparent', background: null, borderShare: 1 };
  }

  const median = (c: number) => {
    const values = border.map((i) => bitmap[i + c]).sort((a, b) => a - b);
    return values[values.length >> 1];
  };
  const bg: RGB = [median(0), median(1), median(2)];
  const matching = border.filter((i) => distance(bitmap, i, bg) <= BORDER_TOLERANCE).length;
  const borderShare = matching / border.length;

  return borderShare >= BORDER_SHARE
    ? { kind: 'solid', background: bg, borderShare }
    : { kind: 'photo', background: null, borderShare };
}

/** Насколько пиксель отличается от цвета: наибольшая разница по каналам. */
function distance(bitmap: Uint8ClampedArray, i: number, [r, g, b]: RGB): number {
  return Math.max(Math.abs(bitmap[i] - r), Math.abs(bitmap[i + 1] - g), Math.abs(bitmap[i + 2] - b));
}

/**
 * Делает однотонную подложку прозрачной.
 *
 * Края знака получают частичную прозрачность, и их цвет «отмывается» от
 * подложки: пиксель на границе белой буквы и чёрного фона — серый, и если
 * оставить его серым, на светлом кадре вокруг букв появится грязная кайма.
 * Поэтому восстанавливаем, каким он был бы без подложки.
 */
function knockOut(img: Image, bg: RGB): void {
  const px = img.bitmap;
  for (let i = 0; i < px.length; i += 4) {
    const d = distance(px, i, bg);
    if (d >= FAR) continue;
    const t = Math.max(0, (d - NEAR) / (FAR - NEAR));
    const alpha = t * t * (3 - 2 * t);
    if (alpha === 0) {
      px[i + 3] = 0;
      continue;
    }
    for (let c = 0; c < 3; c++) px[i + c] = bg[c] + (px[i + c] - bg[c]) / alpha;
    px[i + 3] = Math.round(px[i + 3] * alpha);
  }
}

/**
 * Обрезает прозрачные поля.
 *
 * Логотипы присылают скриншотом с телефона или квадратной аватаркой: сам знак
 * занимает четверть кадра, остальное — поля. Без обрезки размер считался по
 * всей картинке, и знак выходил крошечным — буквы под ним было не прочитать.
 */
function trimTransparent(img: Image): Image | null {
  const { width: w, height: h, bitmap } = img;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (bitmap[(y * w + x) * 4 + 3] < 24) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;

  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const out = new Image(cw, ch);
  for (let y = 0; y < ch; y++) {
    const from = ((minY + y) * w + minX) * 4;
    out.bitmap.set(bitmap.subarray(from, from + cw * 4), y * cw * 4);
  }
  return out;
}

/**
 * Уменьшение усреднением по площади — каждый пиксель результата собирает все
 * исходные, которые на него приходятся. Считаем в premultiplied-альфе, иначе
 * цвет прозрачных пикселей подмешивается к краям тёмной каймой.
 */
export function resizeArea(src: Image, dw: number, dh: number): Image {
  const { width: sw, height: sh, bitmap: s } = src;
  const pm = new Float32Array(sw * sh * 4);
  for (let i = 0; i < s.length; i += 4) {
    const a = s[i + 3] / 255;
    pm[i] = s[i] * a;
    pm[i + 1] = s[i + 1] * a;
    pm[i + 2] = s[i + 2] * a;
    pm[i + 3] = s[i + 3];
  }

  const wx = areaWeights(sw, dw);
  const horizontal = new Float32Array(dw * sh * 4);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < dw; x++) {
      const o = (y * dw + x) * 4;
      for (const [sx, wt] of wx[x]) {
        const i = (y * sw + sx) * 4;
        for (let c = 0; c < 4; c++) horizontal[o + c] += pm[i + c] * wt;
      }
    }
  }

  const wy = areaWeights(sh, dh);
  const out = new Image(dw, dh);
  const d = out.bitmap;
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const o = (y * dw + x) * 4;
      let r = 0, g = 0, b = 0, a = 0;
      for (const [sy, wt] of wy[y]) {
        const i = (sy * dw + x) * 4;
        r += horizontal[i] * wt;
        g += horizontal[i + 1] * wt;
        b += horizontal[i + 2] * wt;
        a += horizontal[i + 3] * wt;
      }
      const k = a > 0 ? 255 / a : 0;
      d[o] = r * k;
      d[o + 1] = g * k;
      d[o + 2] = b * k;
      d[o + 3] = a;
    }
  }
  return out;
}

/** Какие исходные пиксели и с каким весом попадают в каждый пиксель результата. */
function areaWeights(srcLen: number, dstLen: number): Array<Array<[number, number]>> {
  const scale = srcLen / dstLen;
  const result: Array<Array<[number, number]>> = [];
  for (let d = 0; d < dstLen; d++) {
    const start = d * scale;
    const end = Math.min(srcLen, (d + 1) * scale);
    const list: Array<[number, number]> = [];
    for (let i = Math.floor(start); i < Math.ceil(end); i++) {
      const overlap = Math.min(i + 1, end) - Math.max(i, start);
      if (overlap > 0) list.push([i, overlap / (end - start)]);
    }
    result.push(list);
  }
  return result;
}

/** Средняя яркость участка кадра, куда ляжет логотип. */
function averageLuminance(img: Image, x: number, y: number, w: number, h: number): number {
  const px = img.bitmap;
  let sum = 0;
  let n = 0;
  const step = Math.max(1, Math.floor(Math.min(w, h) / 24));
  for (let dy = 0; dy < h; dy += step) {
    for (let dx = 0; dx < w; dx += step) {
      const sx = x + dx;
      const sy = y + dy;
      if (sx >= img.width || sy >= img.height) continue;
      const i = (sy * img.width + sx) * 4;
      sum += luminance(px[i], px[i + 1], px[i + 2]);
      n++;
    }
  }
  return n ? sum / n : 128;
}

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Делает логотип различимым на конкретном участке кадра.
 *
 * Монохромный знак, который сливается с фоном, перекрашиваем: светлый на
 * тёмном, тёмный на светлом — так же, как подпись именем.
 *
 * Цветной бережём: фирменный цвет — это айдентика, ради которой логотип и
 * ставят. Если потерялась часть знака — например, тёмно-синие линии на чёрном
 * при хорошо видном сером тексте, — подсвечиваем только эту часть. Если
 * сливается почти весь, ставим его светлую или тёмную версию, как сделал бы
 * дизайнер: свечение вокруг целого логотипа выглядит неоном и мылит текст.
 */
function adaptToBackground(logo: Image, base: Image, x: number, y: number): { image: Image; offset: number } {
  const px = logo.bitmap;
  const bg = base.bitmap;
  const lost = new Uint8Array(logo.width * logo.height);
  let inkWeight = 0;
  let lostWeight = 0;
  let colored = 0;
  let ink = 0;

  // Контраст считаем попиксельно — с тем участком кадра, который окажется
  // прямо под каждой точкой знака. Средняя яркость обманывает: у логотипа из
  // тёмно-синих линий и серого текста она нормальная, а линии на чёрном
  // всё равно пропадают.
  for (let ly = 0; ly < logo.height; ly++) {
    for (let lx = 0; lx < logo.width; lx++) {
      const i = (ly * logo.width + lx) * 4;
      const a = px[i + 3];
      if (a < 32) continue;
      const lum = luminance(px[i], px[i + 1], px[i + 2]);
      const bx = Math.min(base.width - 1, x + lx);
      const by = Math.min(base.height - 1, y + ly);
      const j = (by * base.width + bx) * 4;
      if (Math.abs(lum - luminance(bg[j], bg[j + 1], bg[j + 2])) < LOW_CONTRAST) {
        lostWeight += a;
        lost[ly * logo.width + lx] = 1;
      }
      inkWeight += a;
      ink++;
      if (Math.max(px[i], px[i + 1], px[i + 2]) - Math.min(px[i], px[i + 1], px[i + 2]) > COLORED_SATURATION) colored++;
    }
  }
  const lostShare = ink ? lostWeight / inkWeight : 0;
  if (lostShare <= LOST_SHARE) return { image: logo, offset: 0 };

  const darkBackground = averageLuminance(base, x, y, logo.width, logo.height) < 128;
  if (colored / ink <= COLORED_SHARE || lostShare >= REVERSE_SHARE) {
    const tone: RGB = darkBackground ? [245, 245, 248] : [22, 24, 34];
    for (let i = 0; i < px.length; i += 4) {
      px[i] = tone[0];
      px[i + 1] = tone[1];
      px[i + 2] = tone[2];
    }
    return { image: logo, offset: 0 };
  }

  return withGlow(logo, lost, darkBackground ? [255, 255, 255] : [0, 0, 0]);
}

/**
 * Свечение под потерявшимися частями знака — их силуэт, чуть расширенный
 * и размытый.
 *
 * Держим его узким: широкое размытие ложится на кадр мутным пятном и
 * выглядит грязью, а узкое читается как аккуратная обводка.
 */
function withGlow(logo: Image, mask: Uint8Array, color: RGB): { image: Image; offset: number } {
  const size = Math.min(logo.width, logo.height);
  const spread = Math.max(1, Math.round(size * 0.02));  // насколько свечение шире знака
  const soft = Math.max(1, Math.round(size * 0.03));    // насколько размыт его край
  const pad = spread + soft * 2;
  const w = logo.width + pad * 2;
  const h = logo.height + pad * 2;

  let alpha: Float32Array = new Float32Array(w * h);
  for (let y = 0; y < logo.height; y++) {
    for (let x = 0; x < logo.width; x++) {
      const k = y * logo.width + x;
      if (mask[k]) alpha[(y + pad) * w + x + pad] = logo.bitmap[k * 4 + 3];
    }
  }
  alpha = maxFilter(maxFilter(alpha, w, h, spread, true), w, h, spread, false);
  // Два прохода прямоугольного размытия дают почти гауссов край.
  for (let pass = 0; pass < 2; pass++) {
    alpha = boxBlur(boxBlur(alpha, w, h, soft, true), w, h, soft, false);
  }

  const layer = new Image(w, h);
  const out = layer.bitmap;
  for (let i = 0; i < w * h; i++) {
    out[i * 4] = color[0];
    out[i * 4 + 1] = color[1];
    out[i * 4 + 2] = color[2];
    out[i * 4 + 3] = Math.min(255, alpha[i] * 0.75);
  }
  layer.composite(logo, pad, pad);
  return { image: layer, offset: pad };
}

/** Расширяет силуэт: каждая точка берёт наибольшую прозрачность соседей. */
function maxFilter(src: Float32Array, w: number, h: number, r: number, horizontal: boolean): Float32Array {
  const out = new Float32Array(src.length);
  const len = horizontal ? w : h;
  const lines = horizontal ? h : w;
  const at = (line: number, k: number) => horizontal ? line * w + k : k * w + line;
  for (let line = 0; line < lines; line++) {
    for (let k = 0; k < len; k++) {
      let m = 0;
      for (let d = Math.max(0, k - r); d <= Math.min(len - 1, k + r); d++) m = Math.max(m, src[at(line, d)]);
      out[at(line, k)] = m;
    }
  }
  return out;
}

function boxBlur(src: Float32Array, w: number, h: number, r: number, horizontal: boolean): Float32Array {
  const out = new Float32Array(src.length);
  const len = horizontal ? w : h;
  const lines = horizontal ? h : w;
  const at = (line: number, k: number) => horizontal ? line * w + k : k * w + line;
  const size = r * 2 + 1;
  for (let line = 0; line < lines; line++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[at(line, Math.min(len - 1, Math.max(0, k)))];
    for (let k = 0; k < len; k++) {
      out[at(line, k)] = acc / size;
      acc += src[at(line, Math.min(len - 1, k + r + 1))] - src[at(line, Math.max(0, k - r))];
    }
  }
  return out;
}

function multiplyAlpha(img: Image, factor: number): void {
  const px = img.bitmap;
  for (let i = 3; i < px.length; i += 4) px[i] = px[i] * factor;
}
