// POST /funnel — рассылка автоворонки. Зовёт pg_cron раз в час (миграция 0023).
//
// Для каждого новичка собираем состояние из базы, спрашиваем у _shared/funnel.ts,
// не пора ли ему что-то написать, и отправляем. Что и когда писать — решает
// funnel.ts; здесь только данные и доставка.
import { jsonResponse } from '../_shared/auth.ts';
import { db } from '../_shared/db.ts';
import {
  type FunnelLinks,
  type FunnelUser,
  type StepId,
  isDaytimeMoscow,
  nextStep,
  renderStep,
} from '../_shared/funnel.ts';
import { ensureRefCode } from '../_shared/referral.ts';
import { isUnreachable, sendMessage } from '../_shared/telegram.ts';

const DAY = 24 * 60 * 60 * 1000;

// Дальше этого срока с регистрации человека воронка не ведёт: последний шаг
// («уснул», 14 дней тишины) давно позади, а перебирать всю базу каждый час незачем.
const HORIZON_DAYS = 90;

// Потолок на один запуск. Telegram позволяет ~30 сообщений в секунду, но
// растягивать всплеск на часы безопаснее: если текст неудачный и люди начнут
// блокировать бота, это будет видно в админке раньше, чем он уйдёт всем.
const MAX_PER_RUN = 100;
const SEND_PAUSE_MS = 60;

// Работа в created/processing дольше этого — зависшая, её добьёт сторож.
const ACTIVE_JOB_MS = 15 * 60 * 1000;

// Выборки режем на куски: id в запросе уходят в адресную строку.
const CHUNK = 200;
const PAGE = 1000;

Deno.serve(async (req) => {
  if (req.headers.get('x-internal-secret') !== Deno.env.get('INTERNAL_SECRET')) {
    return jsonResponse({ error: 'forbidden' }, { status: 403 });
  }

  const now = Date.now();
  if (!isDaytimeMoscow(now)) return jsonResponse({ ok: true, skipped: 'night' });

  const users = await loadUsers(now);
  if (users.size === 0) return jsonResponse({ ok: true, checked: 0, sent: 0 });

  const links: FunnelLinks = {
    webAppUrl:  Deno.env.get('WEBAPP_URL') ?? 'https://labframe-ai.vercel.app/',
    channelUrl: Deno.env.get('CHANNEL_URL') || undefined,
    chatUrl:    Deno.env.get('CHAT_URL') || undefined,
  };
  const options = { hasCommunity: Boolean(links.channelUrl || links.chatUrl) };

  let sent = 0;
  let failed = 0;

  for (const [userId, state] of users) {
    if (sent + failed >= MAX_PER_RUN) break;

    const step = nextStep(state, now, options);
    if (!step) continue;

    const result = await deliver(userId, step, state, links);
    if (result === 'sent') sent++;
    if (result === 'failed') failed++;
    await new Promise((r) => setTimeout(r, SEND_PAUSE_MS));
  }

  console.log(`воронка: проверили ${users.size}, отправили ${sent}, не доставили ${failed}`);
  return jsonResponse({ ok: true, checked: users.size, sent, failed });
});

async function deliver(
  userId: number,
  step: StepId,
  state: FunnelUser,
  links: FunnelLinks,
): Promise<'sent' | 'failed' | 'skipped'> {
  // Сначала занимаем шаг, потом шлём. Уникальный ключ (user_id, step) не даст
  // второму запуску, стартовавшему одновременно, отправить то же самое.
  const { data: row, error: claimErr } = await db
    .from('funnel_messages')
    .insert({ user_id: userId, step })
    .select('id')
    .maybeSingle();
  if (claimErr || !row) {
    if (claimErr?.code !== '23505') console.error(`воронка: не заняли ${step} для ${userId}:`, claimErr?.message);
    return 'skipped';
  }

  try {
    const stepLinks = step === 'invite' ? { ...links, inviteUrl: await inviteUrl(userId) } : links;
    const { text, buttons } = renderStep(step, state, stepLinks);
    await sendMessage(userId, text, { inline: buttons });
    await db.from('funnel_messages').update({ status: 'sent' }).eq('id', row.id);
    return 'sent';
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.from('funnel_messages').update({ status: 'failed', error: message.slice(0, 500) }).eq('id', row.id);
    if (isUnreachable(message)) {
      await db.from('users').update({ bot_blocked_at: new Date().toISOString() }).eq('id', userId);
    } else {
      console.error(`воронка: ${step} для ${userId} не ушёл:`, message);
    }
    return 'failed';
  }
}

