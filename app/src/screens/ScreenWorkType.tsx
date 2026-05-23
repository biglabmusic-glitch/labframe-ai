import { Screen } from '../components/Screen';
import { ScreenIntro } from '../components/ScreenIntro';
import { StepBadge } from '../components/StepBadge';
import { CircleBtn } from '../components/primitives/CircleBtn';
import { IconArrow, IconCheck, IconTooth } from '../components/primitives/icons';
import { useApp } from '../state/AppContext';
import { useMainButton } from '../telegram/useMainButton';
import { useBackButton } from '../telegram/useBackButton';
import { useRouter } from '../router/Router';
import type { WorkType } from '../state/types';

const TYPES: { id: WorkType; label: string; hint: string }[] = [
  { id: 'crown',  label: 'Коронка',       hint: 'одиночная' },
  { id: 'veneer', label: 'Виниры',        hint: 'фронтальный сегмент' },
  { id: 'bridge', label: 'Мост',          hint: '3+ единицы' },
  { id: 'other',  label: 'Другая работа', hint: 'имплант, абатмент…' },
];

export function ScreenWorkType() {
  const { draft, setDraft } = useApp();
  const { push, back } = useRouter();

  useBackButton(back);
  useMainButton({
    text: 'Далее',
    onClick: () => push('style'),
    enabled: Boolean(draft.workType),
  });

  return (
    <Screen>
      <div style={{ padding: '12px 22px 14px' }}>
        <StepBadge n={2} total={7} />
      </div>
      <ScreenIntro
        title="Что изображено на фото?"
        sub="Тип работы помогает подобрать точный текст к посту и хэштеги."
      />

      {/* uploaded photo preview */}
      <div style={{ padding: '0 22px 20px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: 8,
            paddingRight: 16,
            background: 'rgba(239,243,255,0.04)',
            borderRadius: 18,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: '#2A2F44',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {draft.photo?.url ? (
              <img
                src={draft.photo.url}
                alt="preview"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <IconTooth size={28} color="rgba(239,243,255,0.55)" />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {draft.photo?.name ?? 'work_2412_03.jpg'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--c-on-dark-2)' }}>
              {draft.photo?.size ?? '3.2 МБ'} · {draft.photo?.resolution ?? '4032×3024'}
            </div>
          </div>
          <span style={{ color: 'var(--c-accent)' }}>
            <IconCheck size={18} />
          </span>
        </div>
      </div>

      <div
        style={{
          padding: '0 16px 16px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
        }}
      >
        {TYPES.map((t) => {
          const selected = draft.workType === t.id;
          return (
            <div
              key={t.id}
              role="button"
              tabIndex={0}
              onClick={() => setDraft({ workType: t.id })}
              style={{
                padding: 16,
                borderRadius: 20,
                background: selected ? 'var(--c-accent)' : 'var(--c-card-d)',
                color: selected ? 'var(--c-ink)' : 'var(--c-on-dark)',
                border: selected ? 'none' : '1px solid var(--c-line)',
                position: 'relative',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: -0.2 }}>{t.label}</div>
              <div style={{ fontSize: 11.5, marginTop: 4, opacity: selected ? 0.7 : 0.55 }}>
                {t.hint}
              </div>
              {selected && (
                <div style={{ position: 'absolute', top: 12, right: 12 }}>
                  <CircleBtn size={22} kind="dark" style={{ background: 'var(--c-ink)' }}>
                    <IconCheck size={13} color="var(--c-accent)" />
                  </CircleBtn>
                </div>
              )}
            </div>
          );
        })}

        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            setDraft({ workType: undefined });
            push('style');
          }}
          style={{
            gridColumn: '1 / -1',
            padding: 16,
            borderRadius: 20,
            border: '1px dashed var(--c-line)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: 'var(--c-on-dark-2)',
            cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: 14 }}>Пропустить шаг</span>
          <IconArrow size={18} />
        </div>
      </div>
    </Screen>
  );
}
