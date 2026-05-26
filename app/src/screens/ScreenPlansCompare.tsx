import { Screen } from '../components/Screen';
import { ScreenIntro } from '../components/ScreenIntro';
import { IconCheck } from '../components/primitives/icons';
import { FEATURES, PLANS, type FeatureSpec, type FeatureValue } from '../lib/plans';
import { useApp } from '../state/AppContext';
import { useBackButton } from '../telegram/useBackButton';
import { useMainButton } from '../telegram/useMainButton';
import { useRouter } from '../router/Router';

/**
 * Таблица сравнения тарифов: строки — фичи, колонки — Free / Start / Pro / Lab.
 * Текущий план юзера подсвечен. MainButton — «Все тарифы» (на ScreenPricing для оплаты).
 *
 * Группировка по категориям (Лимит и форматы / Бренд и тексты / Команда и поддержка)
 * — чтобы пользователь не утонул в плоском списке из 10 строк.
 */
export function ScreenPlansCompare() {
  const { user } = useApp();
  const { back, push } = useRouter();

  useBackButton(back);
  useMainButton({
    text: 'Подключить тариф',
    onClick: () => push('pricing'),
  });

  // Группировка фич по категориям (порядок задаётся в FEATURES).
  const groups: Record<FeatureSpec['group'], FeatureSpec[]> = {
    'Лимит и форматы':       [],
    'Бренд и тексты':        [],
    'Команда и поддержка':   [],
  };
  for (const f of FEATURES) groups[f.group].push(f);

  return (
    <Screen>
      <ScreenIntro
        title="Сравнить тарифы"
        sub="Что вам даст каждый план. Текущий план подсвечен."
      />

      <div style={{ padding: '0 12px 18px' }}>
        <div
          style={{
            border: '1px solid var(--c-line)',
            borderRadius: 22,
            overflow: 'hidden',
            background: 'var(--c-card-d)',
          }}
        >
          {/* Шапка с названиями планов */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.4fr repeat(4, 1fr)',
              alignItems: 'stretch',
              borderBottom: '1px solid var(--c-line)',
              background: 'rgba(239,243,255,0.03)',
            }}
          >
            <div
              className="mono"
              style={{
                padding: '12px 10px',
                fontSize: 9.5,
                letterSpacing: 0.6,
                color: 'var(--c-on-dark-3)',
              }}
            >
              ВОЗМОЖНОСТЬ
            </div>
            {PLANS.map((p) => {
              const isCurrent = p.id === user.plan;
              return (
                <div
                  key={p.id}
                  style={{
                    padding: '10px 4px',
                    textAlign: 'center',
                    background: isCurrent ? 'rgba(147,213,225,0.10)' : 'transparent',
                    borderLeft: '1px solid var(--c-line)',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: -0.2,
                      color: isCurrent ? 'var(--c-accent)' : 'var(--c-on-dark)',
                    }}
                  >
                    {p.name}
                  </div>
                  <div
                    style={{
                      fontSize: 9.5,
                      color: 'var(--c-on-dark-3)',
                      marginTop: 2,
                    }}
                  >
                    {p.priceRaw === '—'
                      ? '—'
                      : p.priceRaw === '0'
                      ? 'бесплатно'
                      : `${p.price} ₽`}
                  </div>
                  {isCurrent && (
                    <div
                      className="mono"
                      style={{
                        position: 'absolute',
                        top: 2,
                        right: 4,
                        fontSize: 7,
                        letterSpacing: 0.5,
                        color: 'var(--c-accent)',
                        opacity: 0.8,
                      }}
                    >
                      ВЫ
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Группы фич */}
          {(Object.keys(groups) as Array<keyof typeof groups>).map((group, gi) => (
            <div key={group}>
              <div
                className="mono"
                style={{
                  padding: '12px 10px 6px',
                  fontSize: 9.5,
                  letterSpacing: 0.6,
                  color: 'var(--c-on-dark-3)',
                  background: 'rgba(239,243,255,0.02)',
                  borderTop: gi === 0 ? 'none' : '1px solid var(--c-line)',
                }}
              >
                {group.toUpperCase()}
              </div>
              {groups[group].map((f) => (
                <div
                  key={f.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.4fr repeat(4, 1fr)',
                    alignItems: 'stretch',
                    borderTop: '1px solid var(--c-line)',
                  }}
                >
                  <div
                    style={{
                      padding: '10px',
                      fontSize: 11.5,
                      color: 'var(--c-on-dark)',
                      lineHeight: 1.35,
                    }}
                  >
                    {f.label}
                  </div>
                  {PLANS.map((p) => {
                    const v: FeatureValue = p.features[f.id];
                    const isCurrent = p.id === user.plan;
                    return (
                      <div
                        key={p.id}
                        style={{
                          padding: '10px 4px',
                          textAlign: 'center',
                          fontSize: 10.5,
                          color: v === false ? 'var(--c-on-dark-3)' : 'var(--c-on-dark-2)',
                          background: isCurrent ? 'rgba(147,213,225,0.05)' : 'transparent',
                          borderLeft: '1px solid var(--c-line)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          lineHeight: 1.3,
                          wordBreak: 'break-word',
                        }}
                      >
                        {v === true ? (
                          <IconCheck size={14} color="var(--c-accent)" />
                        ) : v === false ? (
                          <span style={{ opacity: 0.4 }}>—</span>
                        ) : (
                          <span>{v}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: 14,
            fontSize: 11,
            color: 'var(--c-on-dark-3)',
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          Цены в рублях. При оплате на год — −20%. Pre-release: лимиты не действуют.
        </div>
      </div>
    </Screen>
  );
}
