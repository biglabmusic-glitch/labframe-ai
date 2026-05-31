import { useState } from 'react';
import { Screen } from '../components/Screen';
import { ScreenIntro } from '../components/ScreenIntro';
import { StepBadge } from '../components/StepBadge';
import { IconCheck } from '../components/primitives/icons';
import { useApp } from '../state/AppContext';
import { useMainButton } from '../telegram/useMainButton';
import { useBackButton } from '../telegram/useBackButton';
import { useRouter } from '../router/Router';
import { DECOR_PRESETS_UI, DECOR_CUSTOM_ID } from '../lib/presets';

export function ScreenIndividuality() {
  const { draft, setDraft, user } = useApp();
  const { push, back } = useRouter();
  const [customText, setCustomText] = useState(
    draft.decor?.preset === DECOR_CUSTOM_ID ? (draft.decor.addition ?? '') : '',
  );

  useBackButton(back);
  useMainButton({ text: 'Продолжить', onClick: () => push('brand'), enabled: true });

  const left = Math.max(0, (user.premium?.limit ?? 3) - (user.premium?.used ?? 0));
  const locked = left <= 0;
  const selectedId = draft.decor?.preset ?? 'none';

  const selectPreset = (id: string) => {
    if (id === 'none') { setDraft({ decor: undefined }); return; }
    if (locked) { push('pricing'); return; }
    if (id === DECOR_CUSTOM_ID) {
      setDraft({ decor: { preset: DECOR_CUSTOM_ID, addition: customText } });
      return;
    }
    setDraft({ decor: { preset: id } });
  };

  const Row = ({ id, title, sub }: { id: string; title: string; sub: string }) => {
    const selected = selectedId === id;
    const isLockable = id !== 'none' && locked;
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => selectPreset(id)}
        style={{
          display: 'flex', gap: 14, alignItems: 'center', padding: 14, paddingRight: 16,
          borderRadius: 22,
          background: selected ? 'var(--c-card-l)' : 'var(--c-card-d)',
          color: selected ? 'var(--c-ink)' : 'var(--c-on-dark)',
          border: selected ? 'none' : '1px solid var(--c-line)',
          opacity: isLockable ? 0.6 : 1,
          cursor: 'pointer',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.2 }}>
            {title}{isLockable ? ' 🔒' : ''}
          </div>
          <div style={{ fontSize: 11.5, opacity: selected ? 0.7 : 0.55, lineHeight: 1.35, marginTop: 2 }}>
            {sub}
          </div>
        </div>
        <div style={{
          width: 22, height: 22, borderRadius: 999,
          background: selected ? 'var(--c-ink)' : 'transparent',
          border: selected ? 'none' : '1.5px solid rgba(239,243,255,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {selected && <IconCheck size={13} color="var(--c-accent)" />}
        </div>
      </div>
    );
  };

  return (
    <Screen>
      <div style={{ padding: '12px 22px 14px' }}>
        <StepBadge n={4} total={8} />
      </div>
      <ScreenIntro
        title="Индивидуальность"
        sub={locked
          ? 'Бесплатные premium-генерации закончились — оформите подписку в «Тарифах».'
          : `Добавьте к работе декоративный элемент. Бесплатно осталось: ${left} из ${user.premium?.limit ?? 3}.`}
      />

      <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Row id="none" title="Без декора" sub="Чистый кадр, как обычно." />
        {DECOR_PRESETS_UI.map((p) => (
          <Row key={p.id} id={p.id} title={p.ru} sub={p.desc} />
        ))}
        <Row id={DECOR_CUSTOM_ID} title="Свой вариант" sub="Опишите элемент своими словами." />

        {selectedId === DECOR_CUSTOM_ID && !locked && (
          <textarea
            value={customText}
            onChange={(e) => {
              setCustomText(e.target.value);
              setDraft({ decor: { preset: DECOR_CUSTOM_ID, addition: e.target.value } });
            }}
            placeholder="например: белая змея рядом с работой"
            rows={2}
            maxLength={120}
            style={{
              width: '100%', resize: 'none', padding: 14, borderRadius: 16,
              background: 'var(--c-card-d)', color: 'var(--c-on-dark)',
              border: '1px solid var(--c-line)', fontSize: 14, fontFamily: 'inherit',
            }}
          />
        )}
      </div>
    </Screen>
  );
}
