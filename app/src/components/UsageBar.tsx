import { pluralGenerations } from '../lib/plans';

interface Props {
  /** Остаток генераций на балансе. */
  credits: number;
  onUpgrade: () => void;
  /** Если задан — карточка становится кликабельной (открыть баланс). */
  onOpen?: () => void;
  /**
   * Баланс ещё не пришёл с сервера. Важно отличать от нуля: до ответа /me
   * в состоянии лежит 0, и без этого флага любой заходящий видел бы
   * «Генерации закончились» — включая того, кто только что оплатил пакет.
   */
  loading?: boolean;
  /**
   * Запрос закончился, а баланс так и неизвестен — чаще всего сессия мини-аппа
   * устарела. Показать ноль здесь нельзя: это выглядит как «всё потрачено»,
   * и особенно скверно для того, кто только что оплатил пакет.
   */
  unknown?: boolean;
}

/**
 * Карточка баланса «осталось N генераций».
 * Полосы прогресса нет намеренно: у баланса нет верхней границы, от которой
 * можно считать процент — пакеты складываются.
 */
export function UsageBar({ credits, onUpgrade, onOpen, loading, unknown }: Props) {
  const empty = !loading && !unknown && credits <= 0;
  const low = !loading && !unknown && !empty && credits <= 3;

  const titleColor = empty ? '#F4B19A' : 'var(--c-on-dark)';

  return (
    <div
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      style={{
        padding: 16,
        borderRadius: 22,
        background: 'var(--c-card-d)',
        border: '1px solid var(--c-line)',
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 12,
        cursor: onOpen ? 'pointer' : undefined,
      }}
    >
      <div>
        <div
          className="mono"
          style={{ fontSize: 10, letterSpacing: 0.8, color: 'var(--c-on-dark-3)' }}
        >
          БАЛАНС
        </div>
        <div
          style={{
            marginTop: 4,
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: -0.6,
            color: titleColor,
          }}
        >
          {loading
            ? 'Загружаем баланс…'
            : unknown
            ? 'Баланс недоступен'
            : empty
            ? 'Генерации закончились'
            : `${credits} ${pluralGenerations(credits)}`}
        </div>
        <div style={{ marginTop: 2, fontSize: 11.5, color: 'var(--c-on-dark-3)' }}>
          {loading
            ? 'Секунду, уточняем на сервере'
            : unknown
            ? 'Закройте и откройте приложение заново'
            : empty
            ? 'Пополните баланс, чтобы продолжить'
            : low
            ? 'Скоро закончатся — есть смысл пополнить'
            : 'Не сгорают · с декором списывается 3'}
        </div>
      </div>

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onUpgrade(); }}
        style={{
          padding: '8px 14px',
          borderRadius: 999,
          border: 'none',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: -0.1,
          cursor: 'pointer',
          background: empty || low ? 'var(--c-accent)' : 'rgba(147,213,225,0.18)',
          color: empty || low ? 'var(--c-ink)' : 'var(--c-accent)',
          whiteSpace: 'nowrap',
        }}
      >
        ✨ Пополнить
      </button>
    </div>
  );
}
