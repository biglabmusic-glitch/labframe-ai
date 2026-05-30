# Реферальная программа «Приведи друга» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать юзерам приглашать друзей по реф-ссылке и промокоду; за первую оплату друга обе стороны получают бонусные генерации.

**Architecture:** Привязки «кто кого привёл» копятся с первого дня в таблице `referrals` + полях `users`. Начисление награды — отдельный атомарный хелпер `grantReferralReward()`, который сейчас дёргается временным админ-экшеном `mark-paid`, а в будущем — платёжным вебхуком. Все проверки анти-абьюза — на бэке (Deno Edge Functions, service-role). Фронт (React + Vite) получает код и статистику из `/me`, шлёт привязку в `/apply-referral`.

**Tech Stack:** Supabase (Postgres + Deno Edge Functions), supabase-js v2, React 18 + Vite + TypeScript, @twa-dev/sdk.

**Спек:** `docs/superpowers/specs/2026-05-30-referral-program-design.md`

## Замечания по тестированию

В проекте **нет тестового фреймворка** (ни vitest на фронте, ни deno-тестов). Чтобы не тащить новую инфраструктуру, которую никто не просил:
- **Чистая backend-логика** (нормализация кода, парсинг `start_param`) выносится в отдельные модули и покрывается встроенным `deno test` — нулевая установка.
- **Edge-функции целиком, миграции, фронт** верифицируются через `deno check`, применение миграции на staging, `npm run typecheck` и ручной смоук в Telegram. У шагов это явно прописано.
- Для запуска `deno`/`supabase` нужен PATH из CLAUDE.md:
  ```powershell
  $env:PATH = "$env:USERPROFILE\scoop\shims;$env:PATH"
  $env:SUPABASE_ACCESS_TOKEN = '<sbp_... спросить у юзера>'
  ```

## Структура файлов

**Создаются:**
- `supabase/migrations/0010_referrals.sql` — схема: поля в `users` + таблица `referrals` + гранты.
- `supabase/functions/_shared/referral.ts` — чистые хелперы (нормализация кода, парс start_param, генерация кода) + `grantReferralReward()` и `applyReferral()`.
- `supabase/functions/_shared/referral_test.ts` — deno-тесты чистых хелперов.
- `supabase/functions/apply-referral/index.ts` — эндпоинт привязки.
- `app/src/screens/ScreenInvite.tsx` — экран «Пригласи друга».

**Изменяются:**
- `supabase/functions/me/index.ts` — генерация `ref_code` + отдача статистики.
- `supabase/functions/admin/index.ts` — временный action `mark-paid`.
- `app/src/telegram/webapp.ts` — чтение `start_param`.
- `app/src/api/client.ts` — типы + методы `applyReferral`, `adminMarkPaid`, расширение `MeResponse`.
- `app/src/state/types.ts` — поля реферальной статистики в `User`.
- `app/src/state/AppContext.tsx` — проброс статистики из `/me` + тихая привязка по `start_param`.
- `app/src/router/Router.tsx` — route `invite`.
- `app/src/App.tsx` — регистрация `ScreenInvite`.
- `app/src/screens/ScreenHome.tsx` — кнопка «Пригласить друга».

---

## Task 1: Миграция БД — схема рефералов

**Files:**
- Create: `supabase/migrations/0010_referrals.sql`

- [ ] **Step 1: Написать миграцию**

Создать `supabase/migrations/0010_referrals.sql`:

```sql
-- Реферальная программа «Приведи друга».
-- Привязки копятся с первого дня; награда начисляется при первой оплате друга.

-- ─── Поля в users ───────────────────────────────────────────────────────────
alter table public.users
  add column if not exists ref_code text unique,
  add column if not exists referred_by bigint references public.users(id),
  add column if not exists referral_rewarded boolean not null default false;

-- ─── Журнал привязок ──────────────────────────────────────────────────────────
create table if not exists public.referrals (
  id bigserial primary key,
  referrer_id bigint not null references public.users(id) on delete cascade,
  referee_id  bigint not null unique references public.users(id) on delete cascade,
  status text not null default 'joined',          -- 'joined' | 'paid'
  created_at timestamptz not null default now(),
  rewarded_at timestamptz,
  constraint referrals_no_self check (referrer_id <> referee_id)
);

create index if not exists idx_referrals_referrer on public.referrals(referrer_id);
create index if not exists idx_referrals_status    on public.referrals(status);

-- RLS остаётся default-deny: пишем только через service-role в Edge Functions.
alter table public.referrals enable row level security;

-- Гранты для service_role (как в 0004_grants.sql).
grant select, insert, update, delete on public.referrals to service_role;
grant usage, select on all sequences in schema public to service_role;
```

