import { useEffect, useRef, useState } from 'react';
import { FONTS_BY_ID } from '../lib/fonts';
import type { BrandData } from '../state/types';

interface Props {
  /** URL чистой картинки из storage (без подписи/лога). */
  src: string;
  /** Параметры бренда из useApp(). */
  brand: BrandData;
  /** Что юзер выбрал в текущей сессии (logo / name / none). */
  branding: 'logo' | 'name' | 'none';
  /** Стиль работы — для подбора цвета подписи (тёмный → белая, светлый → тёмная). */
  styleId?: 'clean' | 'dark' | 'soft';
  /** Вызывается, когда canvas готов и в нём финальная картинка. Родитель использует
   *  ref для скачивания/шеринга через canvas.toBlob. */
  onReady?: (canvas: HTMLCanvasElement | null) => void;
}

const PLACEMENT_TO_POS: Record<BrandData['logoPlacement'], { x: 'left' | 'right'; y: 'top' | 'bottom' }> = {
  'bottom-right': { x: 'right', y: 'bottom' },
  'bottom-left':  { x: 'left',  y: 'bottom' },
  'top-right':    { x: 'right', y: 'top' },
  'top-left':     { x: 'left',  y: 'top' },
};

/**
 * Рендерит сгенерированную картинку и накладывает подпись/лого ПОВЕРХ через canvas.
 * AI получает чистую картинку без текста (image-модели рендерят шрифты ужасно),
 * а тут мы используем настоящий Google Font юзера для гарантированно красивой подписи.
 *
 * При готовности canvas передаётся наверх через onReady — там его можно превратить в Blob
 * для скачивания.
 */
export function BrandedResult({ src, brand, branding, styleId, onReady }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [, setRevision] = useState(0);  // принудительный re-render на ресайз картинки

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // 1. Загрузить картинку (с CORS чтобы canvas не tainted при toBlob).
      const img = await loadImage(src);
      if (cancelled) return;

      // Размеры canvas = размеры исходной картинки (рендерим в нативном разрешении).
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);

      // 2. Подпись/лого только если юзер выбрал.
      const fontDef = FONTS_BY_ID[brand.fontId ?? 'inter'] ?? FONTS_BY_ID.inter;
      const placement = PLACEMENT_TO_POS[brand.logoPlacement];

      if (branding === 'name') {
        const name = (brand.masterName || brand.labName || '').trim();
        if (name) {
          // Перед drawText гарантируем что Google Font реально загружен в браузер.
          // Без этого canvas нарисует system fallback (Arial), и обещанный Playfair / Cormorant
          // никак не отрисуется.
          await ensureFontLoaded(fontDef.cssFamily, 64);
          drawSignature(ctx, name, fontDef.cssFamily, placement, styleId);
        }
      } else if (branding === 'logo' && brand.logoUrl) {
        try {
          const logo = await loadImage(brand.logoUrl);
          if (cancelled) return;
          drawLogo(ctx, logo, placement, styleId);
        } catch { /* лого не доступен — пропускаем */ }
      }

      if (!cancelled) {
        setRevision((r) => r + 1);
        onReady?.(canvas);
      }
    })();
    return () => { cancelled = true; };
    // src и параметры — все важные для перерисовки.
  }, [src, brand.fontId, brand.masterName, brand.labName, brand.logoUrl, brand.logoPlacement, branding, styleId, onReady]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 24 }}
    />
  );
}

// Грузим картинку так, чтобы canvas НЕ стал tainted. Если рисовать cross-origin <img>
// напрямую, canvas «пачкается» и canvas.toBlob() кидает SecurityError — скачивание
// тогда откатывается на чистый файл без лого/подписи (ровно этот баг).
// Решение: тянем байты через fetch → blob → object URL (same-origin) и уже его рисуем.
// cache:'reload' обходит «отравленный» no-cors кэш-энтри: Telegram мог предзагрузить ту же
// картинку из чата без CORS, и обычный fetch достал бы непрозрачный ответ.
function loadImage(src: string): Promise<HTMLImageElement> {
  return fetchAsBlobImage(src).catch(() => loadFromUrl(src, 'anonymous'));
}

async function fetchAsBlobImage(src: string): Promise<HTMLImageElement> {
  const res = await fetch(src, { mode: 'cors', cache: 'reload' });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  try {
    return await loadFromUrl(objUrl);
  } finally {
    // img уже декодирован в память — object URL больше не нужен.
    URL.revokeObjectURL(objUrl);
  }
}

function loadFromUrl(src: string, crossOrigin?: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = crossOrigin;
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error('img load failed'));
    img.src = src;
  });
}

async function ensureFontLoaded(cssFamily: string, sizeForCheck: number): Promise<void> {
  // document.fonts.load принимает спецификацию вида "64px 'Playfair Display'".
  // Если шрифт уже в кеше — promise резолвится мгновенно.
  if (typeof document === 'undefined' || !document.fonts) return;
  try {
    await document.fonts.load(`${sizeForCheck}px ${cssFamily}`);
  } catch { /* если что-то пошло не так — рисуем тем что есть */ }
}

