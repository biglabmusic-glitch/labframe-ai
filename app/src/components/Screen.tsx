import type { ReactNode } from 'react';

interface ScreenProps {
  children: ReactNode;
  bg?: string;
}

/**
 * Экранная обёртка. В отличие от мокапа в design/ — здесь НЕТ собственного
 * header'а и MainButton: их рисует сам Telegram. Контент начинается сразу
 * после нативной шапки Telegram, отступ снизу учитывает home-indicator.
 */
export function Screen({ children, bg = 'var(--c-bg)' }: ScreenProps) {
  return (
    <div
      style={{
        minHeight: '100vh',
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
