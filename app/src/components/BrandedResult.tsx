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
          drawLogo(ctx, logo, placement);
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

function drawLogo(
  ctx: CanvasRenderingContext2D,
  logo: HTMLImageElement,
  placement: { x: 'left' | 'right'; y: 'top' | 'bottom' },
) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  // Лого ≈ 12% по большей стороне работы — заметно, но не доминирует.
  const target = Math.round(Math.min(W, H) * 0.12);
  const padding = Math.round(Math.min(W, H) * 0.035);
  // Сохраняем aspect ratio лого (даже если оно прямоугольное — мы кропим перед upload, но всё же).
  const scale = target / Math.max(logo.naturalWidth, logo.naturalHeight);
  const w = Math.round(logo.naturalWidth * scale);
  const h = Math.round(logo.naturalHeight * scale);
  const x = placement.x === 'left' ? padding : W - padding - w;
  const y = placement.y === 'top'  ? padding : H - padding - h;
  ctx.drawImage(logo, x, y, w, h);
}

/** Превращает canvas в Blob (PNG), готовый для скачивания/шеринга. */
export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.92): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}
