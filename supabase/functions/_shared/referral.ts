// Реферальные хелперы. Чистые функции (без БД) тестируются в referral_test.ts.
import { db } from './db.ts';
import { sendMessage } from './telegram.ts';

// Безопасный алфавит без похожих символов (0/O, 1/I/L).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Приводим код к каноничному виду: upper-case, только [A-Z0-9-]. */
export function normalizeCode(raw: string): string {
  return (raw ?? '').toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

/** start_param приходит как 'ref_<CODE>'. Возвращаем нормализованный код или ''. */
export function parseStartParam(sp: string | undefined | null): string {
  if (!sp) return '';
  if (!sp.startsWith('ref_')) return '';
  return normalizeCode(sp.slice('ref_'.length));
}

/** Генерим код формата ZUB-XXXX (4 символа из безопасного алфавита). */
export function generateRefCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return `ZUB-${s}`;
}

/** Гарантирует наличие ref_code у юзера. Возвращает код. */
export async function ensureRefCode(userId: number): Promise<string> {
  const { data } = await db.from('users').select('ref_code').eq('id', userId).maybeSingle();
  if (data?.ref_code) return data.ref_code;

  // До 5 попыток на случай коллизии unique-индекса.
  for (let i = 0; i < 5; i++) {
    const code = generateRefCode();
    const { error } = await db.from('users').update({ ref_code: code }).eq('id', userId);
    if (!error) return code;
  }
  throw new Error('ensureRefCode: too many collisions');
}

function envInt(name: string, def: number): number {
  const v = Number(Deno.env.get(name));
  return Number.isFinite(v) && v > 0 ? v : def;
}

export interface ApplyResult {
  ok: boolean;
  already?: boolean;
  reason?: string;
}

/**
 * Привязывает referee к коду. Все анти-абьюз правила здесь.
 * Мягкие отказы (ok:false, reason) — не ошибки сервера.
 */
export async function applyReferral(refereeId: number, rawCode: string): Promise<ApplyResult> {
  const code = normalizeCode(rawCode);
  if (!code) return { ok: false, reason: 'empty_code' };

  // Уже привязан? Идемпотентность.
  const { data: me } = await db
    .from('users')
    .select('referred_by, created_at')
    .eq('id', refereeId)
    .maybeSingle();
  if (!me) return { ok: false, reason: 'no_user' };
  if (me.referred_by) return { ok: true, already: true };

  // Кого ещё можно привязать.
  //
  // Раньше правилом был час с момента регистрации, и это отсекало нормальный
  // сценарий: человек поставил приложение, потыкал, а про промокод узнал позже.
  // Настоящее злоупотребление — привязать задним числом того, кто УЖЕ платил:
  // тогда пригласивший получает награду за клиента, которого не приводил.
  // Поэтому смотрим на факт оплаты, а срок оставляем широким страховочным.
  const { count: paidCount } = await db
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', refereeId);
  if ((paidCount ?? 0) > 0) return { ok: false, reason: 'already_paid' };

  const windowDays = envInt('REFERRAL_NEW_USER_WINDOW_DAYS', 30);
  const ageMs = Date.now() - new Date(me.created_at).getTime();
  if (ageMs > windowDays * 24 * 60 * 60_000) return { ok: false, reason: 'too_old' };

  // Найти пригласившего по коду.
  const { data: referrer } = await db
    .from('users')
    .select('id')
    .eq('ref_code', code)
    .maybeSingle();
  if (!referrer) return { ok: false, reason: 'bad_code' };
  if (referrer.id === refereeId) return { ok: false, reason: 'self' };

  // Ставим привязку. referee_id UNIQUE защищает от гонки/дублей.
  const { error: insErr } = await db.from('referrals').insert({
    referrer_id: referrer.id,
    referee_id: refereeId,
    status: 'joined',
  });
  if (insErr) {
    // Уникальный конфликт = кто-то успел привязать раньше. Считаем идемпотентно.
    if (insErr.code === '23505') return { ok: true, already: true };
    return { ok: false, reason: 'insert_failed' };
  }

  await db.from('users').update({ referred_by: referrer.id }).eq('id', refereeId);
  return { ok: true };
}

export interface RewardResult {
  ok: boolean;
  reason?: string;
  referrerId?: number;
  referrerBonus?: number;
  refereeBonus?: number;
}

/**
 * Начисляет награду за первую оплату друга. Идемпотентна: бонус выдаётся,
 * только если ряд referrals реально перешёл joined→paid (ровно один ряд).
 * Вызывается из будущего платёжного вебхука (сейчас — из админ-экшна mark-paid).
 */
