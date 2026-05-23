import type { CSSProperties, ReactNode } from 'react';

type Kind = 'dark' | 'deep' | 'light' | 'white' | 'accent' | 'ghost';

interface CardProps {
  children: ReactNode;
  kind?: Kind;
  pad?: number;
  radius?: number;
  onClick?: () => void;
  style?: CSSProperties;
}

const KINDS: Record<Kind, { bg: string; fg: string }> = {
  dark:   { bg: 'var(--c-card-d)',          fg: 'var(--c-on-dark)' },
  deep:   { bg: 'var(--c-card-dd)',         fg: 'var(--c-on-dark)' },
  light:  { bg: 'var(--c-card-l)',          fg: 'var(--c-ink)' },
  white:  { bg: '#fff',                     fg: 'var(--c-ink)' },
  accent: { bg: 'var(--c-accent)',          fg: 'var(--c-ink)' },
  ghost:  { bg: 'rgba(239,243,255,0.04)',   fg: 'var(--c-on-dark)' },
};

export function Card({
  children,
  kind = 'dark',
  pad = 18,
  radius = 24,
  onClick,
  style,
}: CardProps) {
  const s = KINDS[kind];
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick() : undefined}
      style={{
        background: s.bg,
        color: s.fg,
        borderRadius: radius,
        padding: pad,
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
