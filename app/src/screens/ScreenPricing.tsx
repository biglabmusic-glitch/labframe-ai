import { useState } from 'react';
import { Screen } from '../components/Screen';
import { ScreenIntro } from '../components/ScreenIntro';
import { IconCheck } from '../components/primitives/icons';
import { useMainButton } from '../telegram/useMainButton';
import { useBackButton } from '../telegram/useBackButton';
import { useRouter } from '../router/Router';
import { WebApp } from '../telegram/webapp';
import { OWNER_TG, PACKAGES, buyLink, pluralGenerations } from '../lib/plans';
import { useApp } from '../state/AppContext';

/**
 * Покупка пакета генераций. Оплата на этом этапе ручная: кнопка открывает чат
 * с владельцем, он выставляет счёт из кабинета ЮKassa и начисляет генерации
 * в админке. Автоматический приём платежей появится на сайте вне Telegram —
 * внутри мини-аппа Telegram разрешает продавать цифровые товары только за Stars.
 */
export function ScreenPricing() {
  const [selected, setSelected] = useState<string>('p50');
  const { back } = useRouter();
  const { user } = useApp();
  const sel = PACKAGES.find((p) => p.id === selected)!;
  const canBuy = OWNER_TG !== '';

  useBackButton(back);
  useMainButton({
    text: canBuy ? `Купить ${sel.count} за ${sel.price.toLocaleString('ru-RU')} ₽` : 'Скоро',
    onClick: () => {
      if (!canBuy) return;
      WebApp?.openTelegramLink?.(buyLink(sel));
    },
  });

  return (
    <Screen>
      <ScreenIntro
        title="Пакеты генераций"
        sub="Платите только за обработки. Пакет не сгорает — тратьте когда удобно."
      />

      <div style={{ padding: '0 16px 14px' }}>
        <div
          className="mono"
          style={{ fontSize: 11, color: 'var(--c-on-dark-3)', letterSpacing: 0.4 }}
        >
          НА БАЛАНСЕ: {user.credits} {pluralGenerations(user.credits)}
        </div>
      </div>

      <div style={{ padding: '0 16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {PACKAGES.map((p) => {
          const isSelected = p.id === selected;
          return (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(p.id)}
              style={{
                padding: 18,
                borderRadius: 22,
                background: isSelected ? 'var(--c-accent)' : 'var(--c-card-d)',
                color: isSelected ? 'var(--c-ink)' : 'var(--c-on-dark)',
                border: isSelected ? 'none' : '1px solid var(--c-line)',
                position: 'relative',
                cursor: 'pointer',
              }}
            >
              {p.recommended && !isSelected && (
                <div
                  style={{
                    position: 'absolute',
                    top: 14,
                    right: 14,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 0.8,
                    padding: '4px 10px',
                    background: 'rgba(147,213,225,0.18)',
                    color: 'var(--c-accent)',
                    borderRadius: 999,
                  }}
                >
                  ВЫГОДНО
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
                <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.3 }}>
                  {p.count} {pluralGenerations(p.count)}
                </div>
                <div style={{ fontSize: 11, opacity: 0.55 }}>· {p.perUnit} ₽ за штуку</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 12 }}>
                <span style={{ fontSize: 32, fontWeight: 600, letterSpacing: -1.2 }}>
                  {p.price.toLocaleString('ru-RU')}
                </span>
                <span style={{ fontSize: 13, opacity: 0.55 }}>₽</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {p.points.map((pt) => (
                  <div
                    key={pt}
                    style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5 }}
                  >
                    <span style={{ marginTop: 2, opacity: 0.75 }}>
                      <IconCheck size={13} />
                    </span>
                    <span style={{ opacity: 0.85 }}>{pt}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          padding: '0 16px 24px',
          fontSize: 12,
          color: 'var(--c-on-dark-3)',
          lineHeight: 1.5,
        }}
      >
        {canBuy
          ? 'Нажмите кнопку внизу — откроется чат, вам выставят счёт. После оплаты генерации появятся на балансе.'
          : 'Покупка временно недоступна. Напишите нам, если нужны генерации.'}
      </div>
    </Screen>
  );
}