function drawSignature(
  ctx: CanvasRenderingContext2D,
  text: string,
  cssFamily: string,
  placement: { x: 'left' | 'right'; y: 'top' | 'bottom' },
  styleId?: 'clean' | 'dark' | 'soft',
) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  // Размер подписи ≈ 3.5% от меньшей стороны — читаемо, не агрессивно.
  const fontSize = Math.round(Math.min(W, H) * 0.035);
  const padding  = Math.round(Math.min(W, H) * 0.035);

  ctx.font = `500 ${fontSize}px ${cssFamily}`;
  ctx.textBaseline = placement.y === 'top' ? 'top' : 'bottom';
  ctx.textAlign    = placement.x === 'left' ? 'left' : 'right';

  // Подбор цвета: на dark стиле — белый, на clean/soft — тёмно-серый.
  const isDarkBg = styleId === 'dark';
  ctx.fillStyle = isDarkBg ? 'rgba(255,255,255,0.92)' : 'rgba(15,18,33,0.85)';

  // Лёгкая тень для читаемости на сложном фоне.
  ctx.shadowColor = isDarkBg ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.55)';
  ctx.shadowBlur  = Math.max(2, Math.round(fontSize * 0.15));
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  const x = placement.x === 'left' ? padding : W - padding;
  const y = placement.y === 'top'  ? padding : H - padding;
  ctx.fillText(text.toUpperCase(), x, y);

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur  = 0;
}

interface PreparedLogo {
  source: CanvasImageSource;
  width: number;
  height: number;
}

/**
 * Готовит логотип к наложению: убирает однотонную подложку, если она есть.
 *
 * Техники часто присылают логотип в JPEG на белом фоне. Формат прозрачности не
 * поддерживает, поэтому при наложении в углу оказывается белый прямоугольник —
 * на тёмном стиле он выглядит наклейкой, и именно это читается как «неестественно».
 *
 * Трогаем только очевидные случаи: если все четыре угла одного цвета и в файле
 * нет альфа-канала. Логотип со сложным фоном или уже вырезанный оставляем как
 * есть — вырезать «на всякий случай» опаснее, чем не вырезать.
 */
function prepareLogo(logo: HTMLImageElement): PreparedLogo {
  const w = logo.naturalWidth;
  const h = logo.naturalHeight;
  const asIs: PreparedLogo = { source: logo, width: w, height: h };
  if (!w || !h) return asIs;

  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const c = off.getContext('2d', { willReadFrequently: true });
  if (!c) return asIs;
  c.drawImage(logo, 0, 0);

  let data: ImageData;
  try {
    data = c.getImageData(0, 0, w, h);
  } catch {
    // canvas tainted — читать пиксели нельзя, накладываем как есть.
    return asIs;
  }

  const px = data.data;
  const at = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return [px[i], px[i + 1], px[i + 2], px[i + 3]] as const;
  };
  const corners = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)];

  // Прозрачность уже есть — фон вырезали за нас, лезть не нужно.
  if (corners.some((p) => p[3] < 250)) return asIs;

  // Углы должны совпадать по цвету, иначе это не подложка, а часть картинки.
  const [r0, g0, b0] = corners[0];
  const spread = Math.max(
    ...corners.map(([r, g, b]) =>
      Math.max(Math.abs(r - r0), Math.abs(g - g0), Math.abs(b - b0))),
  );
  if (spread > 12) return asIs;

  // NEAR — точно фон, FAR — точно логотип, между ними плавный переход:
  // без него по краям букв остаётся рваная кайма от сжатия JPEG.
  const NEAR = 26;
  const FAR = 64;
  for (let i = 0; i < px.length; i += 4) {
    const d = Math.max(
      Math.abs(px[i] - r0), Math.abs(px[i + 1] - g0), Math.abs(px[i + 2] - b0),
    );
    if (d <= NEAR) px[i + 3] = 0;
    else if (d < FAR) px[i + 3] = Math.round(px[i + 3] * ((d - NEAR) / (FAR - NEAR)));
  }
  c.putImageData(data, 0, 0);
  return { source: off, width: w, height: h };
}

function drawLogo(
  ctx: CanvasRenderingContext2D,
  logo: HTMLImageElement,
  placement: { x: 'left' | 'right'; y: 'top' | 'bottom' },
  styleId?: 'clean' | 'dark' | 'soft',
) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const prepared = prepareLogo(logo);
  const padding = Math.round(Math.min(W, H) * 0.035);

  // Ограничиваем и ширину, и высоту. Раньше размер считался по большей стороне,
  // и широкий логотип выходил визуально мелким, а квадратный — крупным.
  // Два предела дают им одинаковый вес в кадре.
  const maxW = Math.round(W * 0.22);
  const maxH = Math.round(Math.min(W, H) * 0.12);
  const scale = Math.min(maxW / prepared.width, maxH / prepared.height);
  const w = Math.round(prepared.width * scale);
  const h = Math.round(prepared.height * scale);
  const x = placement.x === 'left' ? padding : W - padding - w;
  const y = placement.y === 'top' ? padding : H - padding - h;

  // То же обращение, что и с подписью: лёгкая тень отделяет логотип от фона,
  // а неполная непрозрачность не даёт ему выглядеть приклеенным сверху.
  const isDarkBg = styleId === 'dark';
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.shadowColor = isDarkBg ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.55)';
  ctx.shadowBlur = Math.max(2, Math.round(maxH * 0.12));
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.drawImage(prepared.source, x, y, w, h);
  ctx.restore();
}

/** Превращает canvas в Blob (PNG), готовый для скачивания/шеринга. */
export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.92): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}
