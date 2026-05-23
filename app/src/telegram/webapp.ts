import WebApp from '@twa-dev/sdk';
import { TG_THEME } from '../constants';

let initialised = false;

export function initTelegramWebApp() {
  if (initialised) return;
  initialised = true;

  try {
    WebApp.ready();
    WebApp.expand();
    WebApp.setHeaderColor(TG_THEME.headerColor);
    WebApp.setBackgroundColor(TG_THEME.backgroundColor);
    if (typeof WebApp.disableVerticalSwipes === 'function') {
      WebApp.disableVerticalSwipes();
    }
  } catch {
    // Outside Telegram (dev preview in browser) — игнорируем
  }
}

export { WebApp };
export type TgWebApp = typeof WebApp;
