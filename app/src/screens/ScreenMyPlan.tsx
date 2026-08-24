import { Screen } from '../components/Screen';
import { ScreenIntro } from '../components/ScreenIntro';
import { Card } from '../components/primitives/Card';
import { IconArrow } from '../components/primitives/icons';
import { UsageBar } from '../components/UsageBar';
import { pluralGenerations } from '../lib/plans';
import { useApp } from '../state/AppContext';
import { useBackButton } from '../telegram/useBackButton';
import { useMainButton } from '../telegram/useMainButton';
import { useRouter } from '../router/Router';

/**
 * Баланс пользователя: сколько генераций осталось, как они тратятся
 * и переход к покупке пакета.
 */
export function ScreenMyPlan() {
  const { user } = useApp();
  const { back, push } = useRouter();

  useBackButton(back);
  useMainButton({ text: 'Пополнить баланс', onClick: () => push('pricing') });

  return (
    <Screen>
      <ScreenIntro title="Мой баланс" sub="Сколько генераций осталось и как они тратятся." />

      <div style={{ padding: '0 16px 14px' }}>
        <Card
          kind="dark"
          pad={18}
          radius={24}
          style={{
            background: 'linear-gradient(135deg, rgba(147,213,225,0.18), rgba(147,213,225,0.06))',
            border: '1px solid var(--c-line)',
          }}
        >
          <div
            className="mono"
            style={{
              fontSize: 10,
              letterSpacing: 0.8,
              color: 'var(--c-on-dark-3)',
              marginBottom: 4,
            }}
          >
            ОСТАТОК
          </div>
          <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: -1.4, lineHeight: 1.1 }}>
            {user.credits}
          </div>
          <div style={{ fontSize: 13, color: 'var(--c-on-dark-2)', marginTop: 4 }}>
            {pluralGenerations(user.credits)} · не сгорают
          </div>

          <div
            style={{
              marginTop: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              fontSize: 13,
              color: 'var(--c-on-dark-2)',
            }}
          >
            <div>Обычная генерация — 1 с баланса</div>
            <div>Генерация с реквизитами — 3 с баланса</div>
            <div>За неудачную обработку ничего не списывается</div>
          </div>
        </Card>
      </div>

      <div style={{ padding: '0 16px 14px' }}>
        <UsageBar credits={user.credits} onUpgrade={() => push('pricing')} />
      </div>

      <div style={{ padding: '0 16px 18px' }}>
        <Card kind="dark" pad={14} radius={20} onClick={() => push('pricing')}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Пакеты генераций</div>
              <div style={{ fontSize: 11, color: 'var(--c-on-dark-2)', marginTop: 2 }}>
                От 700 ₽ за 20 генераций — чем больше пакет, тем дешевле штука
              </div>
            </div>
            <IconArrow size={14} color="var(--c-on-dark-3)" />
          </div>
        </Card>
      </div>
    </Screen>
  );
}
