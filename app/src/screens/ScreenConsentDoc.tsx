import { Screen } from '../components/Screen';
import { ScreenIntro } from '../components/ScreenIntro';
import { Card } from '../components/primitives/Card';
import { useBackButton } from '../telegram/useBackButton';
import { useMainButton } from '../telegram/useMainButton';
import { useRouter } from '../router/Router';
import { LEGAL_EDITION, type PrivacySection } from '../lib/privacy';
import {
  CROSSBORDER_CONSENT_SECTIONS,
  CROSSBORDER_CONSENT_TITLE,
  PD_CONSENT_SECTIONS,
  PD_CONSENT_TITLE,
} from '../lib/consent';

/**
 * Полный текст обоих согласий. Человек должен видеть, с чем соглашается, до
 * того как поставит галочку, — иначе согласие не считается информированным.
 */
export function ScreenConsentDoc() {
  const { back } = useRouter();
  useBackButton(back);
  useMainButton(null);

  return (
    <Screen>
      <ScreenIntro title="Согласия" sub={`Редакция от ${LEGAL_EDITION}.`} />
      <div style={{ padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <DocBlock title={PD_CONSENT_TITLE} sections={PD_CONSENT_SECTIONS} />
        <DocBlock title={CROSSBORDER_CONSENT_TITLE} sections={CROSSBORDER_CONSENT_SECTIONS} />
      </div>
    </Screen>
  );
}

function DocBlock({ title, sections }: { title: string; sections: PrivacySection[] }) {
  return (
    <>
      <div style={{ fontWeight: 700, fontSize: 15, margin: '8px 2px 0' }}>{title}</div>
      {sections.map((s) => (
        <Card key={title + s.title} kind="dark" pad={14} radius={16}>
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
    </>
  );
}
