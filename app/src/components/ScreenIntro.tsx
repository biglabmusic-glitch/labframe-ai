import type { CSSProperties } from 'react';

interface ScreenIntroProps {
  eyebrow?: string;
  title: string;
  sub?: string;
  light?: boolean;
  style?: CSSProperties;
}

export function ScreenIntro({ eyebrow, title, sub, light = false, style }: ScreenIntroProps) {
  return (
    <div style={{ padding: '8px 22px 18px', ...style }}>
      {eyebrow && (
        <div
          className="mono"
          style={{
            fontSize: 11,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
            color: light ? 'var(--c-on-light-2)' : 'var(--c-on-dark-3)',
            marginBottom: 12,
          }}
        >
          {eyebrow}
        </div>
      )}
      <h1
        style={{
          margin: 0,
          fontSize: 26,
          lineHeight: 1.1,
          fontWeight: 600,
          letterSpacing: -0.6,
          color: light ? 'var(--c-ink)' : 'var(--c-on-dark)',
          textWrap: 'balance',
        }}
      >
        {title}
      </h1>
      {sub && (
        <p
          style={{
            margin: '12px 0 0',
            fontSize: 14,
            lineHeight: 1.45,
            fontWeight: 400,
            color: light ? 'var(--c-on-light-2)' : 'var(--c-on-dark-2)',
            textWrap: 'pretty',
          }}
        >
          {sub}
        </p>
      )}
    </div>
  );
}
