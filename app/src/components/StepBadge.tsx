interface StepBadgeProps {
  n: number;
  total: number;
  label?: string;
}

export function StepBadge({ n, total, label = 'Шаг' }: StepBadgeProps) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 4px 4px 14px',
        borderRadius: 999,
        background: 'rgba(239,243,255,0.06)',
        border: '1px solid var(--c-line)',
      }}
    >
      <span
        className="mono"
        style={{ fontSize: 11, color: 'var(--c-on-dark-2)', letterSpacing: 0.5 }}
      >
        {label}
      </span>
      <span
        className="mono"
        style={{
          fontSize: 11,
          color: 'var(--c-ink)',
          background: 'var(--c-accent)',
          padding: '4px 10px',
          borderRadius: 999,
          fontWeight: 600,
        }}
      >
        {n}/{total}
      </span>
    </div>
  );
}
