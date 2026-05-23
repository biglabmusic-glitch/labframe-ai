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
    name: 'Free Test',
    price: '0',
    sub: '3 обработки',
    kind: 'ghost',
    points: ['1 формат изображения', 'Без сохранения бренда', 'Базовый текст'],
  },
  {
    id: 'start',
    name: 'Start',
    price: '590',
    sub: '30 / месяц',
    kind: 'dark',
    points: ['Логотип в профиле', 'Тексты к постам', 'Основные форматы'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '1 490',
    sub: '150 / месяц',
    kind: 'accent',
    points: [
      'Все форматы из одной обработки',
      'Сохранение бренда и хэштегов',
      'Несколько вариантов текста',
      'Доступ к новым стилям',
    ],
  },
  {
    id: 'lab',
    name: 'Lab',
    price: '3 900',
    sub: 'до 5 сотрудников',
    kind: 'dark',
    points: ['Общий бренд лаборатории', 'Большой лимит', 'Командные роли'],
  },
];

export function ScreenPricing() {
  const [selected, setSelected] = useState<Plan>('pro');
  const [period, setPeriod] = useState<'month' | 'year'>('month');
  const { back } = useRouter();
  const sel = PLANS.find((p) => p.id === selected)!;
  const yearly = period === 'year';
  const monthlyPrice = sel.price === '0' ? 0 : Number(sel.price.replace(/\s/g, ''));
  const discountedMonthly = yearly ? Math.round(monthlyPrice * 0.8) : monthlyPrice;
  const ctaPrice = monthlyPrice === 0 ? 'Подключить Free Test' : `Подключить ${sel.name} — ${discountedMonthly.toLocaleString('ru-RU')} ₽ / мес`;

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
    </Screen>
  );
}
