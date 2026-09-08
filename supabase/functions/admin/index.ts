// POST /admin — единый роутер для админ-действий.
// Доступ только юзерам из env ADMIN_IDS (telegram_id через запятую).
//
// Body: { action: 'stats' | 'users' | 'grant-credits' | 'send-message' | 'ban', ... }
//
// Намеренно одна функция вместо 6 — меньше деплоев, проще поддерживать.
import { authorize, corsPreflight, jsonResponse } from '../_shared/auth.ts';
import { db } from '../_shared/db.ts';
import { sendMessage } from '../_shared/telegram.ts';
import { grantReferralReward } from '../_shared/referral.ts';
import { providerFinance, snapshotProviderBalance } from '../_shared/balance.ts';
import { PaymentLinkError, buildPaymentLink } from '../_shared/payment-link.ts';

interface AdminBody {
  action:
    | 'stats'
    | 'users'
    | 'grant-credits'
    | 'send-message'
    | 'ban'
    | 'set-admin'
    | 'mark-paid'
    | 'payment-link'
    | 'payments';
  // зависит от action — валидируем внутри switch
  userId?: number;
  credits?: number;
  message?: string;
  banned?: boolean;
  isAdmin?: boolean;
  packageId?: string;
  search?: string;
  limit?: number;
}

function envAdminIds(): number[] {
  return (Deno.env.get('ADMIN_IDS') ?? '')
    .split(',').map((s) => Number(s.trim())).filter(Boolean);
}

// Админ = в env ADMIN_IDS (bootstrap) ИЛИ флаг is_admin в БД (назначенные).
async function isAdmin(telegramId: number): Promise<boolean> {
  if (envAdminIds().includes(telegramId)) return true;
  const { data } = await db.from('users').select('is_admin').eq('id', telegramId).maybeSingle();
  return Boolean(data?.is_admin);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight();
  if (req.method !== 'POST') return jsonResponse({ error: 'method' }, { status: 405 });

  const auth = await authorize(req);
  if ('response' in auth) return auth.response;
  const tg = auth.user;

  if (!await isAdmin(tg.id)) {
    return jsonResponse({ error: 'not_admin' }, { status: 403 });
  }

  let body: AdminBody;
  try { body = await req.json(); }
  catch { return jsonResponse({ error: 'bad_json' }, { status: 400 }); }

  switch (body.action) {
    case 'stats':         return jsonResponse(await getStats());
    case 'users':         return jsonResponse(await listUsers(body.search ?? '', body.limit ?? 50));
    case 'grant-credits': return handleGrantCredits(body);
    case 'send-message':  return handleSendMessage(body);
    case 'ban':           return handleBan(body);
    case 'set-admin':     return handleSetAdmin(body, tg.id);
    case 'mark-paid':     return handleMarkPaid(body);
    case 'payment-link':  return handlePaymentLink(body);
    case 'payments':      return listPayments(body.limit ?? 50);
    default:              return jsonResponse({ error: 'unknown_action' }, { status: 400 });
  }
});

