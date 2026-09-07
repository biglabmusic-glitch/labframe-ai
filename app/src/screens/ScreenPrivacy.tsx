import { Screen } from '../components/Screen';
import { ScreenIntro } from '../components/ScreenIntro';
import { Card } from '../components/primitives/Card';
import { useBackButton } from '../telegram/useBackButton';
import { useMainButton } from '../telegram/useMainButton';
import { useRouter } from '../router/Router';
import { PRIVACY_SECTIONS } from '../lib/privacy';

/**
 * Полный текст политики обработки персональных данных.
 * Открывается с экрана согласия и из «Моего бренда» — человек должен иметь
 * возможность перечитать её в любой момент, а не только при первом входе.
 */
export function ScreenPrivacy() {
  const { back } = useRouter();
  useBackButton(back);
  useMainButton(null);

  return (
    <Screen>
      <ScreenIntro
        title="Обработка данных"
        sub="Что мы собираем, зачем и что с этим можно сделать."
      />

      <div style={{ padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {PRIVACY_SECTIONS.map((s) => (
          <Card key={s.title} kind="dark" pad={14} radius={16}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{s.title}</div>
            {s.body.map((p, i) => (
              <p
                key={i}
                style={{
                  margin: i === 0 ? 0 : '8px 0 0',
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: 'var(--c-on-dark-2)',
                }}
              >
                {p}
              </p>
            ))}
          </Card>
        ))}
      </div>
    </Screen>
  );
}
