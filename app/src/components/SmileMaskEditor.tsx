import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { limitMaskView, maskImagePoint, zoomMaskView, type MaskView } from '../lib/mask-viewport';

export interface SmileMaskEditorProps {
  imageUrl: string;
  width: number;
  height: number;
  onChange: (blob: Blob | null) => void;
  disabled?: boolean;
  allowGumline?: boolean;
  initialMask?: Blob;
  focusPoint?: { x: number; y: number };
}

type Tool = 'brush' | 'eraser';
type Point = { x: number; y: number };
type Stroke = { tool: Tool; size: number; points: Point[] };
type ActiveStroke = { pointerId: number; stroke: Stroke };

const HIGHLIGHT = '#00D9ED';
const buttonStyle: CSSProperties = {
  minHeight: 44,
  padding: '9px 14px',
  border: '1px solid rgba(120,132,154,0.28)',
  borderRadius: 12,
  background: 'var(--c-card-l, #F4F6FB)',
  color: 'var(--c-ink, #101321)',
  font: 'inherit',
  fontSize: 13,
};

/** White pixels may change; black pixels must remain the original patient image. */
export function SmileMaskEditor(props: SmileMaskEditorProps) {
  // A different source or size owns a fresh history and invalidates pending exports.
  return <MaskCanvas key={JSON.stringify([props.imageUrl, props.width, props.height])} {...props} />;
}

