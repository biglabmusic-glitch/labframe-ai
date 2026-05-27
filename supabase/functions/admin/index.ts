// POST /admin — единый роутер для админ-действий.
// Доступ только юзерам из env ADMIN_IDS (telegram_id через запятую).
//
// Body: { action: 'stats' | 'users' | 'set-plan' | 'grant-credits' | 'send-message' | 'ban', ... }
//
// Намеренно одна функция вместо 6 — меньше деплоев, проще поддерживать.
import { authorize, corsPreflight, jsonResponse } from '../_shared/auth.ts';
import { db } from '../_shared/db.ts';
import { sendMessage } from '../_shared/telegram.ts';

interface AdminBody {
  action:
    | 'stats'
    | 'users'
    | 'set-plan'
    | 'grant-credits'
    | 'send-message'
    | 'ban';
  // зависит от action — валидируем внутри switch
  userId?: number;
  plan?: 'free' | 'start' | 'pro' | 'lab';
  credits?: number;
  message?: string;
  banned?: boolean;
  search?: string;
  limit?: number;
}

function isAdmin(telegramId: number): boolean {
  const raw = Deno.env.get('ADMIN_IDS') ?? '';
  const list = raw.split(',').map((s) => Number(s.trim())).filter(Boolean);
  return list.includes(telegramId);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight();
  if (req.method !== 'POST') return jsonResponse({ error: 'method' }, { status: 405 });

  const auth = await authorize(req);
  if ('response' in auth) return auth.response;
  const tg = auth.user;

  if (!isAdmin(tg.id)) {
    return jsonResponse({ error: 'not_admin' }, { status: 403 });
  }

  let body: AdminBody;
  try { body = await req.json(); }
  catch { return jsonResponse({ error: 'bad_json' }, { status: 400 }); }

  switch (body.action) {
    case 'stats':         return jsonResponse(await getStats());
    case 'users':         return jsonResponse(await listUsers(body.search ?? '', body.limit ?? 50));
    case 'set-plan':      return handleSetPlan(body);
    case 'grant-credits': return handleGrantCredits(body);
    case 'send-message':  return handleSendMessage(body);
    case 'ban':           return handleBan(body);
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
    db.from('ai_calls')
      .select('provider, error, created_at')
      .eq('ok', false)
      .order('created_at', { ascending: false })
      .limit(10)
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

  return {
    totalUsers,
    newUsers7d,
    jobs7d,
    successRate7d: jobs7d > 0 ? Math.round((jobsDone7d / jobs7d) * 100) : 0,
    likeRate30d: total > 0 ? Math.round((liked / total) * 100) : null,
    tokens7d,
    recentErrors,
    topUsers,
    byDay,
  };
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
async function listUsers(search: string, limit: number) {
  let q = db
    .from('users')
    .select('id, username, first_name, last_name, plan, usage_used, usage_limit, banned, last_seen_at, created_at')
    .order('last_seen_at', { ascending: false, nullsFirst: false })
    .limit(Math.min(limit, 200));

  if (search) {
    // username, first/last + численный id.
    const num = Number(search);
    if (Number.isFinite(num)) {
      q = q.or(`id.eq.${num}`);
    } else {
      const esc = search.replace(/[%_]/g, (m) => '\\' + m);
      q = q.or(`username.ilike.%${esc}%,first_name.ilike.%${esc}%,last_name.ilike.%${esc}%`);
    }
  }

  const { data, error } = await q;
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
      plan:         u.plan ?? 'free',
      usageUsed:    u.usage_used ?? 0,
      usageLimit:   u.usage_limit ?? 3,
      banned:       u.banned ?? false,
      lastSeenAt:   u.last_seen_at,
      createdAt:    u.created_at,
      jobsTotal:    counts[u.id] ?? 0,
    })),
  };
}

// ─── actions ───────────────────────────────────────────────────────────────
const PLAN_LIMITS: Record<string, number> = {
  free:  3,
  start: 20,
  pro:   9999,
  lab:   9999,
};

async function handleSetPlan(body: AdminBody) {
  if (!body.userId || !body.plan) return jsonResponse({ error: 'bad_input' }, { status: 400 });
  const { error } = await db
    .from('users')
    .update({ plan: body.plan, usage_limit: PLAN_LIMITS[body.plan] ?? 3 })
    .eq('id', body.userId);
  if (error) return jsonResponse({ error: error.message }, { status: 500 });
  return jsonResponse({ ok: true });
}

async function handleGrantCredits(body: AdminBody) {
  if (!body.userId || !body.credits || body.credits < 1) {
    return jsonResponse({ error: 'bad_input' }, { status: 400 });
  }
  // Поднимаем usage_limit (а не сбрасываем used) — это и есть «бонусные генерации».
  const { data: cur } = await db.from('users').select('usage_limit').eq('id', body.userId).maybeSingle();
  const newLimit = (cur?.usage_limit ?? 3) + body.credits;
  const { error } = await db.from('users').update({ usage_limit: newLimit }).eq('id', body.userId);
  if (error) return jsonResponse({ error: error.message }, { status: 500 });
  return jsonResponse({ ok: true, newLimit });
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
