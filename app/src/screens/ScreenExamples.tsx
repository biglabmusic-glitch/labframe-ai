import { useState } from 'react';
import { Screen } from '../components/Screen';
import { ScreenIntro } from '../components/ScreenIntro';
import { Card } from '../components/primitives/Card';
import { Pill } from '../components/primitives/Pill';
import { IconTooth } from '../components/primitives/icons';
import { useMainButton } from '../telegram/useMainButton';
import { useBackButton } from '../telegram/useBackButton';
import { useRouter } from '../router/Router';
import { useApp } from '../state/AppContext';

const FILTERS = ['Все', 'Clean White', 'Premium Dark', 'Soft Studio'];

const ITEMS: { style: string; type: string; bg: string; dark?: boolean }[] = [
  { style: 'Premium Dark', type: 'Виниры',  bg: '#0F1221', dark: true },
  { style: 'Clean White',  type: 'Коронка', bg: '#F4F6FB' },
  { style: 'Soft Studio',  type: 'Мост',    bg: 'linear-gradient(135deg,#D6EEF3,#EFF3FF)' },
  { style: 'Premium Dark', type: 'Коронка', bg: '#0F1221', dark: true },
  { style: 'Clean White',  type: 'Виниры',  bg: '#F4F6FB' },
  { style: 'Soft Studio',  type: 'Имплант', bg: 'linear-gradient(135deg,#EFF3FF,#D6EEF3)' },
];

export function ScreenExamples() {
  const [active, setActive] = useState(0);
  const { back, reset } = useRouter();
  const { resetDraft } = useApp();

  useBackButton(back);
  useMainButton({
    text: 'Создать такой же пост',
    onClick: () => {
      resetDraft();
      reset('upload');
    },
  });

  const items = active === 0
    ? ITEMS
    : ITEMS.filter((it) => it.style === FILTERS[active]);

  return (
    <Screen>
      <ScreenIntro
        title="Примеры работ"
        sub="Реальные обработки от мастеров. Любой пример можно повторить в один тап."
      />

      <div
        className="no-scrollbar"
        style={{ padding: '0 22px 14px', display: 'flex', gap: 6, overflowX: 'auto' }}
      >
        {FILTERS.map((f, i) => (
          <Pill
            key={f}
            size="sm"
            kind={i === active ? 'accent' : 'ghost'}
            onClick={() => setActive(i)}
          >
            {f}
          </Pill>
        ))}
      </div>

      <div style={{ padding: '0 16px 14px' }}>
        <Card kind="dark" pad={12} radius={22}>
          <div style={{ display: 'flex', gap: 8 }}>
            <div
              style={{
                flex: 1,
                position: 'relative',
                borderRadius: 14,
                overflow: 'hidden',
                background: '#7A7E89',
                height: 130,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div style={{ color: 'rgba(15,18,33,0.35)' }}>
                <IconTooth size={40} />
              </div>
              <div
                className="mono"
                style={{
                  position: 'absolute',
                  top: 8,
                  left: 8,
                  fontSize: 9,
                  letterSpacing: 0.8,
                  color: 'rgba(239,243,255,0.85)',
                }}
              >
                ДО
              </div>
            </div>
            <div
              style={{
                flex: 1,
                position: 'relative',
                borderRadius: 14,
                overflow: 'hidden',
                background: 'var(--c-bg)',
                height: 130,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div style={{ color: 'rgba(239,243,255,0.85)' }}>
                <IconTooth size={40} />
              </div>
              <div
                className="mono"
                style={{
                  position: 'absolute',
                  top: 8,
                  left: 8,
                  fontSize: 9,
                  letterSpacing: 0.8,
                  color: 'var(--c-accent)',
                }}
              >
                ПОСЛЕ
              </div>
              <div
                style={{
                  position: 'absolute',
                  bottom: 6,
                  right: 8,
                  fontSize: 7,
                  fontWeight: 700,
                  letterSpacing: 0.8,
                  color: 'rgba(239,243,255,0.55)',
                }}
              >
                LAB
              </div>
            </div>
          </div>
          <div
            style={{
              marginTop: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Premium Dark · Виниры</div>
              <div style={{ fontSize: 11, color: 'var(--c-on-dark-2)' }}>обработка 14 сек</div>
            </div>
            <Pill size="sm" kind="accent">
              повторить
            </Pill>
          </div>
        </Card>
      </div>

      <div
        style={{
          padding: '4px 16px 18px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
        }}
      >
        {items.map((it, i) => (
          <div
            key={i}
            style={{
              position: 'relative',
              height: 130,
              borderRadius: 18,
              background: it.bg,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: it.dark ? 'rgba(239,243,255,0.7)' : 'rgba(15,18,33,0.6)',
            }}
          >
            <IconTooth size={40} />
            <div
              style={{
                position: 'absolute',
                top: 8,
                left: 8,
                padding: '3px 8px',
                background: it.dark ? 'rgba(15,18,33,0.55)' : 'rgba(255,255,255,0.85)',
                borderRadius: 999,
                fontSize: 9,
                fontWeight: 500,
                color: it.dark ? 'var(--c-on-dark)' : 'var(--c-ink)',
              }}
            >
              {it.style}
            </div>
            <div
              className="mono"
              style={{
                position: 'absolute',
                bottom: 8,
                left: 10,
                fontSize: 9,
                letterSpacing: 0.4,
                opacity: 0.6,
              }}
            >
              {it.type}
            </div>
          </div>
        ))}
      </div>
    </Screen>
  );
}