// ─── stats ────────────────────────────────────────────────────────────────
async function getStats() {
  // Параллельно для скорости.
  const [
    totalUsers,
    newUsers7d,
    jobs7d,
    jobsDone7d,
    feedbacks,
    tokens7d,
    recentErrors,
    agentFallback7d,
    recentFailures,
    allPayments,
    topUsers,
    byDay,
  ] = await Promise.all([
    countWhere('users', () => db.from('users').select('id', { count: 'exact', head: true })),
    countWhere('users', () => db.from('users').select('id', { count: 'exact', head: true }).gte('created_at', sinceISO(7))),
    countWhere('jobs',  () => db.from('jobs').select('id',  { count: 'exact', head: true }).gte('created_at', sinceISO(7))),
    countWhere('jobs',  () => db.from('jobs').select('id',  { count: 'exact', head: true }).gte('created_at', sinceISO(7)).eq('status', 'done')),
    db.from('jobs')
      .select('feedback')
      .gte('created_at', sinceISO(30))
      .not('feedback', 'is', null)
      .then((r) => r.data ?? []),
    db.from('ai_calls')
      .select('prompt_tokens, completion_tokens')
      .gte('created_at', sinceISO(7))
      .then((r) => (r.data ?? []).reduce((s, c) => s + (c.prompt_tokens ?? 0) + (c.completion_tokens ?? 0), 0)),
    // Ошибки, которые реально видел клиент. Откат агента на стандартный промт
    // сюда не берём: работа при нём доводится до конца и человек получает
    // картинку, а список из-за таких записей забивался так, что настоящие сбои
    // в нём терялись — восемь строк шума на две значимых.
    db.from('ai_calls')
      .select('provider, error, created_at')
      .eq('ok', false)
      .neq('model', 'fallback')
      .order('created_at', { ascending: false })
      .limit(10)
      .then((r) => r.data ?? []),
    // Сам откат никуда не деваем — показываем числом: если он вдруг случается
    // почти на каждой работе, персонализация фактически не работает.
    countWhere('ai_calls', () => db.from('ai_calls').select('id', { count: 'exact', head: true }).eq('model', 'fallback').gte('created_at', sinceISO(7))),
    // Упавшие работы — с причиной и владельцем, чтобы можно было написать человеку.
    db.from('jobs')
      .select('id, user_id, error_message, created_at')
      .eq('status', 'failed')
      .gte('created_at', sinceISO(7))
      .order('created_at', { ascending: false })
      .limit(10)
      .then((r) => r.data ?? []),
    // Все платежи разом: их пока сотни, агрегировать в SQL смысла нет.
    // Понадобится — заменим на представление с суммами по периодам.
    db.from('payments')
      .select('amount_rub, credits, created_at')
      .then((r) => r.data ?? []),
    db.from('jobs')
      .select('user_id')
      .gte('created_at', sinceISO(7))
      .then((r) => topN(r.data ?? [], 'user_id', 5)),
    db.from('jobs')
      .select('created_at, status')
      .gte('created_at', sinceISO(14))
      .then((r) => bucketByDay(r.data ?? [])),
  ]);

  const liked    = feedbacks.filter((f) => f.feedback === 'liked').length;
  const disliked = feedbacks.filter((f) => f.feedback === 'disliked').length;
  const total    = liked + disliked;

  // Выручка. Считаем здесь, а не в SQL, потому что платежи уже в памяти.
  const sumRub = (rows: Array<{ amount_rub: number | string }>) =>
    rows.reduce((acc, r) => acc + Number(r.amount_rub ?? 0), 0);
  const since = (days: number) => {
    const from = sinceISO(days);
    return allPayments.filter((p) => p.created_at >= from);
  };

  const revenueTotal = sumRub(allPayments);
  const payments30d = since(30);
  const revenue30d = sumRub(payments30d);

  // Освежаем остаток именно сейчас: между работами он не меняется, но если
  // генераций давно не было, последний замер может быть недельной давности —
  // а смотрят сюда как раз чтобы не прозевать ноль.
  const providerError = await snapshotProviderBalance().catch((e) => String(e));
  const [fin7, fin30] = await Promise.all([providerFinance(7), providerFinance(30)]);

  return {
    totalUsers,
    newUsers7d,
    jobs7d,
    successRate7d: jobs7d > 0 ? Math.round((jobsDone7d / jobs7d) * 100) : 0,
    likeRate30d: total > 0 ? Math.round((liked / total) * 100) : null,
    tokens7d,
    recentErrors,
    agentFallback7d,
    recentFailures,
    topUsers,
    byDay,

    revenueTotal,
    revenue7d:  sumRub(since(7)),
    revenue30d,
    paymentsTotal: allPayments.length,
    payments30d: payments30d.length,
    // Средний чек — по всем платежам за всё время: на малых числах помесячный
    // прыгает так, что смотреть на него бесполезно.
    avgCheck: allPayments.length > 0 ? Math.round(revenueTotal / allPayments.length) : 0,
    creditsSold: allPayments.reduce((acc, p) => acc + Number(p.credits ?? 0), 0),

    // Экономика по провайдеру моделей. Расход и пополнения выведены из истории
    // замеров остатка: провайдер отдаёт только «сколько сейчас».
    providerBalance:  fin30.balance,
    providerCurrency: fin30.currency,
    providerSpent7d:  fin7.spent,
    providerSpent30d: fin30.spent,
    providerToppedUp30d: fin30.toppedUp,
    // Потрачено за всё время — приходит от провайдера, замеры не нужны.
    providerSpentTotal: fin30.spentTotal,
    // Маржа за 30 дней. Пока замеров меньше двух, расход неизвестен, и
    // разность выродилась бы в саму выручку — цифра выглядела бы правдой,
    // не будучи ею. В таком случае честнее не показывать ничего.
    //
    // Расход берём только по моделям: хостинг, комиссия Продамуса и налог
    // сюда не входят, так что это верхняя граница, а не чистая прибыль.
    margin30d: fin30.spent !== null ? revenue30d - fin30.spent : null,
    // Маржа за всё время. Считается сразу: и выручка, и накопленный расход
    // известны без всякой истории замеров.
    marginTotal: fin30.spentTotal !== null ? revenueTotal - fin30.spentTotal : null,
    // По одному-двум замерам расход считать рано: показываем, на чём основано.
    financePoints: fin30.points,
    // Почему остаток не удалось снять. Видно прямо на экране: искать это
    // в логах функции ровно тогда, когда кончаются деньги, — плохая идея.
    providerError,
  };
}

