import { Screen } from '../components/Screen';
import { ScreenIntro } from '../components/ScreenIntro';
import { StepBadge } from '../components/StepBadge';
import { Card } from '../components/primitives/Card';
import { Tag } from '../components/primitives/Tag';
import { useApp } from '../state/AppContext';
import { useMainButton } from '../telegram/useMainButton';
import { useBackButton } from '../telegram/useBackButton';
import { useRouter } from '../router/Router';
import type { FormatId } from '../state/types';

interface FmtEntry {
  id: FormatId;
  label: string;
  ratio: string;
  px: string;
  w: number;
  h: number;
}

const FORMATS: FmtEntry[] = [
  { id: '4x5',  label: 'Instagram', ratio: '4:5',  px: '1080×1350', w: 60, h: 75 },
  { id: '1x1',  label: 'Квадрат',   ratio: '1:1',  px: '1080×1080', w: 70, h: 70 },
  { id: '9x16', label: 'Stories',   ratio: '9:16', px: '1080×1920', w: 44, h: 78 },
];

export function ScreenFormat() {
  const { draft, setDraft } = useApp();
  const { push, back } = useRouter();

  useBackButton(back);
  useMainButton({
    text: 'Далее',
    onClick: () => push('text'),
    enabled: Boolean(draft.format),
  });

  return (
    <Screen>
      <div style={{ padding: '12px 22px 14px' }}>
        <StepBadge n={6} total={8} />
      </div>
      <ScreenIntro
        title="В каком формате подготовить изображение?"
        sub="В Pro и Lab — сразу все форматы из одной обработки."
      />

      <div
        style={{
          padding: '0 16px 12px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 8,
        }}
      >
        {FORMATS.map((f) => {
          const selected = draft.format === f.id;
          return (
            <div
              key={f.id}
              role="button"
              tabIndex={0}
              onClick={() => setDraft({ format: f.id })}
              style={{
                padding: '16px 10px 14px',
                borderRadius: 22,
                background: selected ? 'var(--c-card-l)' : 'var(--c-card-d)',
                color: selected ? 'var(--c-ink)' : 'var(--c-on-dark)',
                border: selected ? 'none' : '1px solid var(--c-line)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  width: f.w,
                  height: f.h,
                  borderRadius: 8,
                  background: selected ? 'var(--c-ink)' : 'rgba(239,243,255,0.06)',
                  border: selected ? 'none' : '1px solid rgba(239,243,255,0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  className="mono"
                  style={{
                    fontSize: 11,
                    color: selected ? 'var(--c-accent)' : 'var(--c-on-dark-3)',
                  }}
                >
                  {f.ratio}
                </span>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{f.label}</div>
                <div className="mono" style={{ fontSize: 9.5, opacity: 0.5, marginTop: 2 }}>
                  {f.px}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ padding: '6px 16px 16px' }}>
        <Card
          kind="deep"
          pad={14}
          radius={20}
          style={{ display: 'flex', alignItems: 'center', gap: 12 }}
        >
          <div style={{ display: 'flex' }}>
            {[16, 20, 12].map((w, i) => (
              <div
                key={i}
                style={{
                  width: w,
                  height: 24,
                  borderRadius: 4,
                  marginLeft: i ? -6 : 0,
                  background: i === 1 ? 'var(--c-accent)' : 'rgba(239,243,255,0.18)',
                  border: '1.5px solid var(--c-card-dd)',
                }}
              />
            ))}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Все форматы сразу</div>
            <div style={{ fontSize: 11, color: 'var(--c-on-dark-2)' }}>
              4:5 + 1:1 + 9:16 одной обработкой
            </div>
          </div>
          <Tag kind="accent" style={{ fontSize: 10 }}>
            PRO
          </Tag>
        </Card>
      </div>
    </Screen>
  );
}
