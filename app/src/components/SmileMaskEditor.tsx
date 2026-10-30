import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';

export interface SmileMaskEditorProps {
  imageUrl: string;
  width: number;
  height: number;
  onChange: (blob: Blob | null) => void;
  disabled?: boolean;
  allowGumline?: boolean;
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
}: SmileMaskEditorProps) {
  const validSize = Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0;
  const canvasWidth = validSize ? width : 1;
  const canvasHeight = validSize ? height : 1;
  const helpId = useId();
  const sizeId = useId();
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const paintRef = useRef<HTMLCanvasElement | null>(null);
  const maskRef = useRef<HTMLCanvasElement | null>(null);
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

  const blocked = disabled || !validSize || !imageReady || !!imageError;
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
    return {
      x: Math.max(0, Math.min(canvasWidth, (event.clientX - bounds.left) * canvasWidth / bounds.width)),
      y: Math.max(0, Math.min(canvasHeight, (event.clientY - bounds.top) * canvasHeight / bounds.height)),
    };
  }

  function beginStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (blocked || activeRef.current || !event.isPrimary || event.button !== 0 || !paintRef.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    revisionRef.current++;
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p id={helpId} style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
        Закрасьте только выбранные верхние зубы. Губы, язык, нижние зубы и фон оставьте вне маски.{' '}
        {allowGumline
          ? 'Для изменения контура десны включите в маску нужный участок десны у этих зубов.'
          : 'Десну не закрашивайте.'}
      </p>
      <div role="group" aria-label="Инструменты маски" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {(['brush', 'eraser'] as const).map((value) => (
          <button key={value} type="button" aria-pressed={tool === value}
            disabled={controlsDisabled} onClick={() => setTool(value)}
            style={{ ...buttonStyle, background: tool === value ? HIGHLIGHT : buttonStyle.background,
              opacity: controlsDisabled ? 0.5 : 1, cursor: controlsDisabled ? 'default' : 'pointer' }}>
            {value === 'brush' ? 'Кисть' : 'Ластик'}
          </button>
        ))}
        <button type="button" disabled={controlsDisabled || !historyLength} onClick={undo}
          style={{ ...buttonStyle, opacity: controlsDisabled || !historyLength ? 0.5 : 1 }}>
          Отменить
        </button>
        <button type="button" disabled={controlsDisabled || !historyLength} onClick={clear}
          style={{ ...buttonStyle, opacity: controlsDisabled || !historyLength ? 0.5 : 1 }}>
          Очистить
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <label htmlFor={sizeId} style={{ fontSize: 13, whiteSpace: 'nowrap' }}>Размер: {brushSize}</label>
        <input id={sizeId} type="range" min={6} max={48} step={1} value={brushSize}
          aria-label="Размер кисти и ластика" disabled={controlsDisabled}
          onChange={(event) => setBrushSize(Number(event.currentTarget.value))}
          style={{ flex: 1, minWidth: 0, minHeight: 44, accentColor: HIGHLIGHT }} />
      </div>
      <div style={{ position: 'relative', width: '100%', aspectRatio: `${canvasWidth} / ${canvasHeight}`,
        overflow: 'hidden', borderRadius: 16, background: '#171D29' }}>
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
          onPointerDown={beginStroke} onPointerMove={extendStroke} onPointerUp={finishStroke}
          onPointerCancel={cancelStroke} onLostPointerCapture={cancelStroke}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.45,
            touchAction: 'none', cursor: blocked ? 'default' : 'crosshair' }} />
      </div>
      <p aria-live="polite" style={{ margin: 0, fontSize: 12, lineHeight: 1.4 }}>
        {!validSize ? 'Некорректный размер фото.' : imageError || exportError || (!imageReady
          ? 'Загрузка фото…' : hasMask ? 'Голубым выделена область изменения.' : 'Маска пока пустая.')}
      </p>
    </div>
  );
}
