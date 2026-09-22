// Остаток у провайдера моделей и вывод расхода из истории замеров.
import { db } from './db.ts';
import { notifyAdmins } from './admins.ts';
import { fetchBalance } from './polza.ts';

const PROVIDER = 'polza';

// Пороги, на которых бот пишет админам. Сообщение уходит один раз — в тот
// замер, когда остаток порог пересёк. Пока не пополнили, про этот порог больше
// не напоминаем: замер делается после каждой работы, и бот задолбал бы.
const ALERT_THRESHOLDS = [500, 200];

/** Живой остаток, снятый только что. */
export interface LiveBalance {
  balance: number;
  total: number | null;
  reserved: number | null;
  spentTotal: number | null;
  currency: string;
  at: string;
}

export interface SnapshotResult {
  /** Причина, по которой замер не удался. null — всё получилось. */
  error: string | null;
  /** Что ответил провайдер. null — не ответил. */
  live: LiveBalance | null;
}

/**
 * Снимает текущий остаток и записывает его в историю.
 *
 * Отдаёт и сам ответ провайдера: админке важно показать живую цифру, даже
 * если записать её в базу не вышло. Иначе на экране остаётся позавчерашний
 * замер, и понять это можно только по мелкой подписи.
 */
export async function snapshotProviderBalance(): Promise<SnapshotResult> {
  const current = await fetchBalance();
  if (!current.ok) return { error: current.error, live: null };

  const live: LiveBalance = {
    balance: current.balance,
    total: current.total,
    reserved: current.reserved,
    spentTotal: current.spentTotal,
    currency: current.currency,
    at: new Date().toISOString(),
  };

  const { data: previous } = await db
    .from('provider_balance')
    .select('balance')
    .eq('provider', PROVIDER)
    .order('at', { ascending: false })
    .limit(1);

  const { error } = await db.from('provider_balance').insert({
    provider: PROVIDER,
    balance: current.balance,
    amount: current.total,
    reserved: current.reserved,
    spent_total: current.spentTotal,
    currency: current.currency,
  });
  if (error) return { error: `запись в базу: ${error.message}`, live };

  const before = previous?.[0] ? Number(previous[0].balance) : null;
  await alertIfLow(before, current.balance, current.currency);
  return { error: null, live };
}

async function alertIfLow(before: number | null, now: number, currency: string): Promise<void> {
  const crossed = ALERT_THRESHOLDS.find((t) => now <= t && (before === null || before > t));
  if (crossed === undefined) return;

  await notifyAdmins(
    `⚠️ На счёте polza.ai осталось ${Math.round(now)} ${currency}.\n\n` +
    'Когда деньги кончатся, генерации начнут падать у всех. Счёт пополняется на polza.ai.',
  );
}

export interface ProviderFinance {
  balance: number | null;
  /** Вся сумма на счёте, включая зарезервированное. null — провайдер не отдал. */
  total: number | null;
  reserved: number | null;
  /** Когда сделан последний замер. */
  measuredAt: string | null;
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
    .select('balance, amount, reserved, spent_total, currency, at')
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

  const numberOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));

  return {
    balance: last ? Number(last.balance) : null,
    total: last ? numberOrNull(last.amount) : null,
    reserved: last ? numberOrNull(last.reserved) : null,
    measuredAt: last?.at ?? null,
    currency: last?.currency ?? 'RUB',
    spentTotal: last ? numberOrNull(last.spent_total) : null,
    spent,
    toppedUp,
    points: rows.length,
  };
}
