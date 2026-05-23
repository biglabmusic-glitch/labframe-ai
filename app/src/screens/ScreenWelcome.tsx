import { Screen } from '../components/Screen';
import { Tag } from '../components/primitives/Tag';
import { CircleBtn } from '../components/primitives/CircleBtn';
import { BrandMark } from '../components/primitives/BrandMark';
import { IconPlus, IconSpark, IconTooth } from '../components/primitives/icons';
import { useMainButton } from '../telegram/useMainButton';
import { useBackButton } from '../telegram/useBackButton';
import { useRouter } from '../router/Router';
import { useApp } from '../state/AppContext';

export function ScreenWelcome() {
  const { reset } = useRouter();
  const { onboarded } = useApp();
  useBackButton(null);
  useMainButton({
    text: onboarded ? 'Создать пост' : '✨ Настроить бренд',
    onClick: () => reset(onboarded ? 'home' : 'onboarding'),
  });

  return (
    <Screen>
      {/* брендовая шапка */}
      <div
        style={{
          padding: '14px 22px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <BrandMark size={26} color="var(--c-on-dark)" accent="#A5BCD9" />
        <span
          style={{
            fontSize: 15,
            fontWeight: 500,
            letterSpacing: -0.2,
            color: 'var(--c-on-dark-2)',
          }}
        >
          LabFrame <span style={{ fontWeight: 700, color: 'var(--c-on-dark)' }}>Ai</span>
        </span>
      </div>

      {/* hero accent card */}
      <div style={{ padding: '8px 16px 16px' }}>
        <div
          style={{
            position: 'relative',
            borderRadius: 28,
            overflow: 'hidden',
            background: 'linear-gradient(180deg, #B8E4EC 0%, #93D5E1 100%)',
            color: 'var(--c-ink)',
            padding: '20px 18px',
            height: 280,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Tag kind="dark" style={{ fontSize: 10, padding: '5px 12px' }}>
              <IconSpark size={10} color="var(--c-accent)" /> AI · MVP
            </Tag>
            <CircleBtn size={32} kind="dark">
              <IconPlus size={16} color="var(--c-on-dark)" />
            </CircleBtn>
          </div>

          <div
            style={{
              position: 'absolute',
              left: 18,
              right: 18,
              bottom: 80,
              top: 70,
              display: 'flex',
              gap: 8,
            }}
          >
            <div
              style={{
                flex: 1,
                borderRadius: 16,
                background: '#F4F6FB',
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'rgba(15,18,33,0.35)',
                boxShadow: 'inset 0 0 0 1px rgba(15,18,33,0.05)',
              }}
            >
              <IconTooth size={40} />
              <div
                className="mono"
                style={{
                  position: 'absolute',
                  top: 8,
                  left: 8,
                  fontSize: 8,
                  letterSpacing: 1,
                  color: 'rgba(15,18,33,0.5)',
                }}
              >
                ДО
              </div>
            </div>
            <div
              style={{
                flex: 1,
                borderRadius: 16,
                background: 'var(--c-bg)',
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'rgba(239,243,255,0.85)',
              }}
            >
              <IconTooth size={40} />
              <div
                className="mono"
                style={{
                  position: 'absolute',
                  top: 8,
                  left: 8,
                  fontSize: 8,
                  letterSpacing: 1,
                  color: 'var(--c-accent)',
                }}
              >
                ПОСЛЕ
              </div>
              <div
                style={{
                  position: 'absolute',
                  bottom: 6,
                  right: 6,
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

          <div style={{ position: 'absolute', bottom: 18, left: 18, right: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.7 }}>фото с телефона</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>→ готовый пост в Instagram</div>
          </div>
        </div>
      </div>

      <div style={{ padding: '4px 24px 16px' }}>
        <h1
          style={{
            margin: 0,
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: -0.8,
            lineHeight: 1.05,
          }}
        >
          AI-студия для<br />зубных техников
        </h1>
        <p
          style={{
            margin: '12px 0 0',
            fontSize: 13.5,
            color: 'var(--c-on-dark-2)',
            lineHeight: 1.5,
          }}
        >
          Сфотографируйте работу на телефон, загрузите в бот и получите готовый визуал с
          правильным фоном, светом и текстом к публикации.
        </p>
      </div>

      <div style={{ padding: '0 16px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[
          ['Чистый фон и ровный свет', 'без студии и Lightroom'],
          ['Готовые форматы 4:5, 1:1, 9:16', 'для ленты, портфолио и сторис'],
          ['Логотип и текст к посту', 'с подборкой хэштегов'],
        ].map(([t, s]) => (
          <div
            key={t}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 14px',
              borderRadius: 14,
              background: 'rgba(239,243,255,0.04)',
            }}
          >
            <div
              style={{
                width: 4,
                height: 28,
                borderRadius: 2,
                background: 'var(--c-accent)',
              }}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{t}</div>
              <div style={{ fontSize: 11, color: 'var(--c-on-dark-2)' }}>{s}</div>
            </div>
          </div>
        ))}
      </div>
    </Screen>
  );
}