export async function grantReferralReward(refereeId: number): Promise<RewardResult> {
  // Атомарный переход статуса: обновляем ТОЛЬКО строки в 'joined'.
  const { data: updated, error: updErr } = await db
    .from('referrals')
    .update({ status: 'paid', rewarded_at: new Date().toISOString() })
    .eq('referee_id', refereeId)
    .eq('status', 'joined')
    .select('referrer_id')
    .maybeSingle();

  if (updErr) return { ok: false, reason: 'update_failed' };
  if (!updated) return { ok: false, reason: 'nothing_to_reward' }; // нет привязки или уже paid

  const referrerBonus = envInt('REFERRER_BONUS', 10);
  const refereeBonus = envInt('REFEREE_BONUS', 5);

  const referrerBalance = await addCredits(updated.referrer_id, referrerBonus);
  const refereeBalance = await addCredits(refereeId, refereeBonus);
  await db.from('users').update({ referral_rewarded: true }).eq('id', refereeId);

  // Сообщаем обоим. Без этого вся механика работает вхолостую: пригласивший
  // не узнаёт, что его труд окупился, и второго друга уже не приведёт.
  //
  // Имя приглашённого не называем: пригласивший и так знает, кого звал, а
  // рассказывать одному пользователю о платежах другого мы не будем.
  //
  // Сбой отправки не отменяет начисление — бонусы уже на балансе.
  await notify(
    updated.referrer_id,
    `Приглашённый вами человек оплатил первый пакет.` +
    ` Вам начислено ${referrerBonus} генераций` +
    (referrerBalance !== null ? `, теперь на балансе ${referrerBalance}.` : '.'),
  );
  await notify(
    refereeId,
    `Бонус за приглашение: ${refereeBonus} генераций сверх оплаченного пакета` +
    (refereeBalance !== null ? `. Теперь на балансе ${refereeBalance}.` : '.'),
  );

  return {
    ok: true,
    referrerId: updated.referrer_id,
    referrerBonus,
    refereeBonus,
  };
}

/**
 * Начисляет генерации одним атомарным запросом (миграция 0019).
 *
 * Раньше здесь было чтение баланса и запись «прочитанное + N». Если между этими
 * шагами приходила оплата, её начисление затиралось: второй запрос писал сумму,
 * посчитанную из устаревшего значения. При выдаче двух бонусов подряд это вполне
 * достижимо, поэтому сложение отдано СУБД.
 *
 * Возвращает новый баланс — он нужен, чтобы написать человеку осмысленное
 * сообщение, а не «бонус начислен, смотрите сами».
 */
/** Пишет в чат и молчит при сбое: сообщение вторично, начисление уже состоялось. */
async function notify(userId: number, text: string): Promise<void> {
  try {
    await sendMessage(userId, text);
  } catch (e) {
    console.error(`не смогли сообщить о бонусе юзеру ${userId}:`, e instanceof Error ? e.message : e);
  }
}

async function addCredits(userId: number, by: number): Promise<number | null> {
  const { data, error } = await db.rpc('add_credits', { p_user_id: userId, p_delta: by });
  if (!error) return typeof data === 'number' ? data : null;

  // Запасной путь на случай, если миграция 0019 ещё не накачена.
  //
  // Просто вернуть null здесь нельзя: статус реферала к этому моменту уже
  // переведён в 'paid' и обратно не откатывается, так что несостоявшееся
  // начисление означало бы потерянный навсегда бонус. Лучше неатомарно, чем
  // никак. Гонка тут маловероятна, а сообщение в логах громкое.
  console.error(`add_credits недоступна (${error.message}) — начисляю запасным путём`);
  const { data: row } = await db.from('users').select('credits').eq('id', userId).maybeSingle();
  if (!row) return null;
  const next = Math.max((row.credits ?? 0) + by, 0);
  await db.from('users').update({ credits: next }).eq('id', userId);
  return next;
}

/** Сводка по рефералам юзера — для /me. */
export async function referralStats(userId: number): Promise<{
  referralsCount: number;
  referralsPaid: number;
}> {
  const { count: total } = await db
    .from('referrals')
    .select('id', { count: 'exact', head: true })
    .eq('referrer_id', userId);
  const { count: paid } = await db
    .from('referrals')
    .select('id', { count: 'exact', head: true })
    .eq('referrer_id', userId)
    .eq('status', 'paid');
  return { referralsCount: total ?? 0, referralsPaid: paid ?? 0 };
}
