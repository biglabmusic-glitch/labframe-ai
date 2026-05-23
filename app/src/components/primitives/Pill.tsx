import type { CSSProperties, ReactNode } from 'react';

type PillKind = 'dark' | 'light' | 'white' | 'accent' | 'ghost' | 'outline';
type PillSize = 'sm' | 'md' | 'lg';

interface PillProps {
  children: ReactNode;
  kind?: PillKind;
  size?: PillSize;
  icon?: ReactNode;
  iconRight?: ReactNode;
  onClick?: () => void;
  style?: CSSProperties;
}

const SIZES: Record<PillSize, [number, number, string]> = {
  sm: [32, 12, '0 12px'],
  md: [40, 14, '0 16px'],
  lg: [48, 15, '0 20px'],
};

const KINDS: Record<PillKind, { bg: string; fg: string; border?: string }> = {
  dark:    { bg: 'var(--c-card-dd)', fg: 'var(--c-on-dark)' },
  light:   { bg: 'var(--c-card-l)',  fg: 'var(--c-ink)' },
  white:   { bg: '#fff',             fg: 'var(--c-ink)' },
  accent:  { bg: 'var(--c-accent)',  fg: 'var(--c-ink)' },
  ghost:   { bg: 'rgba(239,243,255,0.06)', fg: 'var(--c-on-dark)', border: '1px solid var(--c-line)' },
  outline: { bg: 'transparent',      fg: 'var(--c-on-dark)', border: '1px solid var(--c-line)' },
};

export function Pill({
  children,
  kind = 'dark',
  size = 'md',
  icon,
  iconRight,
  onClick,
  style,
}: PillProps) {
  const [h, fs, pad] = SIZES[size];
  const s = KINDS[kind];
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick() : undefined}
      style={{
        height: h,
        padding: pad,
        borderRadius: 999,
        background: s.bg,
        color: s.fg,
        border: s.border ?? 'none',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        fontSize: fs,
        fontWeight: 500,
        letterSpacing: -0.1,
        whiteSpace: 'nowrap',
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
        ...style,
      }}
    >
      {icon}
      {children}
      {iconRight}
    </div>
  );
}
