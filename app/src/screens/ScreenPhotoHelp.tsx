import { Screen } from '../components/Screen';
import { ScreenIntro } from '../components/ScreenIntro';
import { useApp } from '../state/AppContext';
import { useMainButton } from '../telegram/useMainButton';
import { useBackButton } from '../telegram/useBackButton';
import { useRouter } from '../router/Router';

const TIPS = [
  { t: 'Снимайте без сильного зума', s: 'Подойдите ближе телом, а не зумом.' },
  { t: 'Не используйте жёлтый свет', s: 'Лучше дневной свет от окна или белая лампа.' },
  { t: 'Избегайте бликов и пересветов', s: 'Если зеркалит — смените угол на 10–15°.' },
  { t: 'Держите работу в фокусе', s: 'Тапните на объект перед съёмкой.' },
  { t: 'Снимайте на нейтральном фоне', s: 'Белый, серый или чёрный матовый.' },
  { t: 'Не обрезайте важные части', s: 'Бот сам кадрирует под нужный формат.' },
  { t: 'Делайте несколько ракурсов', s: 'Для карусели — фронт, ¾, изоляция.' },
];

export function ScreenPhotoHelp() {
  const { back, reset } = useRouter();
  const { resetDraft } = useApp();

  useBackButton(back);
  useMainButton({
    text: 'Понятно, загружаю фото',
    onClick: () => {
      resetDraft();
      reset('upload');
    },
  });

  return (
    <Screen>
      <ScreenIntro
        title="Как снимать, чтобы результат был лучше"
        sub="7 коротких правил. Чем чище исходник, тем сильнее AI улучшает подачу."
      />

      <div style={{ padding: '0 16px 16px', display: 'flex', gap: 8 }}>
        <div
          style={{
            flex: 1,
            borderRadius: 18,
            padding: 12,
            background: 'var(--c-card-d)',
            border: '1px solid var(--c-line)',
          }}
        >
          <div
            style={{
              aspectRatio: '4 / 3',
              borderRadius: 12,
              marginBottom: 10,
              overflow: 'hidden',
              background: '#1A1D2A',
            }}
          >
            <img
              src="/examples/photo-bad.jpg"
              alt="плохо"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </div>
          <div className="mono" style={{ fontSize: 10, letterSpacing: 0.6, color: '#E89B7E' }}>
            ПЛОХО
          </div>
          <div style={{ fontSize: 12, marginTop: 4, color: 'var(--c-on-dark-2)' }}>
            Жёлтый свет, не в фокусе
          </div>
        </div>
        <div
          style={{
            flex: 1,
            borderRadius: 18,
            padding: 12,
            background: 'var(--c-card-l)',
            color: 'var(--c-ink)',
          }}
        >
          <div
            style={{
              aspectRatio: '4 / 3',
              borderRadius: 12,
              marginBottom: 10,
              overflow: 'hidden',
              background: '#E2E7F0',
            }}
          >
            <img
              src="/examples/photo-good.jpg"
              alt="хорошо"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </div>
          <div className="mono" style={{ fontSize: 10, letterSpacing: 0.6, color: '#2E8467' }}>
            ХОРОШО
          </div>
          <div style={{ fontSize: 12, marginTop: 4, color: 'var(--c-on-light-2)' }}>
            Чёткий кадр, нейтральный фон
          </div>
        </div>
      </div>

      <div style={{ padding: '0 16px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {TIPS.map((tip, i) => (
          <div
            key={tip.t}
            style={{
              display: 'flex',
              gap: 12,
              padding: '12px 14px',
              borderRadius: 16,
              background: 'rgba(239,243,255,0.03)',
            }}
          >
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 999,
                background: 'var(--c-accent)',
                color: 'var(--c-ink)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {i + 1}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{tip.t}</div>
              <div
                style={{
                  fontSize: 11.5,
                  color: 'var(--c-on-dark-2)',
                  marginTop: 2,
                  lineHeight: 1.4,
                }}
              >
                {tip.s}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Screen>
  );
}
