import { useState } from 'react';
import { Screen } from '../components/Screen';
import { ScreenIntro } from '../components/ScreenIntro';
import { StepBadge } from '../components/StepBadge';
import { IconCheck, IconTooth } from '../components/primitives/icons';
import { useApp } from '../state/AppContext';
import { useMainButton } from '../telegram/useMainButton';
import { useBackButton } from '../telegram/useBackButton';
import { useRouter } from '../router/Router';
import type { StyleId } from '../state/types';
import { EXAMPLES } from '../lib/examples';

interface StyleEntry {
  id: StyleId;
  name: string;
  ru: string;
  desc: string;
}

const STYLES: StyleEntry[] = [
  { id: 'clean', name: 'Clean White',   ru: 'Чистый светлый', desc: 'Светлый чистый фон, медицинская подача.' },
  { id: 'dark',  name: 'Premium Dark',  ru: 'Премиальный',    desc: 'Тёмный контрастный фон, дорогой визуал.' },
  { id: 'soft',  name: 'Soft Studio',   ru: 'Мягкая студия',  desc: 'Студийный свет, спокойная эстетика.' },
];

function Preview({ styleId }: { styleId: StyleId }) {
  const [failed, setFailed] = useState(false);
  const fallbackBg =
    styleId === 'clean' ? '#F4F6FB'
    : styleId === 'dark' ? '#0F1221'
    : 'linear-gradient(135deg,#D6EEF3 0%,#EFF3FF 100%)';
  return (
    <div
      style={{
        width: 86,
        height: 86,
        borderRadius: 18,
        background: fallbackBg,
        flexShrink: 0,
        position: 'relative',
        overflow: 'hidden',
        boxShadow: 'inset 0 0 0 1px rgba(15,18,33,0.06)',
      }}
    >
      {!failed ? (
        <img
          src={EXAMPLES[styleId].after}
          alt={EXAMPLES[styleId].label}
          onError={() => setFailed(true)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      ) : (
        <>
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '52%',
              transform: 'translate(-50%,-50%)',
              color: styleId === 'dark' ? 'rgba(239,243,255,0.85)' : 'rgba(15,18,33,0.75)',
            }}
          >
            <IconTooth size={40} />
          </div>
          <div
            style={{
              position: 'absolute',
              bottom: 8,
              right: 8,
              fontSize: 7,
              letterSpacing: 0.5,
              fontWeight: 600,
              color: styleId === 'dark' ? 'rgba(239,243,255,0.6)' : 'rgba(15,18,33,0.4)',
            }}
          >
            LAB
          </div>
        </>
      )}
    </div>
  );
}

export function ScreenStyle() {
  const { draft, setDraft } = useApp();
  const { push, back } = useRouter();

  useBackButton(back);
  const selectedStyle = STYLES.find((s) => s.id === draft.style);
  useMainButton({
    text: selectedStyle ? `Применить ${selectedStyle.name}` : 'Выберите стиль',
    onClick: () => push('individuality'),
    enabled: Boolean(draft.style),
  });

  return (
    <Screen>
      <div style={{ padding: '12px 22px 14px' }}>
        <StepBadge n={3} total={8} />
      </div>
      <ScreenIntro
        title="Выберите стиль оформления"
        sub="Стиль задаёт фон, свет и общую визуальную подачу."
      />

      <div
        style={{
          padding: '0 16px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {STYLES.map((s) => {
          const selected = draft.style === s.id;
          return (
            <div
              key={s.id}
              role="button"
              tabIndex={0}
              onClick={() => setDraft({ style: s.id })}
              style={{
                display: 'flex',
                gap: 14,
                alignItems: 'center',
                padding: 12,
                paddingRight: 16,
                borderRadius: 22,
                background: selected ? 'var(--c-card-l)' : 'var(--c-card-d)',
                color: selected ? 'var(--c-ink)' : 'var(--c-on-dark)',
                border: selected ? 'none' : '1px solid var(--c-line)',
                position: 'relative',
                cursor: 'pointer',
              }}
            >
              <Preview styleId={s.id} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.2 }}>{s.name}</div>
                <div
                  style={{ fontSize: 11, fontWeight: 500, opacity: 0.6, marginTop: 2, marginBottom: 6 }}
                >
                  {s.ru}
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    opacity: selected ? 0.7 : 0.55,
                    lineHeight: 1.35,
                  }}
                >
                  {s.desc}
                </div>
              </div>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  background: selected ? 'var(--c-ink)' : 'transparent',
                  border: selected ? 'none' : '1.5px solid rgba(239,243,255,0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {selected && <IconCheck size={13} color="var(--c-accent)" />}
              </div>
            </div>
          );
        })}
      </div>
    </Screen>
  );
}
