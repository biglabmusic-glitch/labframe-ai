import { Screen } from '../components/Screen';
import { ScreenIntro } from '../components/ScreenIntro';
import { StepBadge } from '../components/StepBadge';
import { IconCheck } from '../components/primitives/icons';
import { useApp } from '../state/AppContext';
import { useMainButton } from '../telegram/useMainButton';
import { useBackButton } from '../telegram/useBackButton';
import { useRouter } from '../router/Router';
import type { TextType } from '../state/types';

interface Variant {
  id: TextType;
  label: string;
  sub: string;
  sample?: string;
}

const VARIANTS: Variant[] = [
  {
    id: 'short',
    label: 'Короткий',
    sub: 'Лаконичная подпись',
    sample: '«Керамическая реставрация с акцентом на естественную форму».',
  },
  {
    id: 'sell',
    label: 'Продающий',
    sub: 'Эмоциональный, показывает ценность',
    sample: '«Живая игра света и мягкие переходы оттенков помогают…»',
  },
  {
    id: 'tech',
    label: 'Технический',
    sub: 'Фокус на мастерстве и деталях',
    sample: '«Работа с акцентом на макро- и микротекстуру».',
  },
];

export function ScreenTextType() {
  const { draft, setDraft } = useApp();
  const { push, back } = useRouter();

  useBackButton(back);
  useMainButton({
    text: '✨ Сгенерировать пост',
    onClick: () => push('proc'),
    enabled: Boolean(draft.textType),
  });

  return (
    <Screen>
      <div style={{ padding: '12px 22px 14px' }}>
        <StepBadge n={7} total={8} />
      </div>
      <ScreenIntro
        title="Текст к публикации"
        sub="Включает 1–2 альтернативы и подборку хэштегов."
      />

      <div
        style={{
          padding: '0 16px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {VARIANTS.map((v) => {
          const selected = draft.textType === v.id;
          return (
            <div
              key={v.id}
              role="button"
              tabIndex={0}
              onClick={() => setDraft({ textType: v.id })}
              style={{
                padding: 14,
                borderRadius: 22,
                background: selected ? 'var(--c-accent)' : 'var(--c-card-d)',
                color: selected ? 'var(--c-ink)' : 'var(--c-on-dark)',
                border: selected ? 'none' : '1px solid var(--c-line)',
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                }}
              >
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{v.label}</div>
                  <div
                    style={{
                      fontSize: 11,
                      opacity: selected ? 0.6 : 0.5,
                      marginTop: 1,
                    }}
                  >
                    {v.sub}
                  </div>
                </div>
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 999,
                    background: selected ? 'var(--c-ink)' : 'transparent',
                    border: selected ? 'none' : '1.5px solid rgba(239,243,255,0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {selected && <IconCheck size={12} color="var(--c-accent)" />}
                </div>
              </div>
              {v.sample && (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 12,
                    background: selected ? 'rgba(15,18,33,0.08)' : 'rgba(15,18,33,0.4)',
                    fontSize: 11.5,
                    fontStyle: 'italic',
                    lineHeight: 1.4,
                    opacity: selected ? 0.85 : 0.7,
                  }}
                >
                  {v.sample}
                </div>
              )}
            </div>
          );
        })}

        <div
          role="button"
          tabIndex={0}
          onClick={() => setDraft({ textType: 'none' })}
          style={{
            padding: '14px 16px',
            borderRadius: 22,
            border: '1px dashed var(--c-line)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: draft.textType === 'none' ? 'var(--c-accent)' : 'var(--c-on-dark-2)',
            background: draft.textType === 'none' ? 'rgba(147,213,225,0.08)' : 'transparent',
            cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: 14 }}>Без текста — только изображение</span>
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 999,
              border: '1.5px solid rgba(239,243,255,0.25)',
              background: draft.textType === 'none' ? 'var(--c-accent)' : 'transparent',
            }}
          />
        </div>
      </div>
    </Screen>
  );
}