- [ ] **Step 2: Применить миграцию на проект**

Run:
```powershell
$env:PATH = "$env:USERPROFILE\scoop\shims;$env:PATH"
$env:SUPABASE_ACCESS_TOKEN = '<sbp_...>'
supabase db push
```
Expected: миграция `0010_referrals.sql` применяется без ошибок (`Applying migration 0010_referrals.sql...`).

- [ ] **Step 3: Проверить схему**

Run (Supabase SQL editor или `supabase db remote`):
```sql
select column_name from information_schema.columns
 where table_name = 'users' and column_name in ('ref_code','referred_by','referral_rewarded');
select tablename from pg_tables where tablename = 'referrals';
```
Expected: 3 колонки в users + таблица `referrals` существует.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0010_referrals.sql
git commit -m "feat(referral): миграция схемы (users-поля + таблица referrals)"
```

---

## Task 2: Чистые хелперы рефералов + deno-тесты

Изолируем логику без БД, чтобы покрыть тестами: нормализация кода, парсинг `start_param`, генерация кода.

**Files:**
- Create: `supabase/functions/_shared/referral.ts`
- Test: `supabase/functions/_shared/referral_test.ts`

- [ ] **Step 1: Написать падающие тесты**

Создать `supabase/functions/_shared/referral_test.ts`:

```ts
import { assertEquals, assertMatch } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { normalizeCode, parseStartParam, generateRefCode } from './referral.ts';

Deno.test('normalizeCode: upper-case + trim + срез мусора', () => {
  assertEquals(normalizeCode('  zub-ab12 '), 'ZUB-AB12');
  assertEquals(normalizeCode('zub ab12'), 'ZUBAB12');     // пробел внутри убираем
  assertEquals(normalizeCode('zub-ab12!@#'), 'ZUB-AB12'); // спецсимволы убираем
  assertEquals(normalizeCode(''), '');
});

Deno.test('parseStartParam: достаёт код из ref_-префикса', () => {
  assertEquals(parseStartParam('ref_ZUB-AB12'), 'ZUB-AB12');
  assertEquals(parseStartParam('ref_zub-ab12'), 'ZUB-AB12'); // нормализуем
  assertEquals(parseStartParam('ZUB-AB12'), '');             // без префикса — не реф
  assertEquals(parseStartParam(''), '');
  assertEquals(parseStartParam(undefined), '');
});

