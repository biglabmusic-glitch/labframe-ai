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
    currency: current.currency,
  });
  return error ? `запись в базу: ${error.message}` : null;
}

export interface ProviderFinance {
  balance: number | null;
  currency: string;
  /** Сколько ушло на генерации за период — сумма падений остатка. */
  spent: number;
  /** Сколько внесено за период — сумма подъёмов остатка. */
  toppedUp: number;
  /** Сколько замеров легло в расчёт: по одному-двум выводы делать рано. */
  points: number;
}

/**
 * Считает расход и пополнения из истории замеров.
 *
 * Провайдер отдаёт только «сколько сейчас», поэтому историю ведём сами. Между
 * двумя соседними замерами остаток либо упал — и это потраченное на генерации,
 * либо вырос — и это пополнение счёта. Ничего другого с ним произойти не может,
 * так что двух рядов достаточно, чтобы восстановить обе величины.
 */
export async function providerFinance(days: number): Promise<ProviderFinance> {
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await db
    .from('provider_balance')
    .select('balance, currency, at')
    .eq('provider', PROVIDER)
    .gte('at', from)
    .order('at', { ascending: true });

  const rows = data ?? [];
  let spent = 0;
  let toppedUp = 0;
  for (let i = 1; i < rows.length; i++) {
    const delta = Number(rows[i].balance) - Number(rows[i - 1].balance);
    if (delta < 0) spent += -delta;
    else toppedUp += delta;
  }

  // Текущий остаток берём из последнего замера, а не запрашиваем заново:
  // админку открывают часто, а лишний запрос к провайдеру ничего не уточнит.
  const last = rows[rows.length - 1];
  return {
    balance: last ? Number(last.balance) : null,
    currency: last?.currency ?? 'RUB',
    spent: Math.round(spent * 100) / 100,
    toppedUp: Math.round(toppedUp * 100) / 100,
    points: rows.length,
  };
}
