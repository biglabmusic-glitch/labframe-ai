import { useRef, useState, type PointerEvent } from 'react';
import { locateManualSmileCrop, type SmileCropPoint } from '../lib/smile-crop-geometry';

interface Props {
  url: string; width: number; height: number; preparing: boolean;
  onChange: () => void; onConfirm: (points: SmileCropPoint[]) => void;
}
const LABELS = ['Левый край', 'Верхний левый край', 'Верхний центр', 'Верхний правый край',
  'Правый край', 'Нижний правый край', 'Нижний центр', 'Нижний левый край'];

export function SmileCropBoundary({ url, width, height, preparing, onChange, onConfirm }: Props) {
  const [points, setPoints] = useState<SmileCropPoint[]>(() => Array.from({ length: 8 }, (_, i) => {
    const angle = Math.PI + i * Math.PI / 4;
    return { x: width * (0.5 + 0.32 * Math.cos(angle)), y: height * (0.52 + 0.18 * Math.sin(angle)) };
  }));
  const drag = useRef<{ id: number; index: number; x: number; y: number; points: SmileCropPoint[] } | null>(null);
  let valid = true;
  try { locateManualSmileCrop(width, height, points); } catch { valid = false; }
  const radius = Math.max(width / 40, 6);
  const move = (index: number, x: number, y: number) => {
    onChange();
    setPoints((old) => old.map((p, i) => i === index ? { x: Math.max(0, Math.min(width, x)), y: Math.max(0, Math.min(height, y)) } : p));
  };
  function position(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width * width, y: (event.clientY - rect.top) / rect.height * height };
  }
  function start(event: PointerEvent<SVGSVGElement>) {
    const index = Number((event.target as Element).getAttribute('data-point'));
    if (!(event.target as Element).hasAttribute('data-point')) return;
    event.preventDefault(); const p = position(event);
    drag.current = { id: event.pointerId, index, ...p, points };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function update(event: PointerEvent<SVGSVGElement>) {
    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    const p = position(event);
    if (active.index >= 0) move(active.index, p.x, p.y);
    else {
      const dx = Math.max(-Math.min(...active.points.map((v) => v.x)), Math.min(width - Math.max(...active.points.map((v) => v.x)), p.x - active.x));
      const dy = Math.max(-Math.min(...active.points.map((v) => v.y)), Math.min(height - Math.max(...active.points.map((v) => v.y)), p.y - active.y));
      onChange(); setPoints(active.points.map((v) => ({ x: v.x + dx, y: v.y + dy })));
    }
  }
  return <div className="smile-boundary-editor">
    <p className="smile-hint">Переместите точки по внутреннему краю губ: внутри контура должны быть видимые зубы. За середину можно сдвинуть всю область.</p>
    <svg viewBox={`0 0 ${width} ${height}`} style={{ aspectRatio: `${width} / ${height}` }}
      onPointerDown={start} onPointerMove={update} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
      aria-label="Область изменения на обрезанной улыбке">
      <image href={url} width={width} height={height} />
      <polygon points={points.map((p) => `${p.x},${p.y}`).join(' ')} fill="rgba(147,213,225,.22)" stroke={valid ? '#93d5e1' : '#f2b29b'} strokeWidth={width / 200} data-point="-1" />
      {points.map((p, index) => <g key={index} role="slider" tabIndex={0} aria-label={LABELS[index]} aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={Math.round(p.x / width * 100)} aria-valuetext={`${Math.round(p.x / width * 100)}% по горизонтали, ${Math.round(p.y / height * 100)}% по вертикали`}
        onKeyDown={(event) => {
          const step = Math.max(1, Math.round(width / (event.shiftKey ? 50 : 250)));
          if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
            event.preventDefault(); move(index, p.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
              p.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0));
          }
        }}><circle cx={p.x} cy={p.y} r={radius * 2.2} fill="transparent" data-point={index} />
        <circle cx={p.x} cy={p.y} r={radius} fill="#93d5e1" stroke="#0f1221" strokeWidth={radius / 4} pointerEvents="none" /></g>)}
    </svg>
    {!valid && <p role="alert" className="smile-hint">Раздвиньте точки: нужен широкий контур рта без пересечений.</p>}
    <button type="button" className="smile-secondary" disabled={!valid || preparing} onClick={() => onConfirm(points.map((p) => ({ ...p })))}>
      {preparing ? 'Подготавливаем фрагмент…' : 'Подтвердить область улыбки'}
    </button>
  </div>;
}
