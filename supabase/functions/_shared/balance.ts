// Остаток у провайдера моделей и вывод расхода из истории замеров.
import { db } from './db.ts';
import { fetchBalance } from './polza.ts';

const PROVIDER = 'polza';

/** Записывает текущий остаток. Возвращает причину, если записать не вышло. */
export async function snapshotProviderBalance(): Promise<string | null> {
  const current = await fetchBalance();
  if (!current.ok) return current.error;

  const { error } = await db.from('provider_balance').insert({
    provider: PROVIDER,
    balance: current.balance,
    spent_total: current.spentTotal,
    currency: current.currency,
  });
  return error ? `запись в базу: ${error.message}` : null;
}

export interface ProviderFinance {
  balance: number | null;
  currency: string;
  /** Потрачено за всё время — приходит от провайдера, история не нужна. */
  spentTotal: number | null;
  /** Потрачено за период. null, пока нет двух замеров. */
  spent: number | null;
  /** Внесено за период. null, пока нет двух замеров. */
  toppedUp: number | null;
  /** Сколько замеров легло в расчёт: по одному выводы делать рано. */
  points: number;
}

/**
 * Расход и пополнения за период.
 *
 * Накопленный расход провайдер отдаёт сам, поэтому за период он считается
 * разностью двух замеров — надёжнее, чем прежний подсчёт по падениям остатка:
 * пополнения в неё больше не вмешиваются.
 *
 * Пополнения выводим из того же ряда: остаток изменился на (пополнено − ушло),
 * значит пополнено = изменение остатка + расход.
 */
export async function providerFinance(days: number): Promise<ProviderFinance> {
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await db
    .from('provider_balance')
    .select('balance, spent_total, currency, at')
    .eq('provider', PROVIDER)
    .gte('at', from)
    .order('at', { ascending: true });

  const rows = data ?? [];
  const first = rows[0];
  const last = rows[rows.length - 1];

  let spent: number | null = null;
  let toppedUp: number | null = null;
  if (first && last && first !== last &&
      first.spent_total !== null && last.spent_total !== null) {
    spent = Math.max(0, Number(last.spent_total) - Number(first.spent_total));
    const balanceDelta = Number(last.balance) - Number(first.balance);
    toppedUp = Math.max(0, Math.round((balanceDelta + spent) * 100) / 100);
    spent = Math.round(spent * 100) / 100;
  }

  return {
    balance: last ? Number(last.balance) : null,
    currency: last?.currency ?? 'RUB',
    spentTotal: last?.spent_total !== null && last?.spent_total !== undefined
      ? Number(last.spent_total)
      : null,
    spent,
    toppedUp,
    points: rows.length,
  };
}
