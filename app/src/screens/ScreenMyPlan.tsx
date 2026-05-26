import { Screen } from '../components/Screen';
import { ScreenIntro } from '../components/ScreenIntro';
import { Card } from '../components/primitives/Card';
import { Pill } from '../components/primitives/Pill';
import { IconArrow, IconCheck, IconSpark } from '../components/primitives/icons';
import { UsageBar } from '../components/UsageBar';
import { LIMITS_DISABLED } from '../lib/feature-flags';
import { PLAN_BY_ID } from '../lib/plans';
import { useApp } from '../state/AppContext';
import { useBackButton } from '../telegram/useBackButton';
import { useMainButton } from '../telegram/useMainButton';
import { useRouter } from '../router/Router';

/**
 * Подписка пользователя: показывает его текущий план, что входит,
 * usage-bar и быстрые переходы:
 * — «Все тарифы»          → ScreenPricing (карточный выбор + покупка)
 * — «Сравнить все тарифы» → ScreenPlansCompare (таблица)
 */
export function ScreenMyPlan() {
  const { user } = useApp();
  const { back, push } = useRouter();
  const plan = PLAN_BY_ID[user.plan];

  useBackButton(back);
  useMainButton({
    text: user.plan === 'pro' || user.plan === 'lab' ? 'Сравнить тарифы' : 'Все тарифы',
    onClick: () => push(user.plan === 'pro' || user.plan === 'lab' ? 'plans-compare' : 'pricing'),
  });

  return (
    <Screen>
      <ScreenIntro title="Моя подписка" sub="Текущий план и что в него входит." />

      {/* Главная карточка плана */}
      <div style={{ padding: '0 16px 14px' }}>
        <Card
          kind="dark"
          pad={18}
          radius={24}
          style={{
            background:
              user.plan === 'pro'
                ? 'linear-gradient(135deg, rgba(147,213,225,0.18), rgba(147,213,225,0.06))'
                : user.plan === 'lab'
                ? 'linear-gradient(135deg, rgba(20,24,40,0.9), rgba(15,18,33,0.6))'
                : 'var(--c-card-d)',
            border: '1px solid var(--c-line)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <div>
              <div
                className="mono"
                style={{
                  fontSize: 10,
                  letterSpacing: 0.8,
                  color: 'var(--c-on-dark-3)',
                  marginBottom: 4,
                }}
              >
                ТЕКУЩИЙ ПЛАН
              </div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 600,
                  letterSpacing: -0.8,
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 8,
                }}
              >
                {plan.name}
                {plan.recommended && (
                  <Pill size="sm" kind="accent" icon={<IconSpark size={10} />}>
                    рекомендуем
                  </Pill>
                )}
              </div>
              <div style={{ fontSize: 13, color: 'var(--c-on-dark-2)', marginTop: 4 }}>
                {plan.priceRaw === '0'
                  ? 'Бесплатно · ' + plan.sub
                  : plan.priceRaw === '—'
                  ? plan.sub
                  : `${plan.price} ₽ / мес · ${plan.sub}`}
              </div>
            </div>
          </div>

          {LIMITS_DISABLED && (
            <div
              style={{
                marginTop: 14,
                padding: '8px 12px',
                borderRadius: 10,
                background: 'rgba(147,213,225,0.10)',
                border: '1px solid rgba(147,213,225,0.28)',
                fontSize: 11.5,
                color: 'var(--c-accent)',
                lineHeight: 1.4,
              }}
            >
              pre-release · лимиты пока не действуют, оплата подключится позже
            </div>
          )}

          <div
            style={{
              marginTop: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            {plan.points.map((pt) => (
              <div
                key={pt}
                style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}
              >
                <span style={{ marginTop: 2, color: 'var(--c-accent)' }}>
                  <IconCheck size={13} />
                </span>
                <span style={{ color: 'var(--c-on-dark-2)' }}>{pt}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Usage-бар: тот же что на Home, чтобы не было «другой картинки в подписке». */}
      <div style={{ padding: '0 16px 14px' }}>
        <UsageBar
          used={user.usage.used}
          limit={user.usage.limit}
          plan={user.plan}
          onUpgrade={() => push('pricing')}
        />
      </div>

      {/* Быстрые ссылки */}
      <div
        style={{
          padding: '0 16px 18px',
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: 8,
        }}
      >
        <Card kind="dark" pad={14} radius={20} onClick={() => push('pricing')}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Все тарифы</div>
              <div style={{ fontSize: 11, color: 'var(--c-on-dark-2)', marginTop: 2 }}>
                Подключить Start, Pro или Lab
              </div>
            </div>
            <IconArrow size={14} color="var(--c-on-dark-3)" />
          </div>
        </Card>
        <Card kind="dark" pad={14} radius={20} onClick={() => push('plans-compare')}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Сравнить все тарифы</div>
              <div style={{ fontSize: 11, color: 'var(--c-on-dark-2)', marginTop: 2 }}>
                Таблица возможностей по каждому плану
              </div>
            </div>
            <IconArrow size={14} color="var(--c-on-dark-3)" />
          </div>
        </Card>
      </div>
    </Screen>
  );
}
