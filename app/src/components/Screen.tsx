import { useSyncExternalStore, type ReactNode } from 'react';
import { mainActionStore } from '../telegram/main-action-store';
import '../styles/main-action.css';

interface ScreenProps {
  children: ReactNode;
  bg?: string;
}

/**
 * Экранная обёртка. Telegram рисует header; главное действие рисуем внутри
 * приложения, чтобы отсутствие нативной MainButton не запирало навигацию.
 *
 * Отступ сверху обязателен: Telegram рисует «Назад» и меню ПОВЕРХ страницы,
 * и без него заголовок приложения уезжает под них. Величину кладёт
 * initTelegramWebApp в переменную --tg-top-inset и обновляет при повороте
 * и разворачивании. Снизу учитываем home-indicator.
 */
export function Screen({ children, bg = 'var(--c-bg)' }: ScreenProps) {
  const action = useSyncExternalStore(mainActionStore.subscribe, mainActionStore.getSnapshot, mainActionStore.getSnapshot);
  return (
    <div
      style={{
        minHeight: '100vh',
        paddingTop: 'var(--tg-top-inset, env(safe-area-inset-top, 0px))',
        background: bg,
        color: 'var(--c-on-dark)',
        paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${action ? 104 : 24}px)`,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {children}
      {action && <div className="main-action-bar">
        <button type="button" className="main-action-button"
          disabled={action.enabled === false || action.progress === true}
          aria-busy={action.progress === true}
          onClick={() => { if (action.enabled !== false && !action.progress) action.onClick(); }}>
          {action.progress && <span className="main-action-spinner" aria-hidden="true" />}
          <span>{action.text}</span>
        </button>
      </div>}
    </div>
  );
}
