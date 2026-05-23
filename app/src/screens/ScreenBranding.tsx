import { Screen } from '../components/Screen';
import { ScreenIntro } from '../components/ScreenIntro';
import { StepBadge } from '../components/StepBadge';
import { Card } from '../components/primitives/Card';
import { CircleBtn } from '../components/primitives/CircleBtn';
import { Pill } from '../components/primitives/Pill';
import { IconArrow, IconImg, IconText } from '../components/primitives/icons';
import { useApp } from '../state/AppContext';
import { useMainButton } from '../telegram/useMainButton';
import { useBackButton } from '../telegram/useBackButton';
import { useRouter } from '../router/Router';
import type { BrandingKind } from '../state/types';

export function ScreenBranding() {
  const { user, brand, draft, setDraft } = useApp();
  const { push, back } = useRouter();

  useBackButton(back);
  useMainButton({
    text: 'Далее',
    onClick: () => push('format'),
    enabled: Boolean(draft.branding),
  });

  const pick = (kind: BrandingKind) => setDraft({ branding: kind });
  const isSel = (kind: BrandingKind) => draft.branding === kind;

  return (
    <Screen>
      <div style={{ padding: '12px 22px 14px' }}>
        <StepBadge n={4} total={7} />
      </div>
      <ScreenIntro
        title="Добавить логотип или имя мастера?"
        sub="Бренд автоматически разместится в углу изображения."
      />

      <div style={{ padding: '0 22px 18px' }}>
        <Card
          kind="dark"
          pad={12}
          radius={20}
          style={{ display: 'flex', alignItems: 'center', gap: 12 }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: 'var(--c-accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              fontWeight: 700,
              color: 'var(--c-ink)',
              letterSpacing: -0.5,
            }}
          >
            {user.initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              className="mono"
              style={{ fontSize: 10, color: 'var(--c-on-dark-3)', letterSpacing: 0.5 }}
            >
              СОХРАНЁННЫЙ БРЕНД
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>
              {brand.masterName ?? user.name}
            </div>
          </div>
          <Pill size="sm" kind="ghost" onClick={() => push('mybrand')}>
            изменить
          </Pill>
        </Card>
      </div>

      <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => pick('logo')}
          style={{
            padding: 16,
            borderRadius: 22,
            background: isSel('logo') ? 'var(--c-accent)' : 'var(--c-card-d)',
            color: isSel('logo') ? 'var(--c-ink)' : 'var(--c-on-dark)',
            border: isSel('logo') ? 'none' : '1px solid var(--c-line)',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            cursor: 'pointer',
          }}
        >
          <CircleBtn size={42} kind="dark">
            <IconImg size={20} color="var(--c-accent)" />
          </CircleBtn>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Добавить логотип</div>
            <div style={{ fontSize: 11.5, opacity: 0.65, marginTop: 2 }}>
              PNG или JPG · сохранится в профиль
            </div>
          </div>
          <IconArrow size={20} />
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => pick('name')}
          style={{
            padding: 16,
            borderRadius: 22,
            background: isSel('name') ? 'var(--c-accent)' : 'var(--c-card-d)',
            border: '1px solid var(--c-line)',
            color: isSel('name') ? 'var(--c-ink)' : 'var(--c-on-dark)',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            cursor: 'pointer',
          }}
        >
          <CircleBtn size={42} kind="ghost">
            <IconText size={20} color="var(--c-accent)" />
          </CircleBtn>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Добавить имя текстом</div>
            <div
              style={{
                fontSize: 11.5,
                color: isSel('name') ? 'rgba(15,18,33,0.6)' : 'var(--c-on-dark-2)',
                marginTop: 2,
              }}
            >
              Например, «Ceramist Ivan Petrov»
            </div>
          </div>
          <IconArrow size={20} color="var(--c-on-dark-2)" />
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => pick('none')}
          style={{
            padding: 16,
            borderRadius: 22,
            background: isSel('none') ? 'rgba(147,213,225,0.18)' : 'transparent',
            border: '1px dashed var(--c-line)',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            color: isSel('none') ? 'var(--c-accent)' : 'var(--c-on-dark-2)',
            cursor: 'pointer',
          }}
        >
          <CircleBtn size={42} kind="ghost">
            <span style={{ fontSize: 18, opacity: 0.6 }}>—</span>
          </CircleBtn>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 500 }}>Без бренда</div>
            <div style={{ fontSize: 11.5, opacity: 0.55, marginTop: 2 }}>
              Изображение без подписи
            </div>
          </div>
        </div>
      </div>
    </Screen>
  );
}
