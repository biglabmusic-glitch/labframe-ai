import type { ReactNode } from 'react';

interface ScreenProps {
  children: ReactNode;
  bg?: string;
}

/**
 * Экранная обёртка. В отличие от мокапа в design/ — здесь НЕТ собственного
 * header'а и MainButton: их рисует сам Telegram.
 *
 * Отступ сверху обязателен: Telegram рисует «Назад» и меню ПОВЕРХ страницы,
 * и без него заголовок приложения уезжает под них. Величину кладёт
 * initTelegramWebApp в переменную --tg-top-inset и обновляет при повороте
 * и разворачивании. Снизу учитываем home-indicator.
 */
export function Screen({ children, bg = 'var(--c-bg)' }: ScreenProps) {
  return (
    <div
      style={{
        minHeight: '100vh',
        paddingTop: 'var(--tg-top-inset, env(safe-area-inset-top, 0px))',
        background: bg,
        color: 'var(--c-on-dark)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0) + 24px)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {children}
    </div>
  );
}