Deno.test('generateRefCode: формат ZUB-XXXX, 4 символа из безопасного алфавита', () => {
  const code = generateRefCode();
  assertMatch(code, /^ZUB-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
});
```

- [ ] **Step 2: Запустить тесты — убедиться, что падают**

Run:
```powershell
$env:PATH = "$env:USERPROFILE\scoop\shims;$env:PATH"
deno test supabase/functions/_shared/referral_test.ts
```
Expected: FAIL — `Module not found "./referral.ts"` или `normalizeCode is not exported`.

- [ ] **Step 3: Реализовать чистые хелперы**

Создать `supabase/functions/_shared/referral.ts`:

```ts
// Реферальные хелперы. Чистые функции (без БД) тестируются в referral_test.ts.
import { db } from './db.ts';

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
```

- [ ] **Step 4: Запустить тесты — убедиться, что проходят**

Run:
```powershell
deno test supabase/functions/_shared/referral_test.ts
```
Expected: PASS (3 теста ok). `ensureRefCode` тестами не покрыта (требует БД) — это ок.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/referral.ts supabase/functions/_shared/referral_test.ts
git commit -m "feat(referral): чистые хелперы (normalize/parse/generate/ensureRefCode) + deno-тесты"
```

---

## Task 3: Логика привязки и начисления (applyReferral + grantReferralReward)

Добавляем в `referral.ts` функции, работающие с БД. Тестов нет (требуют живую БД) — верифицируем `deno check` и позже ручным смоуком.

**Files:**
- Modify: `supabase/functions/_shared/referral.ts`

- [ ] **Step 1: Добавить env-хелпер и applyReferral**

Дописать в конец `supabase/functions/_shared/referral.ts`:

```ts
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

  // Окно «новизны»: привязка только новому юзеру.
  const windowMin = envInt('REFERRAL_NEW_USER_WINDOW_MIN', 60);
  const ageMs = Date.now() - new Date(me.created_at).getTime();
  if (ageMs > windowMin * 60_000) return { ok: false, reason: 'too_old' };

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
```

- [ ] **Step 2: Добавить grantReferralReward**

Дописать в конец `supabase/functions/_shared/referral.ts`:

```ts
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

  await bumpLimit(updated.referrer_id, referrerBonus);
  await bumpLimit(refereeId, refereeBonus);
  await db.from('users').update({ referral_rewarded: true }).eq('id', refereeId);

  return {
    ok: true,
    referrerId: updated.referrer_id,
    referrerBonus,
    refereeBonus,
  };
}

async function bumpLimit(userId: number, by: number): Promise<void> {
  const { data } = await db.from('users').select('usage_limit').eq('id', userId).maybeSingle();
  const next = (data?.usage_limit ?? 3) + by;
  await db.from('users').update({ usage_limit: next }).eq('id', userId);
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
```

- [ ] **Step 3: Проверить, что модуль компилируется**

Run:
```powershell
$env:PATH = "$env:USERPROFILE\scoop\shims;$env:PATH"
deno check supabase/functions/_shared/referral.ts
```
Expected: без ошибок типов.

- [ ] **Step 4: Перезапустить deno-тесты (регресс чистых хелперов)**

Run: `deno test supabase/functions/_shared/referral_test.ts`
Expected: PASS (3 теста) — добавление БД-функций не сломало чистые.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/referral.ts
git commit -m "feat(referral): applyReferral + grantReferralReward + referralStats (анти-абьюз на бэке)"
```

---

## Task 4: Эндпоинт /apply-referral

**Files:**
- Create: `supabase/functions/apply-referral/index.ts`

- [ ] **Step 1: Написать функцию**

Создать `supabase/functions/apply-referral/index.ts`:

```ts
// POST /apply-referral
// Body: { code?: string, startParam?: string }
// Ставит привязку текущего юзера к пригласившему. Все анти-абьюз правила в applyReferral().
import { authorize, corsPreflight, jsonResponse } from '../_shared/auth.ts';
import { applyReferral, parseStartParam, normalizeCode } from '../_shared/referral.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight();
  if (req.method !== 'POST') return jsonResponse({ error: 'method' }, { status: 405 });

  const auth = await authorize(req);
  if ('response' in auth) return auth.response;
  const tg = auth.user;

  let body: { code?: string; startParam?: string };
  try { body = await req.json(); }
  catch { return jsonResponse({ error: 'bad_json' }, { status: 400 }); }

  // Код берём из ручного ввода (code) или из start_param ('ref_<CODE>').
  const code = body.code ? normalizeCode(body.code) : parseStartParam(body.startParam);

  const result = await applyReferral(tg.id, code);
  return jsonResponse(result);
});
```

- [ ] **Step 2: Проверить компиляцию**

Run:
```powershell
$env:PATH = "$env:USERPROFILE\scoop\shims;$env:PATH"
deno check supabase/functions/apply-referral/index.ts
```
Expected: без ошибок.

- [ ] **Step 3: Задеплоить функцию**

Run:
```powershell
supabase functions deploy apply-referral --no-verify-jwt
```
Expected: `Deployed Function apply-referral`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/apply-referral/index.ts
git commit -m "feat(referral): эндпоинт /apply-referral"
```

---

## Task 5: /me — генерация кода и статистика

**Files:**
- Modify: `supabase/functions/me/index.ts`

