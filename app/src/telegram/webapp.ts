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
    syncTopInset();
    // Высота перекрытия меняется: при разворачивании, повороте, смене клиента.
    for (const evt of ['contentSafeAreaChanged', 'safeAreaChanged', 'viewportChanged']) {
      try { (WebApp as unknown as TgEvents).onEvent?.(evt, syncTopInset); } catch { /* нет события — ладно */ }
    }
  } catch {
    // Outside Telegram (dev preview in browser) — игнорируем
  }
}

interface TgEvents {
  onEvent?: (event: string, cb: () => void) => void;
}

/**
 * Сколько сверху занимает интерфейс самого Telegram.
 *
 * Раньше считалось, что контент начинается сразу под нативной шапкой. На
 * современных клиентах это не так: кнопка «Назад» и меню рисуются ПОВЕРХ
 * страницы, и заголовок приложения уезжает под них.
 *
 * contentSafeAreaInset появился не во всех версиях, поэтому при его отсутствии
 * откатываемся на системный env(safe-area-inset-top) — он хотя бы уводит
 * контент из-под чёлки.
 */
function syncTopInset(): void {
  try {
    const inset = (WebApp as unknown as { contentSafeAreaInset?: { top?: number } })
      .contentSafeAreaInset?.top;
    const value = typeof inset === 'number' && inset > 0
      ? `${inset}px`
      : 'env(safe-area-inset-top, 0px)';
    document.documentElement.style.setProperty('--tg-top-inset', value);
  } catch { /* вне Telegram — переменная просто останется незаданной */ }
}

/** start_param из реф-ссылки (t.me/<bot>/app?startapp=ref_<CODE>). '' если нет. */
export function getStartParam(): string {
  try {
    return WebApp?.initDataUnsafe?.start_param ?? '';
  } catch {
    return '';
  }
}

export { WebApp };
export type TgWebApp = typeof WebApp;
