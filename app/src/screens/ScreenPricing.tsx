import { useState } from 'react';
import { Screen } from '../components/Screen';
import { ScreenIntro } from '../components/ScreenIntro';
import { Pill } from '../components/primitives/Pill';
import { IconCheck } from '../components/primitives/icons';
import { useMainButton } from '../telegram/useMainButton';
import { useBackButton } from '../telegram/useBackButton';
import { useRouter } from '../router/Router';
import type { Plan } from '../state/types';

interface PlanRow {
  id: Plan;
  name: string;
  price: string;
  sub: string;
  kind: 'ghost' | 'dark' | 'accent';
  points: string[];
}

const PLANS: PlanRow[] = [
  {
    id: 'free',
    name: 'Free',
    price: '0',
    sub: '3 обработки',
    kind: 'ghost',
    points: ['1 формат изображения', 'Без сохранения бренда', 'Базовый текст'],
  },
  {
    id: 'start',
    name: 'Start',
    price: '2 000',
    sub: '20 / месяц',
    kind: 'dark',
    points: ['Логотип и бренд в посте', 'Все 3 стиля оформления', 'Тексты к постам', 'Сохранение хэштегов'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '4 500',
    sub: 'безлимит / месяц',
    kind: 'accent',
    points: [
      'Безлимит генераций',
      'Все форматы из одной обработки (1:1 + 4:5 + 9:16)',
      'Сохранение бренда и хэштегов',
      'Несколько вариантов текста',
      'Доступ к новым стилям первым',
    ],
  },
  {
    id: 'lab',
    name: 'Lab',
    price: '—',
    sub: 'для команд',
    kind: 'dark',
    points: ['Общий бренд лаборатории', 'До 5 сотрудников', 'Командные роли', 'По запросу'],
  },
];

export function ScreenPricing() {
  const [selected, setSelected] = useState<Plan>('pro');
  const [period, setPeriod] = useState<'month' | 'year'>('month');
  const { back, push } = useRouter();
  const sel = PLANS.find((p) => p.id === selected)!;
  const yearly = period === 'year';
  const rawPrice = sel.price.replace(/\s|—/g, '');
  const monthlyPrice = rawPrice === '0' || rawPrice === '' ? 0 : Number(rawPrice);
  const discountedMonthly = yearly ? Math.round(monthlyPrice * 0.8) : monthlyPrice;
  const ctaPrice =
    sel.id === 'lab'  ? 'Написать в поддержку'
    : monthlyPrice === 0 ? 'Активировать Free'
    : `Подключить ${sel.name} — ${discountedMonthly.toLocaleString('ru-RU')} ₽ / мес`;

  useBackButton(back);
  useMainButton({ text: ctaPrice, onClick: () => back() });

  return (
    <Screen>
      <ScreenIntro
        title="Тарифы"
        sub="Платите только за обработки. Без подписок на год и скрытых лимитов."
      />

      <div style={{ padding: '0 22px 14px', display: 'flex', justifyContent: 'center' }}>
        <div
          style={{
            display: 'inline-flex',
            padding: 4,
            borderRadius: 999,
            background: 'rgba(239,243,255,0.06)',
            border: '1px solid var(--c-line)',
          }}
        >
          <Pill
            size="sm"
            kind={period === 'month' ? 'accent' : 'ghost'}
            onClick={() => setPeriod('month')}
            style={period === 'month' ? {} : { background: 'transparent', border: 'none' }}
          >
            месяц
          </Pill>
          <Pill
            size="sm"
            kind={period === 'year' ? 'accent' : 'ghost'}
            onClick={() => setPeriod('year')}
            style={period === 'year' ? {} : { background: 'transparent', border: 'none' }}
          >
            год · −20%
          </Pill>
        </div>
      </div>

      <div style={{ padding: '0 16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {PLANS.map((p) => {
          const isSelected = p.id === selected;
          const isAcc = isSelected;
          const isGhost = p.kind === 'ghost' && !isSelected;
          const bg = isAcc ? 'var(--c-accent)' : isGhost ? 'transparent' : 'var(--c-card-d)';
          const fg = isAcc ? 'var(--c-ink)' : 'var(--c-on-dark)';
          const border = isGhost
            ? '1px dashed var(--c-line)'
            : isAcc
            ? 'none'
            : '1px solid var(--c-line)';
          return (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(p.id)}
              style={{
                padding: 18,
                borderRadius: 22,
                background: bg,
                color: fg,
                border,
                position: 'relative',
                cursor: 'pointer',
              }}
            >
              {isSelected && (
                <div
                  style={{
                    position: 'absolute',
                    top: 14,
                    right: 14,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 0.8,
                    padding: '4px 10px',
                    background: 'var(--c-ink)',
                    color: 'var(--c-accent)',
                    borderRadius: 999,
                  }}
                >
                  ВЫБРАН
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
                <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.3 }}>{p.name}</div>
                <div style={{ fontSize: 11, opacity: 0.55 }}>· {p.sub}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 12 }}>
                <span style={{ fontSize: 32, fontWeight: 600, letterSpacing: -1.2 }}>{p.price}</span>
                <span style={{ fontSize: 13, opacity: 0.55 }}>₽ / мес</span>
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

      <div style={{ padding: '0 16px 24px' }}>
        <button
          type="button"
          onClick={() => push('plans-compare')}
          style={{
            width: '100%',
            padding: '12px 14px',
            borderRadius: 16,
            background: 'rgba(239,243,255,0.04)',
            border: '1px solid var(--c-line)',
            color: 'var(--c-on-dark-2)',
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: -0.1,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>Сравнить все тарифы в таблице</span>
          <span style={{ color: 'var(--c-accent)' }}>→</span>
        </button>
      </div>
    </Screen>
  );
}