- [ ] **Step 1: Подключить хелперы**

В `supabase/functions/me/index.ts` после строки `import { signUrl } from '../_shared/storage.ts';` добавить:

```ts
import { ensureRefCode, referralStats } from '../_shared/referral.ts';
```

- [ ] **Step 2: Сгенерировать код и собрать статистику**

В `supabase/functions/me/index.ts` найти блок (после загрузки `user` и `brand`, перед `const isAdmin = ...`):

```ts
  const { data: user } = await db.from('users').select('*').eq('id', tg.id).single();
  const { data: brand } = await db.from('brand').select('*').eq('user_id', tg.id).maybeSingle();
```

Сразу после него добавить:

```ts
  // Реф-код (генерим при первом заходе) + статистика приглашений.
  let refCode = user?.ref_code as string | undefined;
  try {
    if (!refCode) refCode = await ensureRefCode(tg.id);
  } catch { /* не валим /me из-за реф-кода */ }
  let refStats = { referralsCount: 0, referralsPaid: 0 };
  try { refStats = await referralStats(tg.id); } catch { /* таблицы может не быть до миграции */ }
```

- [ ] **Step 3: Вернуть поля в ответе**

В `supabase/functions/me/index.ts` в объекте `user: user ? { ... }` добавить после `isAdmin,`:

```ts
      refCode:        refCode ?? null,
      referralsCount: refStats.referralsCount,
      referralsPaid:  refStats.referralsPaid,
```

- [ ] **Step 4: Проверить компиляцию + задеплоить**

Run:
```powershell
$env:PATH = "$env:USERPROFILE\scoop\shims;$env:PATH"
deno check supabase/functions/me/index.ts
supabase functions deploy me --no-verify-jwt
```
Expected: компилируется, деплоится.

- [ ] **Step 5: Смоук — /me возвращает refCode**

Открыть Mini App в Telegram, в DevTools/Network найти ответ `/me`.
Expected: в `user` есть непустой `refCode` (формат `ZUB-XXXX`), `referralsCount: 0`, `referralsPaid: 0`.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/me/index.ts
git commit -m "feat(referral): /me генерит ref_code и отдаёт статистику приглашений"
```

---

## Task 6: Админ-экшн mark-paid (временный триггер начисления)

**Files:**
- Modify: `supabase/functions/admin/index.ts`

- [ ] **Step 1: Подключить хелпер начисления**

В `supabase/functions/admin/index.ts` после `import { sendMessage } from '../_shared/telegram.ts';` добавить:

```ts
import { grantReferralReward } from '../_shared/referral.ts';
```

- [ ] **Step 2: Добавить action в тип и роутер**

В `interface AdminBody` в union `action` добавить `| 'mark-paid'`.

В `switch (body.action)` перед `default:` добавить:

```ts
    case 'mark-paid':     return handleMarkPaid(body);
```

- [ ] **Step 3: Реализовать обработчик**

В `supabase/functions/admin/index.ts` в конец файла добавить:

```ts
// ВРЕМЕННО: имитация первой оплаты друга для теста реферального начисления.
// Когда подключим платёжный вебхук — он вызовет grantReferralReward напрямую,
// а этот экшн можно удалить.
async function handleMarkPaid(body: AdminBody) {
  if (!body.userId) return jsonResponse({ error: 'bad_input' }, { status: 400 });
  const result = await grantReferralReward(body.userId);
  return jsonResponse(result);
}
```

- [ ] **Step 4: Проверить компиляцию + задеплоить**

Run:
```powershell
$env:PATH = "$env:USERPROFILE\scoop\shims;$env:PATH"
deno check supabase/functions/admin/index.ts
supabase functions deploy admin --no-verify-jwt
```
Expected: компилируется, деплоится.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/admin/index.ts
git commit -m "feat(referral): временный админ-экшн mark-paid для теста начисления"
```

---

## Task 7: Фронт — чтение start_param + API-методы и типы

**Files:**
- Modify: `app/src/telegram/webapp.ts`
- Modify: `app/src/api/client.ts`
- Modify: `app/src/state/types.ts`

