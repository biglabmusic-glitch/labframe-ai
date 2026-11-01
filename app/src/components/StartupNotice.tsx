import { Screen } from './Screen';
import { ScreenIntro } from './ScreenIntro';

export function StartupNotice({ error, retry }: {
  error: 'session' | 'connection' | null;
  retry: () => void;
}) {
  return <Screen>
    <ScreenIntro title={error === 'session' ? 'Не удалось подтвердить вход' : 'Подключаем ваш профиль'}
      sub={error === 'session'
        ? 'Telegram не подтвердил сессию. Закройте мини-приложение крестиком и откройте его заново через бота.'
        : 'Профиль пока не загрузился. Баланс и настройки сможем показать после ответа сервера.'} />
    <div style={{ padding: '0 24px', display: 'grid', gap: 16 }} role="status">
      <button type="button" className="main-action-button" onClick={retry}>Повторить подключение</button>
      <a href="https://t.me/labframe_ai_bot/app" style={{ color: 'var(--c-accent)', textAlign: 'center' }}>Открыть через Telegram</a>
    </div>
  </Screen>;
}
