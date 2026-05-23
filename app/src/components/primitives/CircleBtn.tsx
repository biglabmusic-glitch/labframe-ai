import type { CSSProperties, ReactNode } from 'react';

type Kind = 'dark' | 'light' | 'white' | 'accent' | 'ghost';

interface CircleBtnProps {
  children: ReactNode;
  size?: number;
  kind?: Kind;
  onClick?: () => void;
  style?: CSSProperties;
}

const KINDS: Record<Kind, { bg: string; fg: string }> = {
  dark:   { bg: 'var(--c-card-dd)',         fg: 'var(--c-on-dark)' },
  light:  { bg: 'var(--c-card-l)',          fg: 'var(--c-ink)' },
  white:  { bg: '#fff',                     fg: 'var(--c-ink)' },
  accent: { bg: 'var(--c-accent)',          fg: 'var(--c-ink)' },
  ghost:  { bg: 'rgba(239,243,255,0.06)',   fg: 'var(--c-on-dark)' },
};

export function CircleBtn({
  children,
  size = 38,
  kind = 'dark',
  onClick,
  style,
}: CircleBtnProps) {
  const s = KINDS[kind];
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick() : undefined}
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: s.bg,
        color: s.fg,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