- [ ] **Step 1: Экспортировать start_param из webapp.ts**

В `app/src/telegram/webapp.ts` перед строкой `export { WebApp };` добавить:

```ts
/** start_param из реф-ссылки (t.me/<bot>/app?startapp=ref_<CODE>). '' если нет. */
export function getStartParam(): string {
  try {
    return WebApp?.initDataUnsafe?.start_param ?? '';
  } catch {
    return '';
  }
}
```

- [ ] **Step 2: Расширить MeResponse в client.ts**

В `app/src/api/client.ts` в `interface MeResponse` внутри `user: { ... }` добавить после `isAdmin?: boolean;`:

```ts
    refCode?: string | null;
    referralsCount?: number;
    referralsPaid?: number;
```

- [ ] **Step 3: Добавить методы applyReferral и adminMarkPaid**

В `app/src/api/client.ts` в объект `api`, после метода `adminSetAdmin`, добавить:

```ts
  async applyReferral(input: { code?: string; startParam?: string }): Promise<{ ok: boolean; already?: boolean; reason?: string }> {
    if (!API_BASE) return { ok: false, reason: 'mock' };
    return request<{ ok: boolean; already?: boolean; reason?: string }>('/apply-referral', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  async adminMarkPaid(userId: number): Promise<{ ok: boolean; reason?: string }> {
    return request<{ ok: boolean; reason?: string }>('/admin', {
      method: 'POST',
      body: JSON.stringify({ action: 'mark-paid', userId }),
    });
  },
```

- [ ] **Step 4: Добавить реф-поля в тип User**

В `app/src/state/types.ts` в `interface User` после `isAdmin?: boolean;` добавить:

```ts
  refCode?: string;
  referralsCount?: number;
  referralsPaid?: number;
```

- [ ] **Step 5: Проверить типы**

Run:
```powershell
cd app; npm run typecheck
```
Expected: без ошибок TS.

- [ ] **Step 6: Commit**

```bash
git add app/src/telegram/webapp.ts app/src/api/client.ts app/src/state/types.ts
git commit -m "feat(referral): фронт — start_param, applyReferral/adminMarkPaid, типы"
```

---

## Task 8: Проброс статистики из /me + тихая привязка по start_param

**Files:**
- Modify: `app/src/state/AppContext.tsx`

- [ ] **Step 1: Импортировать getStartParam**

В `app/src/state/AppContext.tsx` найти строку импорта webapp:

```ts
import { WebApp } from '../telegram/webapp';
```

Заменить на:

```ts
import { WebApp, getStartParam } from '../telegram/webapp';
```

- [ ] **Step 2: Прокинуть реф-поля в setUserState**

В `app/src/state/AppContext.tsx` в блоке синхронизации, где `setUserState((p) => ({ ... isAdmin: me.user!.isAdmin ?? false, }))`, добавить после строки `isAdmin:    me.user!.isAdmin ?? false,`:

```ts
            refCode:        me.user!.refCode ?? p.refCode,
            referralsCount: me.user!.referralsCount ?? 0,
            referralsPaid:  me.user!.referralsPaid ?? 0,
```

- [ ] **Step 3: Тихая привязка по start_param**

В `app/src/state/AppContext.tsx` внутри того же async-блока синхронизации, сразу после `const [me, jobs] = await Promise.all([api.me(), api.listJobs(24)]);` и проверки `if (cancelled) return;`, добавить:

```ts
        // Если зашли по реф-ссылке (start_param='ref_<CODE>') — тихо привязываемся.
        // Бэк сам отсечёт «не новый юзер»/самоприглашение. Награда — позже, при оплате.
        const sp = getStartParam();
        if (sp.startsWith('ref_')) {
          api.applyReferral({ startParam: sp }).catch(() => { /* молча */ });
        }
```

- [ ] **Step 4: Проверить типы**

Run:
```powershell
cd app; npm run typecheck
```
Expected: без ошибок.

- [ ] **Step 5: Commit**

```bash
git add app/src/state/AppContext.tsx
git commit -m "feat(referral): проброс статистики из /me + тихая привязка по start_param"
```

---

## Task 9: Экран ScreenInvite + роут + кнопка на Home

