import { useState } from 'react';
import { Screen } from '../components/Screen';
import { ScreenIntro } from '../components/ScreenIntro';
import { Card } from '../components/primitives/Card';
import { useMainButton } from '../telegram/useMainButton';
import { useRouter } from '../router/Router';
import { useApp } from '../state/AppContext';
import { CROSSBORDER_CONSENT_CHECKBOX, PD_CONSENT_CHECKBOX } from '../lib/consent';

/**
 * Экран согласия — первое, что видит человек, пока согласие не дано.
 *
 * Две ОТДЕЛЬНЫЕ галочки, и это не оформление, а требование закона: с 1 сентября
 * 2025 года согласие на обработку персональных данных оформляется отдельно от
 * иных документов и подтверждается отдельным действием. Раньше здесь была одна
 * галочка «прочитал политику и согласен» — именно такая склейка больше не годится.
 * Трансграничная передача — отдельное основание, поэтому у неё своя галочка.
 *
 * С политикой человек знакомится по ссылке, но галочки «прочитал политику» нет:
 * ознакомление с политикой — не согласие, и смешивать их нельзя.
 *
 * Показывается и старым пользователям: согласие нужно от всех. Галочки не
 * проставлены заранее — предзаполненное согласие согласием не считается.
 * Обе обязательны: без обработки и передачи данных сервис работать не может.
 */
export function ScreenConsent() {
  const { reset, push } = useRouter();
  const { giveConsent } = useApp();
  const [pd, setPd] = useState(false);
  const [crossBorder, setCrossBorder] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const ready = pd && crossBorder;

  useMainButton({
    text: busy ? 'Сохраняем…' : 'Продолжить',
    enabled: ready && !busy,
    progress: busy,
    onClick: () => {
      if (!ready || busy) return;
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
        sub="Сервис обрабатывает ваши данные и фотографии работ. Нужны два согласия — каждое отдельно."
      />

      <div style={{ padding: '0 16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <ConsentCheck
          checked={pd}
          onToggle={() => setPd((v) => !v)}
          text={PD_CONSENT_CHECKBOX}
          linkText="Читать согласие полностью"
          onLink={() => push('consentdoc')}
        />

        <ConsentCheck
          checked={crossBorder}
          onToggle={() => setCrossBorder((v) => !v)}
          text={CROSSBORDER_CONSENT_CHECKBOX}
          linkText="Куда и зачем передаются данные"
          onLink={() => push('consentdoc')}
        />

        <div
          onClick={() => push('privacy')}
          style={{
            fontSize: 13,
            color: 'var(--c-accent)',
            textDecoration: 'underline',
            cursor: 'pointer',
            padding: '4px 2px',
          }}
        >
          Политика обработки персональных данных
        </div>

        {err ? (
          <div style={{ fontSize: 12.5, color: '#F4B19A' }}>
            Не удалось сохранить согласие: {err}
          </div>
        ) : null}
      </div>
    </Screen>
  );
}

function ConsentCheck({
  checked,
  onToggle,
  text,
  linkText,
  onLink,
}: {
  checked: boolean;
  onToggle: () => void;
  text: string;
  linkText: string;
  onLink: () => void;
}) {
  return (
    <Card kind="dark" pad={14} radius={16}>
      <div
        onClick={onToggle}
        style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}
      >
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
        <div style={{ fontSize: 13, lineHeight: 1.5 }}>{text}</div>
      </div>
      <div
        onClick={onLink}
        style={{
          marginTop: 8,
          marginLeft: 32,
          fontSize: 12.5,
          color: 'var(--c-accent)',
          textDecoration: 'underline',
          cursor: 'pointer',
        }}
      >
        {linkText}
      </div>
    </Card>
  );
}
