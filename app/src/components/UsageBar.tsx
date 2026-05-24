import type { Plan } from '../state/types';

interface Props {
  used: number;
  limit: number;
  plan: Plan;
  onUpgrade: () => void;
}

const PLAN_LABEL: Record<Plan, string> = {
  free:  'Free',
  start: 'Start',
  pro:   'Pro',
  lab:   'Lab',
};

/**
 * Карточка-прогресс «использовано X из Y».
 * Безлимит (pro/lab) рисуется без полосы, с пометкой «без ограничений».
 * При исчерпании Free — кнопка «улучшить» подсвечивается, заголовок становится красным.
 */
export function UsageBar({ used, limit, plan, onUpgrade }: Props) {
  const unlimited = plan === 'pro' || plan === 'lab';
  const pct       = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
  const exhausted = !unlimited && used >= limit;
  const remaining = Math.max(0, limit - used);

  const titleColor =
    exhausted ? '#F4B19A'
    : unlimited ? 'var(--c-accent)'
    : 'var(--c-on-dark)';

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 22,
        background: 'var(--c-card-d)',
        border: '1px solid var(--c-line)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div>
          <div
            className="mono"
            style={{ fontSize: 10, letterSpacing: 0.8, color: 'var(--c-on-dark-3)' }}
          >
            ГЕНЕРАЦИИ · {PLAN_LABEL[plan].toUpperCase()}
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: -0.6,
              color: titleColor,
            }}
          >
            {unlimited
              ? 'Без ограничений'
              : exhausted
              ? 'Лимит исчерпан'
              : `${remaining} из ${limit} осталось`}
          </div>
          {!unlimited && (
            <div
              style={{ marginTop: 2, fontSize: 11.5, color: 'var(--c-on-dark-3)' }}
            >
              Использовано {used} / {limit} в этом месяце
            </div>
          )}
        </div>

        {plan === 'free' && (
          <button
            type="button"
            onClick={onUpgrade}
            style={{
              padding: '8px 14px',
              borderRadius: 999,
              border: 'none',
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: -0.1,
              cursor: 'pointer',
              background: exhausted ? 'var(--c-accent)' : 'rgba(147,213,225,0.18)',
              color: exhausted ? 'var(--c-ink)' : 'var(--c-accent)',
              whiteSpace: 'nowrap',
            }}
          >
            ✨ Улучшить
          </button>
        )}
      </div>

      {!unlimited && (
        <div
          style={{
            height: 8,
            borderRadius: 999,
            background: 'rgba(239,243,255,0.06)',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              borderRadius: 999,
              background: exhausted
                ? 'linear-gradient(90deg, #F4B19A, #E89B7E)'
                : 'linear-gradient(90deg, var(--c-accent), #B8E4EC)',
              transition: 'width 0.4s ease',
            }}
          />
        </div>
      )}
    </div>
  );
}