// ─── payments ─────────────────────────────────────────────────────────────
// История покупок: кто, что и когда купил. Нужна, чтобы разбирать споры
// («я платил, ничего не пришло») и просто видеть, чем берут.
async function listPayments(limit: number) {
  const { data, error } = await db
    .from('payments')
    .select('order_id, user_id, package_id, credits, amount_rub, created_at')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));

  if (error) return jsonResponse({ error: error.message }, { status: 500 });
  const rows = data ?? [];

  // Имена покупателей забираем одним запросом на всю страницу, а не по одному
  // на строку: иначе полсотни лишних круговых поездок до базы.
  const ids = [...new Set(rows.map((r) => r.user_id))];
  const { data: users } = ids.length
    ? await db.from('users').select('id, username, first_name').in('id', ids)
    : { data: [] as Array<{ id: number; username: string | null; first_name: string | null }> };
  const byId = new Map((users ?? []).map((u) => [u.id, u]));

  return jsonResponse({
    payments: rows.map((r) => ({
      orderId:   r.order_id,
      userId:    r.user_id,
      username:  byId.get(r.user_id)?.username ?? null,
      firstName: byId.get(r.user_id)?.first_name ?? null,
      packageId: r.package_id,
      credits:   r.credits,
      amountRub: Number(r.amount_rub),
      createdAt: r.created_at,
    })),
  });
}

async function countWhere(_label: string, run: () => unknown): Promise<number> {
  const r = await run() as { count: number | null };
  return r.count ?? 0;
}

function sinceISO(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString();
}

function topN(rows: { user_id: number }[], key: 'user_id', n: number) {
  const counts: Record<number, number> = {};
  for (const r of rows) counts[r[key]] = (counts[r[key]] ?? 0) + 1;
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([uid, c]) => ({ userId: Number(uid), jobs: c }));
}

function bucketByDay(rows: { created_at: string; status: string }[]) {
  const buckets: Record<string, { total: number; done: number }> = {};
  for (const r of rows) {
    const d = r.created_at.slice(0, 10);
    if (!buckets[d]) buckets[d] = { total: 0, done: 0 };
    buckets[d].total++;
    if (r.status === 'done') buckets[d].done++;
  }
  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, v]) => ({ day, ...v }));
}