**Files:**
- Create: `app/src/screens/ScreenInvite.tsx`
- Modify: `app/src/router/Router.tsx`
- Modify: `app/src/App.tsx`
- Modify: `app/src/screens/ScreenHome.tsx`

- [ ] **Step 1: Создать экран**

Создать `app/src/screens/ScreenInvite.tsx`:

```tsx
import { useState } from 'react';
import { Screen } from '../components/Screen';
import { useApp } from '../state/AppContext';
import { api } from '../api/client';
import { WebApp } from '../telegram/webapp';

const BOT_APP_URL = 'https://t.me/labframe_ai_bot/app';

export function ScreenInvite() {
  const { user } = useApp();
  const code = user.refCode ?? '';
  const link = code ? `${BOT_APP_URL}?startapp=ref_${code}` : '';

  const [manual, setManual] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMsg(`${label} скопирован`);
    } catch {
      setMsg('Не удалось скопировать');
    }
  };

  const share = () => {
    if (!link) return;
    const text = 'Делаю посты для зубных работ через ИИ — попробуй, дам бонусные генерации 👇';
    const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
    WebApp?.openTelegramLink?.(url);
  };

  const applyManual = async () => {
    const res = await api.applyReferral({ code: manual });
    if (res.ok && res.already) setMsg('Промокод уже применён');
    else if (res.ok) setMsg('Промокод применён! Бонус — после первой оплаты');
    else setMsg(reasonText(res.reason));
  };

  return (
    <Screen title="Пригласи друга">
      <p style={{ color: 'var(--c-text-dim)', fontSize: 14, lineHeight: 1.5 }}>
        Друг оплачивает план — ты получаешь бонусные генерации, и друг тоже.
        Приглашения копятся уже сейчас.
      </p>

      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 12, color: 'var(--c-text-dim)', marginBottom: 6 }}>Твоя ссылка</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input readOnly value={link} style={inputStyle} />
          <button onClick={() => copy(link, 'Ссылка')} style={btnStyle}>Копировать</button>
        </div>
        <button onClick={share} style={{ ...btnStyle, width: '100%', marginTop: 10 }}>
          Поделиться в Telegram
        </button>
      </div>

      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 12, color: 'var(--c-text-dim)', marginBottom: 6 }}>Твой промокод</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 1 }}>{code || '—'}</div>
          {code && <button onClick={() => copy(code, 'Код')} style={btnStyle}>Копировать</button>}
        </div>
      </div>

      <div style={{ marginTop: 24, display: 'flex', gap: 16 }}>
        <Stat label="Приглашено" value={user.referralsCount ?? 0} />
        <Stat label="Оплатили" value={user.referralsPaid ?? 0} />
      </div>

      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 12, color: 'var(--c-text-dim)', marginBottom: 6 }}>Есть промокод друга?</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="ZUB-XXXX"
            style={inputStyle}
          />
          <button onClick={applyManual} style={btnStyle} disabled={!manual.trim()}>Применить</button>
        </div>
      </div>

      {msg && <div style={{ marginTop: 16, fontSize: 13, color: 'var(--c-accent)' }}>{msg}</div>}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ flex: 1, background: 'var(--c-card)', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--c-text-dim)' }}>{label}</div>
    </div>
  );
}

function reasonText(reason?: string): string {
  switch (reason) {
    case 'self':     return 'Нельзя применить собственный код';
    case 'bad_code': return 'Код не найден';
    case 'too_old':  return 'Промокод доступен только новым пользователям';
    case 'empty_code': return 'Введите код';
    default:         return 'Не удалось применить код';
  }
}

const inputStyle: React.CSSProperties = {
  flex: 1, padding: '10px 12px', borderRadius: 10,
  border: '1px solid var(--c-border)', background: 'var(--c-card)',
  color: 'var(--c-text)', fontSize: 13,
};
const btnStyle: React.CSSProperties = {
  padding: '10px 14px', borderRadius: 10, border: 'none',
  background: 'var(--c-accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
```

