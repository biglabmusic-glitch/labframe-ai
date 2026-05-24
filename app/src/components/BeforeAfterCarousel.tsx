import { useEffect, useState } from 'react';
import { EXAMPLES, STYLE_ORDER } from '../lib/examples';
import { IconTooth } from './primitives/icons';

interface Props {
  /** Интервал автопереключения, мс. 0 = не переключать. */
  intervalMs?: number;
  /** Высота каждого слота "до"/"после". */
  height?: number;
}

/**
 * Карусель «до/после» по стилям — автопрокрутка clean → dark → soft.
 * Если фото 404 (юзер ещё не положил файл) — fallback на иконку зуба,
 * чтобы вёрстка не разваливалась.
 */
export function BeforeAfterCarousel({ intervalMs = 3500, height = 130 }: Props) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!intervalMs) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % STYLE_ORDER.length), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);

  const styleId = STYLE_ORDER[idx];
  const ex = EXAMPLES[styleId];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
      <div style={{ display: 'flex', gap: 8, flex: 1, minHeight: 0 }}>
        <Slot src={ex.before} label="ДО"    height={height} dark={false} />
        <Slot src={ex.after}  label="ПОСЛЕ" height={height} dark={styleId === 'dark'} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
        {STYLE_ORDER.map((s, i) => (
          <div
            key={s}
            style={{
              width: i === idx ? 18 : 6,
              height: 4,
              borderRadius: 2,
              background: i === idx ? 'rgba(15,18,33,0.65)' : 'rgba(15,18,33,0.25)',
              transition: 'width 0.3s ease, background 0.3s ease',
            }}
          />
        ))}
      </div>
    </div>
  );
}

function Slot({
  src,
  label,
  height,
  dark,
}: {
  src: string;
  label: string;
  height: number;
  dark: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      style={{
        flex: 1,
        height,
        borderRadius: 16,
        background: dark ? 'var(--c-bg)' : '#F4F6FB',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: 'inset 0 0 0 1px rgba(15,18,33,0.05)',
      }}
    >
      {!failed ? (
        <img
          src={src}
          alt={label}
          onError={() => setFailed(true)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      ) : (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: dark ? 'rgba(239,243,255,0.85)' : 'rgba(15,18,33,0.35)',
          }}
        >
          <IconTooth size={40} />
        </div>
      )}
      <div
        className="mono"
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          fontSize: 9,
          letterSpacing: 1,
          fontWeight: 600,
          padding: '3px 8px',
          borderRadius: 6,
          background: dark
            ? 'rgba(15,18,33,0.55)'
            : 'rgba(255,255,255,0.85)',
          color: dark ? 'var(--c-accent)' : 'rgba(15,18,33,0.7)',
          backdropFilter: 'blur(6px)',
        }}
      >
        {label}
      </div>
    </div>
  );
}
