// Ежедневная сводка админам в Telegram.
//
// Об оплатах и о низком остатке бот пишет сразу. Сводка закрывает остальное:
// всплеск упавших работ, тишину в генерациях или убежавший расход видно, не
// открывая админку. Раз в сутки, утром.

import { db } from './db.ts';
import { notifyAdmins } from './admins.ts';
import { providerFinance } from './balance.ts';

/** Час по Москве, в который уходит сводка. */
const DIGEST_HOUR_MSK = 10;

export interface DigestData {
  jobs: number;
  done: number;
  failed: number;
  newUsers: number;
  revenue: number;
  payments: number;
  balance: number | null;
  currency: string;
  blocked: number;
  /** Самая частая причина падений за сутки. */
  topError: string | null;
}

/** Текст сводки. Чистая функция — её проверяют тесты. */
export function digestText(d: DigestData): string {
  const rate = d.jobs > 0 ? Math.round((d.done / d.jobs) * 100) : null;
  const lines = [
    '📊 За сутки',
    '',
    `Работ: ${d.jobs}` + (rate === null ? '' : ` · успешных ${rate}%`),
  ];

  if (d.failed > 0) {
    lines.push(`Упало: ${d.failed}${d.topError ? ` · чаще всего: ${d.topError}` : ''}`);
  }
  lines.push(`Новых людей: ${d.newUsers}`);
  if (d.payments > 0) lines.push(`Оплат: ${d.payments} на ${Math.round(d.revenue)} ₽`);
  if (d.balance !== null) lines.push(`Остаток polza: ${Math.round(d.balance)} ${d.currency}`);
  if (d.blocked > 0) lines.push(`Заблокировали бота: ${d.blocked}`);

  // Повод открыть админку, а не просто цифры.
  if (d.jobs === 0) lines.push('', 'За сутки ни одной работы — это необычно, стоит проверить.');
  else if (rate !== null && rate < 80) lines.push('', 'Успешных меньше 80% — загляните в «упавшие работы».');

  return lines.join('\n');
}

/**
 * Шлёт сводку, если сегодня её ещё не было и сейчас утро по Москве.
 * Строка в admin_digests — замок: при нескольких запусках в час уйдёт одна.
 */
export async function sendDailyDigest(now: number): Promise<boolean> {
  const moscow = new Date(now + 3 * 60 * 60 * 1000);
  if (moscow.getUTCHours() !== DIGEST_HOUR_MSK) return false;

  const day = moscow.toISOString().slice(0, 10);
  const { error: claimErr } = await db.from('admin_digests').insert({ day });
  if (claimErr) return false; // 23505 — сводку за сегодня уже отправили

  try {
    await notifyAdmins(digestText(await collect(now)));
    return true;
  } catch (e) {
    console.error('сводка не ушла:', e instanceof Error ? e.message : e);
    return false;
  }
}

async function collect(now: number): Promise<DigestData> {
  const since = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;

  const [jobs, done, failedRows, newUsers, payments, blocked, finance] = await Promise.all([
    count(db.from('jobs').select('id', { count: 'exact', head: true }).gte('created_at', since)),
    count(db.from('jobs').select('id', { count: 'exact', head: true }).gte('created_at', since).eq('status', 'done')),
    db.from('jobs').select('error_message').gte('created_at', since).eq('status', 'failed')
      .then((r) => r.data ?? []),
    count(db.from('users').select('id', { count: 'exact', head: true }).gte('created_at', since)),
    db.from('payments').select('amount_rub').gte('created_at', since).then((r) => r.data ?? []),
    count(db.from('users').select('id', { count: 'exact', head: true }).gte('bot_blocked_at', since)),
    providerFinance(30),
  ]);

  return {
    jobs,
    done,
    failed: failedRows.length,
    newUsers,
    revenue: payments.reduce((s, p) => s + Number(p.amount_rub ?? 0), 0),
    payments: payments.length,
    balance: finance.balance,
    currency: finance.currency,
    blocked,
    topError: topReason(failedRows.map((f) => f.error_message)),
  };
}

/** Самая частая причина падений — коротко, без технических подробностей. */
export function topReason(messages: Array<string | null>): string | null {
  const counts = new Map<string, number>();
  for (const raw of messages) {
    const key = shortReason(raw ?? '');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? `${best[0]} (${best[1]})` : null;
}

function shortReason(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes('не ответила') || s.includes('timeout')) return 'модель не ответила';
  if (s.includes('not_picked_up')) return 'работа не дождалась очереди';
  if (s.includes('402')) return 'кончились деньги у провайдера';
  if (s.includes('polza') || s.includes('replicate')) return 'ошибка провайдера';
  return raw.slice(0, 40) || 'без причины';
}