// ─── users list ────────────────────────────────────────────────────────────
// Колонки запрашиваем строкой, чтобы при отсутствии is_admin (миграция 0009
// ещё не применена) откатиться на набор без неё — список не должен пропадать.
const COLS_WITH_ADMIN = 'id, username, first_name, last_name, credits, banned, is_admin, last_seen_at, created_at';
const COLS_NO_ADMIN   = 'id, username, first_name, last_name, credits, banned, last_seen_at, created_at';

// Форма строки одинакова для обоих наборов колонок; is_admin опционален, потому что
// в COLS_NO_ADMIN его нет. Явный тип нужен, чтобы map ниже не получал implicit any.
interface AdminUserRow {
  id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  credits: number | null;       // остаток генераций (миграция 0016)
  banned: boolean | null;
  is_admin?: boolean | null;
  last_seen_at: string | null;
  created_at: string | null;
}

type UsersQueryResult = { data: AdminUserRow[] | null; error: { message: string } | null };

async function listUsers(search: string, limit: number) {
  const run = (cols: string) => {
    let q = db
      .from('users')
      .select(cols)
      .order('last_seen_at', { ascending: false, nullsFirst: false })
      .limit(Math.min(limit, 200));

    if (search) {
      const num = Number(search);
      if (Number.isFinite(num)) {
        q = q.or(`id.eq.${num}`);
      } else {
        // Сначала вырезаем символы, имеющие смысл в синтаксисе фильтров PostgREST
        // (',' разделяет условия, '()' группируют, '*' — wildcard, '\' — escape) —
        // иначе админ мог бы дописать произвольные фильтры в .or(). Затем экранируем
        // LIKE-wildcards. Для обычных имён/username это поведение не меняет.
        const esc = search
          .replace(/[,()*\\]/g, ' ')
          .replace(/[%_]/g, (m) => '\\' + m);
        q = q.or(`username.ilike.%${esc}%,first_name.ilike.%${esc}%,last_name.ilike.%${esc}%`);
      }
    }
    return q;
  };

  // Приводим к общей форме: select() со строкой колонок не даёт статического типа строки.
  let { data, error } = await run(COLS_WITH_ADMIN) as unknown as UsersQueryResult;
  if (error) {
    // Скорее всего нет колонки is_admin — пробуем без неё, чтобы список жил.
    ({ data, error } = await run(COLS_NO_ADMIN) as unknown as UsersQueryResult);
  }
  if (error) return { items: [], error: error.message };

  // Считаем jobs для каждого user-а одним запросом.
  const ids = (data ?? []).map((u) => u.id);
  const counts: Record<number, number> = {};
  if (ids.length) {
    const { data: jobs } = await db.from('jobs').select('user_id').in('user_id', ids);
    for (const j of jobs ?? []) counts[j.user_id] = (counts[j.user_id] ?? 0) + 1;
  }

  return {
    items: (data ?? []).map((u) => ({
      id:           u.id,
      username:     u.username ?? null,
      firstName:    u.first_name ?? null,
      lastName:     u.last_name ?? null,
      credits:      u.credits ?? 0,
      banned:       u.banned ?? false,
      isAdmin:      u.is_admin ?? false,
      envAdmin:     envAdminIds().includes(u.id),
      lastSeenAt:   u.last_seen_at,
      createdAt:    u.created_at,
      jobsTotal:    counts[u.id] ?? 0,
    })),
  };
}

// ─── actions ───────────────────────────────────────────────────────────────

