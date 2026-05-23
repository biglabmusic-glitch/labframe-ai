import type { CSSProperties, ReactNode } from 'react';

type Kind = 'dark' | 'light' | 'accent' | 'ghost' | 'onlight';

interface TagProps {
  children: ReactNode;
  kind?: Kind;
  style?: CSSProperties;
}

const KINDS: Record<Kind, { bg: string; fg: string }> = {
  dark:    { bg: 'rgba(15,18,33,0.6)',    fg: '#EFF3FF' },
  light:   { bg: 'rgba(239,243,255,0.85)', fg: 'var(--c-ink)' },
  accent:  { bg: 'var(--c-accent)',        fg: 'var(--c-ink)' },
  ghost:   { bg: 'rgba(239,243,255,0.08)', fg: 'var(--c-on-dark)' },
  onlight: { bg: 'rgba(15,18,33,0.06)',    fg: 'var(--c-ink)' },
};

export function Tag({ children, kind = 'dark', style }: TagProps) {
  const s = KINDS[kind];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 10px',
        borderRadius: 999,
        background: s.bg,
        color: s.fg,
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: 0.1,
        ...style,
      }}
    >
      {children}
    </span>
  );
}
