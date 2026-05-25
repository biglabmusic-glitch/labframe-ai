import { useState } from 'react';
import { Screen } from '../components/Screen';
import { ScreenIntro } from '../components/ScreenIntro';
import { Card } from '../components/primitives/Card';
import { Pill } from '../components/primitives/Pill';
import { useMainButton } from '../telegram/useMainButton';
import { useBackButton } from '../telegram/useBackButton';
import { useRouter } from '../router/Router';
import { useApp } from '../state/AppContext';
import { EXAMPLES, STYLE_ORDER } from '../lib/examples';
import type { StyleId } from '../state/types';

const FILTERS: Array<{ key: 'all' | StyleId; label: string }> = [
  { key: 'all',   label: 'Все' },
  { key: 'clean', label: 'Clean White' },
  { key: 'dark',  label: 'Premium Dark' },
  { key: 'soft',  label: 'Soft Studio' },
];

export function ScreenExamples() {
  const [filter, setFilter]   = useState<'all' | StyleId>('all');
  const [feature, setFeature] = useState<StyleId>('dark');
  const { back, reset }       = useRouter();
  const { resetDraft, setDraft } = useApp();

  useBackButton(back);
  useMainButton({
    text: 'Создать такой же пост',
    onClick: () => {
      resetDraft();
      setDraft({ style: feature });
      reset('upload');
    },
  });

  const gridStyles: StyleId[] = filter === 'all' ? STYLE_ORDER : [filter];
  const featureItem = EXAMPLES[feature];

  return (
    <Screen>
      <ScreenIntro
        title="Примеры работ"
        sub="Реальные обработки. Любой пример можно повторить в один тап."
      />

      <div
        className="no-scrollbar"
        style={{ padding: '0 22px 14px', display: 'flex', gap: 6, overflowX: 'auto' }}
      >
        {FILTERS.map((f) => (
          <Pill
            key={f.key}
            size="sm"
            kind={filter === f.key ? 'accent' : 'ghost'}
            onClick={() => {
              setFilter(f.key);
              if (f.key !== 'all') setFeature(f.key);
            }}
          >
            {f.label}
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
                background: '#1A1D2A',
                aspectRatio: '1 / 1',
              }}
            >
              <img
                src={featureItem.before}
                alt="до"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
              <div
                className="mono"
                style={{
                  position: 'absolute',
                  top: 8,
                  left: 8,
                  padding: '3px 7px',
                  background: 'rgba(15,18,33,0.55)',
                  borderRadius: 999,
                  fontSize: 9,
                  letterSpacing: 0.8,
                  color: 'rgba(239,243,255,0.9)',
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
                aspectRatio: '1 / 1',
              }}
            >
              <img
                src={featureItem.after}
                alt="после"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
              <div
                className="mono"
                style={{
                  position: 'absolute',
                  top: 8,
                  left: 8,
                  padding: '3px 7px',
                  background: 'rgba(15,18,33,0.55)',
                  borderRadius: 999,
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
              <div style={{ fontSize: 13, fontWeight: 600 }}>{featureItem.label}</div>
              <div style={{ fontSize: 11, color: 'var(--c-on-dark-2)' }}>обработка ~14 сек</div>
            </div>
            <Pill
              size="sm"
              kind="accent"
              onClick={() => {
                resetDraft();
                setDraft({ style: feature });
                reset('upload');
              }}
            >
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
        {gridStyles.map((sid) => {
          const it     = EXAMPLES[sid];
          const isDark = sid === 'dark';
          const active = sid === feature;
          return (
            <button
              key={sid}
              type="button"
              onClick={() => setFeature(sid)}
              style={{
                position: 'relative',
                aspectRatio: '1 / 1',
                borderRadius: 18,
                overflow: 'hidden',
                padding: 0,
                border: active ? '2px solid var(--c-accent)' : '1px solid var(--c-line)',
                cursor: 'pointer',
                background: '#0F1221',
              }}
            >
              <img
                src={it.after}
                alt={it.label}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: 8,
                  left: 8,
                  padding: '3px 8px',
                  background: isDark ? 'rgba(15,18,33,0.55)' : 'rgba(255,255,255,0.85)',
                  borderRadius: 999,
                  fontSize: 9,
                  fontWeight: 500,
                  color: isDark ? 'var(--c-on-dark)' : 'var(--c-ink)',
                }}
              >
                {it.label}
              </div>
            </button>
          );
        })}
      </div>
    </Screen>
  );
}