async function handleGrantCredits(body: AdminBody) {
  if (!body.userId || !body.credits || body.credits < 1) {
    return jsonResponse({ error: 'bad_input' }, { status: 400 });
  }
  // Ключевая кнопка первого этапа продаж: человек оплатил счёт из кабинета
  // ЮKassa — владелец начисляет генерации отсюда, вручную.
  const { data: cur } = await db.from('users').select('credits').eq('id', body.userId).maybeSingle();
  const next = (cur?.credits ?? 0) + body.credits;
  const { error } = await db.from('users').update({ credits: next }).eq('id', body.userId);
  if (error) return jsonResponse({ error: error.message }, { status: 500 });
  return jsonResponse({ ok: true, credits: next });
}

async function handleSendMessage(body: AdminBody) {
  if (!body.userId || !body.message?.trim()) {
    return jsonResponse({ error: 'bad_input' }, { status: 400 });
  }
  try {
    await sendMessage(body.userId, body.message.trim());
    return jsonResponse({ ok: true });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'send_failed' }, { status: 500 });
  }
}

async function handleBan(body: AdminBody) {
  if (!body.userId || typeof body.banned !== 'boolean') {
    return jsonResponse({ error: 'bad_input' }, { status: 400 });
  }
  const { error } = await db.from('users').update({ banned: body.banned }).eq('id', body.userId);
  if (error) return jsonResponse({ error: error.message }, { status: 500 });
  return jsonResponse({ ok: true });
}

async function handleSetAdmin(body: AdminBody, callerId: number) {
  if (!body.userId || typeof body.isAdmin !== 'boolean') {
    return jsonResponse({ error: 'bad_input' }, { status: 400 });
  }
  // Снять админку с env-админа нельзя: ADMIN_IDS всё равно вернёт ему доступ,
  // так что это была бы вводящая в заблуждение «галочка». Сообщаем явно.
  if (!body.isAdmin && envAdminIds().includes(body.userId)) {
    return jsonResponse({ error: 'env_admin_protected' }, { status: 400 });
  }
  // Защита от случайного саморазжалования (чтобы не выпасть из админки).
  if (!body.isAdmin && body.userId === callerId) {
    return jsonResponse({ error: 'cannot_demote_self' }, { status: 400 });
  }
  const { error } = await db.from('users').update({ is_admin: body.isAdmin }).eq('id', body.userId);
  if (error) return jsonResponse({ error: error.message }, { status: 500 });
  return jsonResponse({ ok: true });
}

// ВРЕМЕННО: имитация первой оплаты друга для теста реферального начисления.
// Когда подключим платёжный вебхук — он вызовет grantReferralReward напрямую,
// а этот экшн можно удалить.
async function handleMarkPaid(body: AdminBody) {
  if (!body.userId) return jsonResponse({ error: 'bad_input' }, { status: 400 });
  const result = await grantReferralReward(body.userId);
  return jsonResponse(result);
}

// ─── payment-link ─────────────────────────────────────────────────────────
// Ручная выдача ссылки: владелец собирает её на любого юзера и шлёт в чат.
// Обычный покупатель получает такую же ссылку сам, через функцию payment-link —
// сборщик у них общий (_shared/payment-link.ts), чтобы прайс и формат order_id
// не разъехались между двумя входами.
async function handlePaymentLink(body: AdminBody) {
  if (!body.userId) {
    return jsonResponse({ error: 'userId required' }, { status: 400 });
  }

  const { data: user } = await db
    .from('users').select('id, username').eq('id', body.userId).maybeSingle();
  if (!user) return jsonResponse({ error: 'user_not_found' }, { status: 404 });

  try {
    const link = buildPaymentLink(
      body.userId,
      body.packageId ?? '',
      `@${user.username ?? user.id}`,
    );
    return jsonResponse({ ok: true, ...link });
  } catch (e) {
    if (e instanceof PaymentLinkError) {
      if (e.code === 'not_configured') {
        console.error('PRODAMUS_FORM_URL не задан — выдать ссылку нечем');
      }
      return jsonResponse({ error: e.code, ...e.extra }, { status: e.status });
    }
    throw e;
  }
}