function MaskCanvas({
  imageUrl,
  width,
  height,
  onChange,
  disabled = false,
  allowGumline = false,
  initialMask,
  focusPoint,
}: SmileMaskEditorProps) {
  const validSize = Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0;
  const canvasWidth = validSize ? width : 1;
  const canvasHeight = validSize ? height : 1;
  const helpId = useId();
  const sizeId = useId();
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const paintRef = useRef<HTMLCanvasElement | null>(null);
  const maskRef = useRef<HTMLCanvasElement | null>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const baseCleared = useRef(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ view: MaskView; center: Point; distance: number } | null>(null);
  const viewRef = useRef<MaskView>({ zoom: 1, x: 0, y: 0 });
  const strokesRef = useRef<Stroke[]>([]);
  const activeRef = useRef<ActiveStroke | null>(null);
  const revisionRef = useRef(0);
  const mountedRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const [tool, setTool] = useState<Tool>('brush');
  const [brushSize, setBrushSize] = useState(18);
  const [historyLength, setHistoryLength] = useState(0);
  const [drawing, setDrawing] = useState(false);
  const [hasMask, setHasMask] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [baseLoading, setBaseLoading] = useState(false);
  const [mode, setMode] = useState<'paint' | 'pan'>(initialMask ? 'pan' : 'paint');
  const [view, setView] = useState<MaskView>(viewRef.current);
  const [imageError, setImageError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  useLayoutEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useLayoutEffect(() => {
    mountedRef.current = true;
    if (validSize) {
      const paint = document.createElement('canvas');
      const mask = document.createElement('canvas');
      paint.width = mask.width = canvasWidth;
      paint.height = mask.height = canvasHeight;
      paintRef.current = paint;
      maskRef.current = mask;
      const paintContext = paint.getContext('2d', { willReadFrequently: true });
      const maskContext = mask.getContext('2d');
      if (paintContext && maskContext && overlayRef.current?.getContext('2d')) {
        paintContext.fillStyle = maskContext.fillStyle = '#000';
        paintContext.fillRect(0, 0, canvasWidth, canvasHeight);
        maskContext.fillRect(0, 0, canvasWidth, canvasHeight);
      } else {
        setImageError('Редактор маски недоступен в этом браузере.');
      }
    }
    onChangeRef.current(null);
    return () => {
      mountedRef.current = false;
      revisionRef.current++;
      activeRef.current = null;
      paintRef.current = maskRef.current = null;
    };
  }, [canvasWidth, canvasHeight, validSize]);

  useEffect(() => {
    if (disabled && activeRef.current) cancelStroke();
  }, [disabled]);

  useEffect(() => {
    let cancelled = false;
    const rev = ++revisionRef.current;
    strokesRef.current = []; baseRef.current = null; baseCleared.current = false;
    setHistoryLength(0); setBaseLoading(Boolean(initialMask));
    if (!initialMask) { repaint(); publishMask(); return; }
    setMode('pan');
    void (async () => {
      let bitmap: ImageBitmap | undefined;
      try {
        bitmap = await createImageBitmap(initialMask);
        if (cancelled || !mountedRef.current || revisionRef.current !== rev) return;
        if (bitmap.width !== canvasWidth || bitmap.height !== canvasHeight) throw new Error('size');
        const base = document.createElement('canvas'); base.width = canvasWidth; base.height = canvasHeight;
        base.getContext('2d')!.drawImage(bitmap, 0, 0);
        baseRef.current = base; repaint(); publishMask();
      } catch {
        if (!cancelled && mountedRef.current) { setExportError('Не удалось открыть автообласть. Выделите зубы вручную.'); onChangeRef.current(null); }
      } finally { bitmap?.close(); if (!cancelled) setBaseLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [initialMask, canvasWidth, canvasHeight]);

  const blocked = disabled || baseLoading || !validSize || !imageReady || !!imageError;
  const controlsDisabled = blocked || drawing;

  function paintSegment(stroke: Stroke, from: Point, to?: Point) {
    const paint = paintRef.current?.getContext('2d');
    const overlay = overlayRef.current?.getContext('2d');
    if (!paint || !overlay) return;
    for (const [context, isOverlay] of [[paint, false], [overlay, true]] as const) {
      context.save();
      context.globalCompositeOperation = isOverlay && stroke.tool === 'eraser'
        ? 'destination-out' : 'source-over';
      context.fillStyle = context.strokeStyle = isOverlay ? HIGHLIGHT
        : stroke.tool === 'brush' ? '#fff' : '#000';
      context.lineWidth = stroke.size;
      context.lineCap = context.lineJoin = 'round';
      context.beginPath();
      if (to) {
        context.moveTo(from.x, from.y);
        context.lineTo(to.x, to.y);
        context.stroke();
      } else {
        context.arc(from.x, from.y, stroke.size / 2, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
    }
  }

  function repaint() {
    const paint = paintRef.current?.getContext('2d');
    const overlay = overlayRef.current?.getContext('2d');
    if (!paint || !overlay) return;
    paint.fillStyle = '#000';
    paint.fillRect(0, 0, canvasWidth, canvasHeight);
    if (baseRef.current && !baseCleared.current) paint.drawImage(baseRef.current, 0, 0);
    overlay.clearRect(0, 0, canvasWidth, canvasHeight);
    for (const stroke of strokesRef.current) {
      paintSegment(stroke, stroke.points[0]);
      for (let index = 1; index < stroke.points.length; index++) {
        paintSegment(stroke, stroke.points[index - 1], stroke.points[index]);
      }
    }
  }

  function publishMask() {
    const revision = ++revisionRef.current;
    const paint = paintRef.current?.getContext('2d');
    const mask = maskRef.current;
    const maskContext = mask?.getContext('2d');
    const overlay = overlayRef.current?.getContext('2d');
    if (!paint || !mask || !maskContext || !overlay) return;
    const pixels = paint.getImageData(0, 0, canvasWidth, canvasHeight);
    const highlight = overlay.createImageData(canvasWidth, canvasHeight);
    let nonempty = false;
    // Remove antialiasing from the exported mask; its alpha is always opaque.
    for (let index = 0; index < pixels.data.length; index += 4) {
      const value = pixels.data[index] >= 128 ? 255 : 0;
      pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = value;
      pixels.data[index + 3] = 255;
      if (value) {
        nonempty = true;
        highlight.data[index] = 0;
        highlight.data[index + 1] = 217;
        highlight.data[index + 2] = 237;
        highlight.data[index + 3] = 255;
      }
    }
    maskContext.putImageData(pixels, 0, 0);
    overlay.putImageData(highlight, 0, 0);
    setHasMask(nonempty);
    setExportError(null);
    if (!nonempty) {
      onChangeRef.current(null);
      return;
    }
    // Invalidate the previous export while a fresh mask blob is being prepared.
    onChangeRef.current(null);
    try {
      mask.toBlob((blob) => {
        if (!mountedRef.current || revision !== revisionRef.current) return;
        if (!blob) setExportError('Не удалось сохранить маску. Попробуйте ещё один мазок.');
        onChangeRef.current(blob);
      }, 'image/png');
    } catch {
      if (!mountedRef.current || revision !== revisionRef.current) return;
      setExportError('Не удалось сохранить маску. Попробуйте ещё один мазок.');
      onChangeRef.current(null);
    }
  }

  function pointAt(event: Pick<PointerEvent, 'clientX' | 'clientY'>): Point {
    const bounds = overlayRef.current!.getBoundingClientRect();
    return maskImagePoint(event.clientX, event.clientY, bounds, canvasWidth, canvasHeight);
  }

  function updateView(next: MaskView) { viewRef.current = next; setView(next); }
  function rebaseGesture() {
    const pts = [...pointers.current.values()], bounds = viewportRef.current?.getBoundingClientRect();
    if (!pts.length || !bounds) { gesture.current = null; return; }
    const center = pts.length > 1 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0];
    gesture.current = { view: viewRef.current, center: { x: center.x - bounds.left, y: center.y - bounds.top },
      distance: pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0 };
  }
  function beginPointer(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (mode === 'paint') { beginStroke(event); return; }
    if (blocked || event.button !== 0) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); rebaseGesture();
  }
  function movePointer(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (mode === 'paint') { extendStroke(event); return; }
    if (!pointers.current.has(event.pointerId) || !gesture.current || blocked) return;
    event.preventDefault(); pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const bounds = viewportRef.current!.getBoundingClientRect(), pts = [...pointers.current.values()], start = gesture.current;
    const center = pts.length > 1 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0];
    let next = start.view;
    if (pts.length > 1 && start.distance > 0) {
      next = zoomMaskView(start.view, start.view.zoom * Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) / start.distance,
        start.center.x, start.center.y, bounds.width, bounds.height);
    }
    updateView(limitMaskView({ ...next, x: next.x + center.x - bounds.left - start.center.x,
      y: next.y + center.y - bounds.top - start.center.y }, bounds.width, bounds.height));
  }
  function endPointer(event: ReactPointerEvent<HTMLCanvasElement>, cancel = false) {
    if (pointers.current.delete(event.pointerId)) { releaseCapture(event.pointerId); rebaseGesture(); return; }
    if (cancel) cancelStroke(event); else finishStroke(event);
  }
  function zoomTo(zoom: number) {
    if (controlsDisabled) return;
    const bounds = viewportRef.current!.getBoundingClientRect();
    const center = focusPoint ?? { x: 0.5, y: 0.5 };
    if (viewRef.current.zoom === 1 && zoom > 1) {
      updateView(limitMaskView({ zoom, x: bounds.width / 2 - center.x * bounds.width * zoom,
        y: bounds.height / 2 - center.y * bounds.height * zoom }, bounds.width, bounds.height));
    } else updateView(zoomMaskView(viewRef.current, zoom, bounds.width / 2, bounds.height / 2, bounds.width, bounds.height));
  }

  function beginStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (blocked || activeRef.current || !event.isPrimary || event.button !== 0 || !paintRef.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    revisionRef.current++;
    onChangeRef.current(null);
    const stroke: Stroke = {
      tool,
      size: brushSize * canvasWidth / bounds.width,
      points: [pointAt(event)],
    };
    activeRef.current = { pointerId: event.pointerId, stroke };
    setDrawing(true);
    paintSegment(stroke, stroke.points[0]);
  }

  function extendStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    const active = activeRef.current;
    if (blocked || !active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    const native = event.nativeEvent;
    const coalesced = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [];
    for (const sample of coalesced.length ? coalesced : [native]) {
      const point = pointAt(sample);
      const previous = active.stroke.points[active.stroke.points.length - 1];
      if (point.x === previous.x && point.y === previous.y) continue;
      paintSegment(active.stroke, previous, point);
      active.stroke.points.push(point);
    }
  }

  function releaseCapture(pointerId: number) {
    const canvas = overlayRef.current;
    if (canvas?.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
  }

  function finishStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    const active = activeRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (blocked) { cancelStroke(); return; }
    extendStroke(event);
    activeRef.current = null;
    strokesRef.current.push(active.stroke);
    setHistoryLength(strokesRef.current.length);
    setDrawing(false);
    releaseCapture(event.pointerId);
    publishMask();
  }

  function cancelStroke(event?: ReactPointerEvent<HTMLCanvasElement>) {
    const active = activeRef.current;
    if (!active || (event && event.pointerId !== active.pointerId)) return;
    activeRef.current = null;
    revisionRef.current++;
    setDrawing(false);
    releaseCapture(active.pointerId);
    repaint();
    publishMask();
  }

  function undo() {
    if (controlsDisabled || activeRef.current || !strokesRef.current.length) return;
    strokesRef.current.pop();
    setHistoryLength(strokesRef.current.length);
    repaint();
    publishMask();
  }

  function clear() {
    if (controlsDisabled || activeRef.current) return;
    revisionRef.current++;
    strokesRef.current = [];
    baseCleared.current = true;
    setHistoryLength(0);
    setHasMask(false);
    setExportError(null);
    repaint();
    const mask = maskRef.current?.getContext('2d');
    if (mask) {
      mask.fillStyle = '#000';
      mask.fillRect(0, 0, canvasWidth, canvasHeight);
    }
    onChangeRef.current(null);
  }

  function restoreBase() {
    if (controlsDisabled) return;
    strokesRef.current = []; baseCleared.current = false; setHistoryLength(0);
    repaint(); publishMask();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p id={helpId} style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
        {initialMask ? 'Проверьте голубую автообласть. При необходимости уточните её кистью или ластиком.' : 'Закрасьте только выбранные верхние зубы.'} Губы, язык, нижние зубы и фон оставьте вне маски.{' '}
        {allowGumline
          ? 'Для изменения контура десны включите в маску нужный участок десны у этих зубов.'
          : 'Десну не закрашивайте.'}
      </p>
      <div role="group" aria-label="Масштаб и перемещение" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" onClick={() => zoomTo(view.zoom / 1.5)} disabled={controlsDisabled || view.zoom <= 1} style={buttonStyle} aria-label="Отдалить">−</button>
        <button type="button" onClick={() => zoomTo(1)} disabled={controlsDisabled} style={buttonStyle}>{Math.round(view.zoom * 100)}%</button>
        <button type="button" onClick={() => zoomTo(view.zoom * 1.5)} disabled={controlsDisabled || view.zoom >= 6} style={buttonStyle} aria-label="Приблизить">+</button>
        <button type="button" aria-pressed={mode === 'pan'} onClick={() => setMode('pan')} disabled={controlsDisabled} style={{ ...buttonStyle, background: mode === 'pan' ? HIGHLIGHT : buttonStyle.background }}>Переместить</button>
        <button type="button" aria-pressed={mode === 'paint'} onClick={() => setMode('paint')} disabled={controlsDisabled} style={{ ...buttonStyle, background: mode === 'paint' ? HIGHLIGHT : buttonStyle.background }}>Уточнить кистью</button>
      </div>
      <p style={{ margin: 0, fontSize: 11 }}>{mode === 'pan' ? 'Перемещайте фото одним пальцем, увеличивайте двумя или кнопками +/−.' : 'Рисование включено. Для перемещения и увеличения двумя пальцами выберите «Переместить».'}</p>
      <div role="group" aria-label="Инструменты маски" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {(['brush', 'eraser'] as const).map((value) => (
          <button key={value} type="button" aria-pressed={tool === value}
            disabled={controlsDisabled} onClick={() => { setTool(value); setMode('paint'); }}
            style={{ ...buttonStyle, background: tool === value ? HIGHLIGHT : buttonStyle.background,
              opacity: controlsDisabled ? 0.5 : 1, cursor: controlsDisabled ? 'default' : 'pointer' }}>
            {value === 'brush' ? 'Кисть' : 'Ластик'}
          </button>
        ))}
        <button type="button" disabled={controlsDisabled || !historyLength} onClick={undo}
          style={{ ...buttonStyle, opacity: controlsDisabled || !historyLength ? 0.5 : 1 }}>
          Отменить
        </button>
        <button type="button" disabled={controlsDisabled || !hasMask} onClick={clear}
          style={{ ...buttonStyle, opacity: controlsDisabled || !hasMask ? 0.5 : 1 }}>
          Очистить
        </button>
        {initialMask && <button type="button" disabled={controlsDisabled} onClick={restoreBase} style={buttonStyle}>Вернуть автообласть</button>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <label htmlFor={sizeId} style={{ fontSize: 13, whiteSpace: 'nowrap' }}>Размер: {brushSize}</label>
        <input id={sizeId} type="range" min={2} max={48} step={1} value={brushSize}
          aria-label="Размер кисти и ластика" disabled={controlsDisabled}
          onChange={(event) => setBrushSize(Number(event.currentTarget.value))}
          style={{ flex: 1, minWidth: 0, minHeight: 44, accentColor: HIGHLIGHT }} />
      </div>
      <div ref={viewportRef} style={{ position: 'relative', width: '100%', aspectRatio: `${canvasWidth} / ${canvasHeight}`,
        overflow: 'hidden', borderRadius: 16, background: '#171D29' }}>
        <div style={{ position: 'absolute', inset: 0, transformOrigin: '0 0', transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
        <img src={imageUrl} width={canvasWidth} height={canvasHeight} draggable={false}
          alt="Исходное фото пациента для выделения верхних зубов"
          onLoad={(event) => {
            if (event.currentTarget.naturalWidth !== width || event.currentTarget.naturalHeight !== height) {
              setImageError('Размер фото не совпал с маской. Загрузите фото заново.');
              return;
            }
            setImageReady(true);
          }}
          onError={() => setImageError('Не удалось открыть фото. Загрузите его заново.')}
          style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain',
            pointerEvents: 'none', userSelect: 'none' }} />
        <canvas ref={overlayRef} width={canvasWidth} height={canvasHeight} role="img"
          aria-label="Маска изменения: рисуйте кистью поверх выбранных верхних зубов"
          aria-describedby={helpId} aria-disabled={blocked}
          onPointerDown={beginPointer} onPointerMove={movePointer} onPointerUp={(event) => endPointer(event)}
          onPointerCancel={(event) => endPointer(event, true)} onLostPointerCapture={(event) => endPointer(event, true)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.45,
            touchAction: 'none', cursor: blocked ? 'default' : mode === 'pan' ? 'grab' : 'crosshair' }} />
        </div>
      </div>
      <p aria-live="polite" style={{ margin: 0, fontSize: 12, lineHeight: 1.4 }}>
        {!validSize ? 'Некорректный размер фото.' : imageError || exportError || (!imageReady
          ? 'Загрузка фото…' : hasMask ? 'Голубым выделена область изменения.' : 'Маска пока пустая.')}
      </p>
    </div>
  );
}