/** Ссылка «поделиться» с личным кодом приглашения — та же, что в мини-аппе. */
async function inviteUrl(userId: number): Promise<string> {
  const code = await ensureRefCode(userId);
  const bot = Deno.env.get('BOT_USERNAME') ?? 'labframe_ai_bot';
  const link = `https://t.me/${bot}/app?startapp=ref_${code}`;
  const text = 'Делаю посты для зубных работ через ИИ — попробуй, дам бонусные генерации 👇';
  return `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
}

// ─── состояние из базы ─────────────────────────────────────────────────────

async function loadUsers(now: number): Promise<Map<number, FunnelUser>> {
  const since = new Date(now - HORIZON_DAYS * DAY).toISOString();

  const rows = await pages((from, to) =>
    db.from('users')
      .select('id, credits, created_at, consent_at, last_seen_at')
      .eq('funnel_enabled', true)
      .eq('banned', false)
      .is('funnel_opt_out_at', null)
      .is('bot_blocked_at', null)
      .gte('created_at', since)
      .order('id')
      .range(from, to)
  );

  const users = new Map<number, FunnelUser>();
  for (const r of rows) {
    users.set(Number(r.id), {
      createdAt:   Date.parse(r.created_at),
      consentAt:   r.consent_at ? Date.parse(r.consent_at) : null,
      lastSeenAt:  Date.parse(r.last_seen_at ?? r.created_at),
      credits:     Number(r.credits ?? 0),
      jobsTotal:   0,
      jobsDone:    0,
      firstDoneAt: null,
      thirdDoneAt: null,
      lastJobAt:   null,
      activeJob:   false,
      firstPaidAt: null,
      sent:        {},
    });
  }

  const ids = [...users.keys()];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const [jobs, payments, messages] = await Promise.all([
      pages((from, to) =>
        db.from('jobs').select('id, user_id, status, created_at, finished_at')
          .in('user_id', chunk).order('id').range(from, to)),
      pages((from, to) =>
        db.from('payments').select('order_id, user_id, created_at')
          .in('user_id', chunk).order('order_id').range(from, to)),
      pages((from, to) =>
        db.from('funnel_messages').select('id, user_id, step, sent_at')
          .in('user_id', chunk).order('id').range(from, to)),
    ]);

    const doneTimes = new Map<number, number[]>();
    for (const j of jobs) {
      const u = users.get(Number(j.user_id));
      if (!u) continue;
      const created = Date.parse(j.created_at);
      u.jobsTotal++;
      u.lastJobAt = Math.max(u.lastJobAt ?? 0, created);
      if ((j.status === 'created' || j.status === 'processing') && now - created < ACTIVE_JOB_MS) {
        u.activeJob = true;
      }
      if (j.status === 'done') {
        u.jobsDone++;
        const list = doneTimes.get(Number(j.user_id)) ?? [];
        list.push(Date.parse(j.finished_at ?? j.created_at));
        doneTimes.set(Number(j.user_id), list);
      }
    }
    for (const [id, list] of doneTimes) {
      const u = users.get(id)!;
      list.sort((a, b) => a - b);
      u.firstDoneAt = list[0] ?? null;
      u.thirdDoneAt = list[2] ?? null;
    }

    for (const p of payments) {
      const u = users.get(Number(p.user_id));
      if (!u) continue;
      const at = Date.parse(p.created_at);
      u.firstPaidAt = u.firstPaidAt === null ? at : Math.min(u.firstPaidAt, at);
    }

    for (const m of messages) {
      const u = users.get(Number(m.user_id));
      if (u) u.sent[m.step as StepId] = Date.parse(m.sent_at);
    }
  }

  return users;
}

/** Забирает выборку целиком: PostgREST отдаёт не больше 1000 строк за раз. */
async function pages<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw new Error(`воронка: выборка не удалась: ${error.message}`);
    all.push(...(data ?? []));
    if (!data || data.length < PAGE) return all;
  }
}
