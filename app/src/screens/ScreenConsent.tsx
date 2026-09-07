import { useState } from 'react';
import { Screen } from '../components/Screen';
import { ScreenIntro } from '../components/ScreenIntro';
import { Card } from '../components/primitives/Card';
import { useMainButton } from '../telegram/useMainButton';
import { useRouter } from '../router/Router';
import { useApp } from '../state/AppContext';
import { PRIVACY_SECTIONS } from '../lib/privacy';

/**
 * Экран согласия — первое, что видит человек, пока согласие не дано.
 *
 * Показывается и старым пользователям тоже: согласие нужно от всех, а не только
 * от новых. Пока оно не дано, дальше не пускаем — обработка данных без согласия
 * и есть то, чего мы избегаем.
 *
 * Галочка не проставлена заранее сознательно: предзаполненное согласие
 * согласием не считается, человек должен нажать сам.
 */
export function ScreenConsent() {
  const { reset, push } = useRouter();
  const { giveConsent } = useApp();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useMainButton({
    text: busy ? 'Сохраняем…' : 'Продолжить',
    enabled: checked && !busy,
    progress: busy,
    onClick: () => {
      if (!checked || busy) return;
      setBusy(true);
      setErr('');
      giveConsent()
        .then(() => reset('welcome'))
        .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
        .finally(() => setBusy(false));
    },
  });

  return (
    <Screen>
      <ScreenIntro
        title="Пара слов о данных"
        sub="Прежде чем начать — коротко о том, что сервис о вас знает."
      />

      <div style={{ padding: '0 16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {PRIVACY_SECTIONS.slice(0, 3).map((s) => (
          <Card key={s.title} kind="dark" pad={14} radius={16}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{s.title}</div>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--c-on-dark-2)' }}>
              {s.body[0]}
            </p>
          </Card>
        ))}

        <div
          onClick={() => push('privacy')}
          style={{
            fontSize: 13,
            color: 'var(--c-accent)',
            textDecoration: 'underline',
            cursor: 'pointer',
            padding: '2px 2px 6px',
          }}
        >
          Читать полностью
        </div>

        <Card kind="dark" pad={14} radius={16} onClick={() => setChecked((v) => !v)}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                flexShrink: 0,
                border: '2px solid var(--c-accent)',
                background: checked ? 'var(--c-accent)' : 'transparent',
                color: '#0B1220',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                fontWeight: 800,
                lineHeight: 1,
              }}
            >
              {checked ? '✓' : ''}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5 }}>
              Я прочитал политику обработки персональных данных и согласен на
              обработку моих данных на описанных в ней условиях.
            </div>
          </div>
        </Card>

        {err ? (
          <div style={{ fontSize: 12.5, color: '#F4B19A' }}>
            Не удалось сохранить согласие: {err}
          </div>
        ) : null}
      </div>
    </Screen>
  );
}
