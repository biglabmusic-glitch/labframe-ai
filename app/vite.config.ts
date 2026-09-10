import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import {
  CONTACT_EMAIL,
  LEGAL_EDITION,
  OPERATOR,
  PRIVACY_SECTIONS,
  PRIVACY_TITLE,
  type PrivacySection,
} from './src/lib/privacy';
import {
  CROSSBORDER_CONSENT_SECTIONS,
  CROSSBORDER_CONSENT_TITLE,
  PD_CONSENT_SECTIONS,
  PD_CONSENT_TITLE,
} from './src/lib/consent';

/**
 * Открытые страницы с юридическими документами: /privacy.html и /consent.html.
 *
 * Политику закон требует опубликовать в открытом доступе, а мини-апп виден
 * только внутри Telegram. Страницы собираются из тех же модулей, что и экраны
 * приложения, — поэтому текст на сайте и текст, с которым соглашается человек,
 * не могут разойтись после чьей-нибудь правки в одном месте.
 */
function legalPages(): Plugin {
  return {
    name: 'legal-pages',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'privacy.html',
        source: page(PRIVACY_TITLE, [{ title: PRIVACY_TITLE, sections: PRIVACY_SECTIONS }]),
      });
      this.emitFile({
        type: 'asset',
        fileName: 'consent.html',
        source: page('Согласия на обработку персональных данных', [
          { title: PD_CONSENT_TITLE, sections: PD_CONSENT_SECTIONS },
          { title: CROSSBORDER_CONSENT_TITLE, sections: CROSSBORDER_CONSENT_SECTIONS },
        ]),
      });
    },
  };
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function page(title: string, docs: { title: string; sections: PrivacySection[] }[]): string {
  const content = docs
    .map((d) =>
      `<h1>${esc(d.title)}</h1>` +
      d.sections
        .map((s) => `<h2>${esc(s.title)}</h2>` + s.body.map((p) => `<p>${esc(p)}</p>`).join(''))
        .join(''))
    .join('');

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} — LabFrame AI</title>
<style>
  body { margin: 0; background: #f6f6f4; color: #1b1d24;
         font: 16px/1.6 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 32px 20px 56px; }
  h1 { font-size: 26px; line-height: 1.25; margin: 32px 0 8px; }
  h1:first-child { margin-top: 0; }
  h2 { font-size: 18px; margin: 24px 0 6px; }
  p { margin: 0 0 10px; }
  footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #dcdcd6;
           font-size: 14px; color: #5b5e68; }
</style>
</head>
<body>
<main>
${content}
<footer>Редакция от ${esc(LEGAL_EDITION)}. Оператор: ${esc(OPERATOR)}. Контакт: ${esc(CONTACT_EMAIL)}.</footer>
</main>
</body>
</html>
`;
}

export default defineConfig({
  plugins: [react(), legalPages()],
  server: {
    host: true,
    port: 5173,
  },
});