> NOTE для исполнителя: проверь фактический API `Screen`-компонента в `app/src/components/Screen.tsx` и CSS-переменные в `app/src/styles/tokens.css`. Если `Screen` не принимает `title` или нет переменной `--c-accent`/`--c-card`/`--c-border`/`--c-text-dim` — подставь существующие аналоги из соседних экранов (напр. `ScreenMyPlan.tsx`). Разметка важнее точных токенов.

- [ ] **Step 2: Зарегистрировать route**

В `app/src/router/Router.tsx` в `export type RouteId` добавить `| 'invite'` (рядом с `| 'admin'`).

- [ ] **Step 3: Зарегистрировать экран**

В `app/src/App.tsx`:
- В импортах добавить: `import { ScreenInvite } from './screens/ScreenInvite';`
- В `REGISTRY` добавить строку: `invite:          ScreenInvite,`

- [ ] **Step 4: Кнопка на Home**

В `app/src/screens/ScreenHome.tsx` найти, как открываются другие экраны (`push('...')` / `useRouter`). Добавить кликабельный пункт «Пригласить друга» рядом с существующими действиями:

```tsx
        <button onClick={() => push('invite')} style={{ /* стиль как у соседних пунктов */ }}>
          Пригласить друга
        </button>
```

> NOTE для исполнителя: используй тот же компонент/стиль, что у соседних навигационных пунктов на Home (не выдумывай новый вид). Найди существующий `push(` в файле и повтори паттерн.

- [ ] **Step 5: Проверить типы и сборку**

Run:
```powershell
cd app; npm run typecheck; npm run build
```
Expected: typecheck и build проходят без ошибок.

- [ ] **Step 6: Commit**

```bash
git add app/src/screens/ScreenInvite.tsx app/src/router/Router.tsx app/src/App.tsx app/src/screens/ScreenHome.tsx
git commit -m "feat(referral): экран «Пригласи друга» + роут + кнопка на Home"
```

---

## Task 10: End-to-end проверка и пуш

**Files:** нет (только проверка и деплой фронта)

- [ ] **Step 1: Полный смоук-сценарий в Telegram**

1. Юзер A открывает Mini App → экран «Пригласи друга» → видит код `ZUB-XXXX` и ссылку.
2. Юзер B (другой Telegram-аккаунт, новый) открывает ссылку A `?startapp=ref_<код A>`.
3. В Network у B виден вызов `/apply-referral` → `{ ok: true }`.
4. У A на экране «Приглашено» стало `1`, «Оплатили» `0`.

Expected: все 4 пункта выполняются.

- [ ] **Step 2: Проверить начисление через mark-paid**

Админ вызывает (через админку или curl) `mark-paid` для userId = B:
```
POST /admin { "action": "mark-paid", "userId": <B> }
```
Expected: ответ `{ ok: true, referrerId: <A>, referrerBonus: 10, refereeBonus: 5 }`.
Повторный вызов: `{ ok: false, reason: "nothing_to_reward" }` (идемпотентность).
В БД: `usage_limit` A вырос на 10, B на 5; `referrals.status='paid'`; `users.referral_rewarded=true` у B.

- [ ] **Step 3: Проверить анти-абьюз**

- A пытается применить свой код руками → `{ ok:false, reason:'self' }`.
- Старый юзер (created_at > 60 мин) применяет код → `{ ok:false, reason:'too_old' }`.
- B повторно открывает чужую ссылку → `{ ok:true, already:true }`, привязка не меняется.

Expected: все отказы корректны.

- [ ] **Step 4: Запушить фронт (Vercel auto-deploy)**

```bash
git push
```
Expected: Vercel собирает и деплоит; функции уже задеплоены в предыдущих тасках.

- [ ] **Step 5: Финальный коммит-метка (если остались несакоммиченные мелочи)**

```bash
git status   # должно быть чисто
```

---

## Env-переменные для установки (Supabase Functions Secrets)

После выката задать (значения — дефолтные, можно менять):
```powershell
supabase secrets set REFERRER_BONUS=10 REFEREE_BONUS=5 REFERRAL_NEW_USER_WINDOW_MIN=60
```
Без них код берёт те же дефолты из `envInt(...)` — установка опциональна, нужна только для изменения значений.
