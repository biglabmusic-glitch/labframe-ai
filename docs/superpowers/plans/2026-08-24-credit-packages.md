# Пакеты генераций вместо подписки — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить тарифы Free/Pro на единый баланс генераций (`credits`), который пополняется покупкой пакетов и не сгорает.

**Architecture:** Четыре счётчика (`usage_used`, `usage_limit`, `premium_used`, `premium_limit`) схлопываются в одно поле `users.credits`. Списание идёт SQL-триггером при переходе job в `done` (1 за обычную генерацию, 3 за декор), гейт на входе — в `create-job` по чистой функции `creditCost()`. Оплата на этом этапе не автоматизируется: кнопка «Купить» открывает чат с владельцем, счёт выставляется вручную из кабинета ЮKassa.

**Tech Stack:** Deno + Supabase Edge Functions, Postgres (миграции), React 18 + Vite + TypeScript, `@twa-dev/sdk`.

**Spec:** `docs/superpowers/specs/2026-08-24-credit-packages-design.md`

## Global Constraints

- **Пакеты:** 20 шт / 700 ₽, 50 шт / 1500 ₽ (рекомендуемый), 150 шт / 3500 ₽.
- **Стартовый баланс нового пользователя:** 5 генераций (`default` колонки `credits`).
- **Стоимость:** обычная генерация 1 кредит, генерация с декором 3 кредита.
- **Стоимость считается только на бэке.** С фронта цена не приходит никогда.
- **Баланс не сгорает и не обнуляется.** Никакого сброса по периоду.
- **Код ошибки нехватки баланса:** `insufficient_credits`, HTTP 402. Старые
  `usage_limit_reached` и `needs_subscription` удаляются полностью.
- **Ник владельца:** переменная `VITE_OWNER_TG`, значение `DanyaSanta` (без `@`).
  Если пустая — кнопки покупки скрываются.
- **Старые колонки не дропаем** в этой миграции: `usage_used`, `usage_limit`,
  `usage_period_start`, `premium_used`, `premium_limit`, enum `plan` остаются как
  страховка отката.
- **Флаг `LIMITS_DISABLED`** на бэке сохраняется и продолжает работать как рубильник.
  Одноимённый фронтовый `VITE_LIMITS_DISABLED` удаляется.

## Перед началом

Работа идёт в ветке `feat/credit-packages` (создана командой `git checkout -b feat/credit-packages`
от `main`).

Deno стоит через scoop, поэтому перед проверками:

```bash
export PATH="$HOME/scoop/shims:$PATH"
```

Про флаги Deno 2.9 — они у `test` и `check` разные, и перепутать легко:

- `deno test --allow-all …` — **без** `--allow-import`, эти флаги несовместимы
  (`--allow-all` уже включает доступ к импортам);
- `deno check --allow-import …` — **с** флагом, у `check` нет `--allow-all`.

Примеры в `CLAUDE.md` устарели: там `deno test` и `deno check` без `--allow-import`,
на Deno 2.9 второй так не работает.

Фронт проверяется через `npm run build`, а не `npm run typecheck` — последний в этом
репозитории сломан (см. `CLAUDE.md`).

---

### Task 1: Стоимость генерации — чистая функция

**Files:**
- Create: `supabase/functions/_shared/credits.ts`
- Test: `supabase/functions/_shared/credits_test.ts`

**Interfaces:**
- Consumes: ничего
- Produces: `creditCost(decorPreset: string | null | undefined): number`,
  константы `COST_NORMAL = 1`, `COST_DECOR = 3`

- [ ] **Step 1: Написать падающий тест**

Создать `supabase/functions/_shared/credits_test.ts`:

```ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { COST_DECOR, COST_NORMAL, creditCost } from './credits.ts';

Deno.test('creditCost: обычная генерация стоит 1', () => {
  assertEquals(creditCost(null), 1);
  assertEquals(creditCost(undefined), 1);
  assertEquals(creditCost(''), 1);
});

Deno.test('creditCost: генерация с декором стоит 3', () => {
  assertEquals(creditCost('snake'), 3);
  assertEquals(creditCost('amethyst'), 3);
  assertEquals(creditCost('custom'), 3);
});

Deno.test('константы совпадают с контрактом SQL-триггера spend_credits_on_done', () => {
  assertEquals(COST_NORMAL, 1);
  assertEquals(COST_DECOR, 3);
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

```bash
deno test --allow-all supabase/functions/_shared/credits_test.ts
```

Ожидается: FAIL, модуль `./credits.ts` не найден.

- [ ] **Step 3: Написать минимальную реализацию**

Создать `supabase/functions/_shared/credits.ts`:

```ts
// Стоимость генерации в кредитах.
//
// ВНИМАНИЕ: это правило продублировано в SQL — функция spend_credits_on_done
// в миграции 0016_credit_packages.sql списывает те же 1 и 3. Дублирование
// сознательное: триггер не может импортировать TypeScript, а списание должно
// быть атомарным вместе со сменой статуса job. Меняете здесь — меняйте и там,
// тест ниже фиксирует значения, чтобы расхождение всплыло сразу.
//
// Считается ТОЛЬКО на бэке: если бы цену присылал фронт, клиент объявил бы
// декор-генерацию обычной и платил втрое меньше.

export const COST_NORMAL = 1;
export const COST_DECOR = 3;

/** Сколько кредитов стоит генерация. Декор определяется по наличию пресета. */
export function creditCost(decorPreset: string | null | undefined): number {
  return decorPreset ? COST_DECOR : COST_NORMAL;
}
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

```bash
deno test --allow-all supabase/functions/_shared/credits_test.ts
```

Ожидается: PASS, 3 теста.

- [ ] **Step 5: Коммит**

```bash
git add supabase/functions/_shared/credits.ts supabase/functions/_shared/credits_test.ts && git commit -m "feat(credits): чистая функция стоимости генерации"
```

---

### Task 2: Миграция 0016 — поле credits, перенос людей, новый триггер

**Files:**
- Create: `supabase/migrations/0016_credit_packages.sql`

**Interfaces:**
- Consumes: контракт стоимости из Task 1 (1 и 3)
- Produces: колонка `public.users.credits int not null default 5`;
  триггер `trg_spend_credits_on_done` на `public.jobs`

- [ ] **Step 1: Написать миграцию**

Создать `supabase/migrations/0016_credit_packages.sql`:

```sql
-- Переход с тарифов Free/Pro на пакеты генераций.
--
-- Было: usage_limit (сколько всего можно) + usage_used (сколько потрачено),
-- баланс = разница; плюс параллельная пара premium_limit / premium_used.
-- UI при этом обещал «10 генераций в месяц», хотя ежемесячного сброса в системе
-- никогда не было: usage_used := 0 стоял только в apply_plan_limits, который
-- срабатывает при смене плана. Подписчик заплатил бы второй месяц и не получил
-- бы новых генераций.
--
-- Стало: одно поле credits — остаток генераций, который не сгорает.

-- ─── Баланс ─────────────────────────────────────────────────────────────────
alter table public.users
  add column if not exists credits int not null default 5;

-- Перенос существующих пользователей.
-- Админы работают без ограничений; тариф pro никто реально не оплачивал
-- (оплата не была подключена), поэтому им подарок, а не 9999 навсегда.
update public.users set credits = case
  when coalesce(is_admin, false) then 9999
  when plan = 'pro'              then 50
  else greatest(coalesce(usage_limit, 10) - coalesce(usage_used, 0), 5)
end;

-- ─── Списание при done ──────────────────────────────────────────────────────
-- Списываем по факту готовой работы, а не при создании job: за упавшую
-- генерацию пользователь платить не должен. Стоимость дублирует
-- _shared/credits.ts (COST_NORMAL / COST_DECOR) — менять синхронно.
create or replace function public.spend_credits_on_done()
returns trigger
language plpgsql
as $$
declare
  cost int;
begin
  if new.status = 'done' and (old.status is distinct from 'done') then
    cost := case when new.decor_preset is not null then 3 else 1 end;
    update public.users
       set credits = greatest(credits - cost, 0)
     where id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_spend_credits_on_done on public.jobs;
create trigger trg_spend_credits_on_done
  after update on public.jobs
  for each row execute function public.spend_credits_on_done();

-- ─── Снос старой механики ───────────────────────────────────────────────────
-- Триггеры снимаем до функций, иначе drop function упрётся в зависимость.
drop trigger if exists trg_bump_usage_on_done   on public.jobs;
drop trigger if exists trg_bump_premium_on_done on public.jobs;
drop function if exists public.bump_usage_on_done();
drop function if exists public.bump_premium_on_done();

-- apply_plan_limits — единственное место «сброса» и источник путаницы «в месяц».
-- Планов больше нет, обнулять нечего.
drop trigger if exists trg_apply_plan_limits on public.users;
drop function if exists public.apply_plan_limits();

-- enforce_usage_limit НЕ возвращаем: снят миграцией 0005, гейт живёт в create-job.

-- Колонки usage_used, usage_limit, usage_period_start, premium_used, premium_limit
-- и enum plan оставляем на один релиз как страховку отката. Дроп — отдельной
-- миграцией после проверки на проде.
```

- [ ] **Step 2: Проверить синтаксис SQL**

Прогнать миграцию на локальной базе:

```bash
supabase db reset --local
```

Ожидается: все миграции применяются без ошибок, включая `0016_credit_packages`.

Если локальный Supabase не поднят — применить SQL из шага 1 через SQL Editor
в дашборде на **отдельной ветке** проекта, не на проде.

- [ ] **Step 3: Проверить результат переноса**

Выполнить в SQL Editor:

```sql
select id, username, plan, is_admin, usage_used, usage_limit, credits
  from public.users
 order by credits desc
 limit 20;
```

Ожидается: у админов `credits = 9999`, у `plan = 'pro'` — `50`,
у остальных — остаток не меньше 5. Ни одного `null` и ни одного отрицательного.

- [ ] **Step 4: Проверить, что старые триггеры сняты**

```sql
select tgname from pg_trigger
 where tgrelid = 'public.jobs'::regclass and not tgisinternal;
```

Ожидается: в списке есть `trg_spend_credits_on_done` и **нет**
`trg_bump_usage_on_done`, `trg_bump_premium_on_done`.

- [ ] **Step 5: Коммит**

```bash
git add supabase/migrations/0016_credit_packages.sql && git commit -m "feat(credits): миграция 0016 — баланс вместо лимитов, перенос пользователей"
```

---

### Task 3: Бэкенд — гейт в create-job и выдача баланса в me

**Files:**
- Modify: `supabase/functions/create-job/index.ts:84-133`
- Modify: `supabase/functions/me/index.ts:81-98`

**Interfaces:**
- Consumes: `creditCost()` из Task 1, колонка `users.credits` из Task 2
- Produces: ответ `/me` содержит `credits: number`;
  `create-job` отдаёт `402 { error: 'insufficient_credits', needed, have }`

- [ ] **Step 1: Подключить creditCost в create-job**

В `supabase/functions/create-job/index.ts` добавить импорт рядом с существующими:

```ts
import { creditCost } from '../_shared/credits.ts';
```

- [ ] **Step 2: Заменить блок проверки лимитов**

Найти блок, начинающийся с комментария `// Лимиты — один выключатель на весь бэк`,
и заменить его целиком (от `const limitsDisabled` до закрывающей скобки `if`) на:

```ts
  // Лимиты — один выключатель на весь бэк: LIMITS_DISABLED != '0' (по умолчанию ВКЛ)
  // значит демо-период, всё открыто всем.
  // Включение оплаты: supabase secrets set LIMITS_DISABLED=0
  const cost = creditCost(decor ? body.decorPreset : null);
  const limitsDisabled = (Deno.env.get('LIMITS_DISABLED') ?? '1') !== '0';
  if (!limitsDisabled) {
    const { data: u } = await db
      .from('users')
      .select('credits')
      .eq('id', tg.id)
      .maybeSingle();

    // needed/have отдаём наружу: фронту нужно показать «нужно 3, у вас 1».
    if ((u?.credits ?? 0) < cost) {
      return jsonResponse(
        { error: 'insufficient_credits', needed: cost, have: u?.credits ?? 0 },
        { status: 402 },
      );
    }
  }
```

- [ ] **Step 3: Убрать мёртвую ветку обработки ошибки insert**

В том же файле найти и удалить эти три строки внутри `if (error) {`:

```ts
    if (error.message.includes('usage_limit_reached')) {
      return jsonResponse({ error: 'usage_limit_reached' }, { status: 402 });
    }
```

Триггер `enforce_usage_limit` снят ещё миграцией `0005`, эту ошибку база больше
не поднимает. Остаётся только `return jsonResponse({ error: error.message }, { status: 500 });`.

- [ ] **Step 4: Отдавать credits из me**

В `supabase/functions/me/index.ts` в объекте ответа заменить четыре строки

```ts
      plan:       user.plan ?? 'free',
      usageUsed:  user.usage_used ?? 0,
      usageLimit: user.usage_limit ?? 10,
      premiumUsed:  user.premium_used ?? 0,
      premiumLimit: user.premium_limit ?? 5,
```

на одну:

```ts
      credits:    user.credits ?? 0,
```

- [ ] **Step 5: Проверить типизацию обеих функций**

```bash
deno check --allow-import supabase/functions/create-job/index.ts supabase/functions/me/index.ts
```

Ожидается: `Check ...` без ошибок.

- [ ] **Step 6: Коммит**

```bash
git add supabase/functions/create-job/index.ts supabase/functions/me/index.ts && git commit -m "feat(credits): гейт по балансу в create-job, credits в ответе me"
```

---

### Task 4: Бэкенд — начисление в admin и referral

**Files:**
- Modify: `supabase/functions/admin/index.ts:65, 168-169, 179-180, 238-239, 251-263, 266-275`
- Modify: `supabase/functions/_shared/referral.ts:142-147`

**Interfaces:**
- Consumes: колонка `users.credits` из Task 2
- Produces: `addCredits(userId: number, by: number): Promise<void>` в `referral.ts`;
  ответ `/admin` action `users` содержит `credits: number` вместо `usageUsed`/`usageLimit`

- [ ] **Step 1: Переименовать bumpLimit в addCredits**

В `supabase/functions/_shared/referral.ts` заменить функцию:

```ts
async function addCredits(userId: number, by: number): Promise<void> {
  const { data } = await db.from('users').select('credits').eq('id', userId).maybeSingle();
  // Колонка NOT NULL с дефолтом 5, так что fallback срабатывает только если
  // юзера успели удалить между чтением и записью.
  const next = (data?.credits ?? 0) + by;
  await db.from('users').update({ credits: next }).eq('id', userId);
}
```

Заменить оба вызова `bumpLimit(` на `addCredits(` в этом же файле.

- [ ] **Step 2: Прогнать существующие тесты referral**

```bash
deno test --allow-all supabase/functions/_shared/referral_test.ts
```

Ожидается: PASS. Тесты покрывают `normalizeCode`, `parseStartParam`,
`generateRefCode` — переименование их не задевает, но падение здесь означало бы,
что сломан импорт.

- [ ] **Step 3: Перевести admin на credits**

В `supabase/functions/admin/index.ts`:

Строки 168-169 — в обеих константах колонок заменить `usage_used, usage_limit` на `credits`:

```ts
const COLS_WITH_ADMIN = 'id, username, first_name, last_name, plan, credits, banned, is_admin, last_seen_at, created_at';
const COLS_NO_ADMIN   = 'id, username, first_name, last_name, plan, credits, banned, last_seen_at, created_at';
```

Строки 179-180 — в интерфейсе строки пользователя заменить два поля на одно:

```ts
  credits: number | null;
```

Строки 238-239 — в маппере ответа заменить два поля на одно:

```ts
      credits:      u.credits ?? 0,
```

- [ ] **Step 4: Переписать выдачу бонусов**

Заменить тело `handleGrantCredits` (строки 266-275) на:

```ts
async function handleGrantCredits(body: AdminBody) {
  if (!body.userId || !body.credits || body.credits < 1) {
    return jsonResponse({ error: 'bad_input' }, { status: 400 });
  }
  // Ключевая кнопка первого этапа продаж: человек оплатил счёт ЮKassa —
  // владелец начисляет генерации отсюда.
  const { data: cur } = await db.from('users').select('credits').eq('id', body.userId).maybeSingle();
  const next = (cur?.credits ?? 0) + body.credits;
  const { error } = await db.from('users').update({ credits: next }).eq('id', body.userId);
  if (error) return jsonResponse({ error: error.message }, { status: 500 });
  return jsonResponse({ ok: true, credits: next });
}
```

- [ ] **Step 5: Удалить механику планов**

В том же файле удалить:
- строку `case 'set-plan':` из `switch` (строка 65 области),
- константу `PLAN_LIMITS` (строки 251-254),
- всю функцию `handleSetPlan` (строки 256-263).

- [ ] **Step 6: Проверить типизацию**

```bash
deno check --allow-import supabase/functions/admin/index.ts supabase/functions/apply-referral/index.ts
```

Ожидается: `Check ...` без ошибок.

- [ ] **Step 7: Коммит**

```bash
git add supabase/functions/admin/index.ts supabase/functions/_shared/referral.ts && git commit -m "feat(credits): начисление баланса в админке и рефералке, снос планов"
```

---

### Task 5: Фронт — слой данных (типы, контекст, api-клиент)

**Files:**
- Modify: `app/src/state/types.ts:6, 17-30`
- Modify: `app/src/state/AppContext.tsx:44-66, 148-165`
- Modify: `app/src/api/client.ts:87-100, 130-145, 265-280, 360-382`

**Interfaces:**
- Consumes: ответ `/me` с полем `credits` из Task 3
- Produces: `User.credits: number` в состоянии приложения; тип `Plan` удалён

- [ ] **Step 1: Обновить типы состояния**

В `app/src/state/types.ts` удалить строку `export type Plan = 'free' | 'pro';`
и заменить интерфейс `User` на:

```ts
export interface User {
  telegramId?: number;
  username?: string;
  name: string;
  initials: string;
  avatarUrl?: string;
  /** Остаток генераций. Не сгорает, пополняется покупкой пакета. */
  credits: number;
  isAdmin?: boolean;
  refCode?: string;
  referralsCount?: number;
  referralsPaid?: number;
}
```

- [ ] **Step 2: Обновить типы api-клиента**

В `app/src/api/client.ts`:

В `MeResponse` заменить пять полей (`plan`, `usageUsed`, `usageLimit`,
`premiumUsed`, `premiumLimit`) на одно:

```ts
    credits: number;
```

В `AdminUser` заменить три поля (`plan`, `usageUsed`, `usageLimit`) на одно:

```ts
  credits: number;
```

Удалить метод `adminSetPlan` целиком и убрать импорт типа `Plan`, если он
остался неиспользованным.

Изменить сигнатуру возврата `adminGrantCredits`:

```ts
  async adminGrantCredits(userId: number, credits: number): Promise<{ ok: true; credits: number }> {
    return request<{ ok: true; credits: number }>('/admin', {
      method: 'POST',
      body: JSON.stringify({ action: 'grant-credits', userId, credits }),
    });
  },
```

- [ ] **Step 3: Заменить обработку ошибок нехватки баланса**

В `app/src/api/client.ts` удалить оба блока `needs_subscription` и
`usage_limit_reached` и вставить на их место один:

```ts
  if (raw.includes('insufficient_credits')) {
    return {
      title: 'Генерации закончились',
      sub:   'Пополните баланс в разделе «Пакеты» — купленные генерации не сгорают.',
    };
  }
```

- [ ] **Step 4: Обновить AppContext**

В `app/src/state/AppContext.tsx` в `buildInitialUser()` заменить в обеих ветках
(с Telegram-юзером и гостевой) три поля

```ts
      plan: 'free',
      usage: { used: 0, limit: 10, period: 'месяц' },
      premium: { used: 0, limit: 5 },
```

на одно:

```ts
      credits: 0,
```

Начальный ноль — намеренно: реальный баланс приходит из `/me`, а показывать
до ответа сервера выдуманную пятёрку значило бы обещать генерации, которых
может не быть.

В блоке синхронизации `if (me?.user) { setUserState((p) => ({...` заменить четыре строки

```ts
            plan:       me.user!.plan,
            usage:      { used: me.user!.usageUsed, limit: me.user!.usageLimit, period: 'месяц' },
            premium:    { used: me.user!.premiumUsed ?? 0, limit: me.user!.premiumLimit ?? 5 },
```

на одну:

```ts
            credits:    me.user!.credits ?? 0,
```

- [ ] **Step 5: Проверить сборку**

```bash
cd app && npm run build
```

Ожидается: сборка **упадёт** с ошибками в `ScreenPricing`, `ScreenMyPlan`,
`UsageBar`, `ScreenIndividuality`, `ScreenAdmin`, `ScreenPlansCompare` — они ещё
читают удалённые поля. Это ожидаемо и чинится в задачах 6-8. Убедитесь, что в
списке ошибок **нет** файлов `types.ts`, `client.ts`, `AppContext.tsx`.

- [ ] **Step 6: Коммит**

```bash
git add app/src/state/types.ts app/src/state/AppContext.tsx app/src/api/client.ts && git commit -m "feat(credits): слой данных фронта на баланс"
```

---

### Task 6: Фронт — пакеты и экран покупки

**Files:**
- Rewrite: `app/src/lib/plans.ts` (полная замена содержимого)
- Rewrite: `app/src/screens/ScreenPricing.tsx` (полная замена содержимого)
- Modify: `app/.env.example`

**Interfaces:**
- Consumes: `User.credits` из Task 5
- Produces: `PACKAGES: Package[]`, `OWNER_TG: string`, `buyLink(pkg: Package): string`
  из `app/src/lib/plans.ts`

- [ ] **Step 1: Переписать plans.ts**

Заменить всё содержимое `app/src/lib/plans.ts` на:

```ts
// Единый источник правды по пакетам генераций. Используется в ScreenPricing
// и ScreenMyPlan — не дублируем цены в разных местах.
//
// Пакеты не сгорают: купленные генерации лежат на балансе, пока не потратятся.
// Обычная генерация стоит 1, генерация с декором — 3 (см. _shared/credits.ts).

export interface Package {
  id: string;
  /** Сколько генераций начисляется. */
  count: number;
  /** Цена в рублях. */
  price: number;
  /** Цена за одну генерацию — для подписи «выгоднее». */
  perUnit: number;
  recommended?: boolean;
  points: string[];
}

export const PACKAGES: Package[] = [
  {
    id: 'p20',
    count: 20,
    price: 700,
    perUnit: 35,
    points: ['20 генераций на баланс', 'Не сгорают', 'Все форматы и стили'],
  },
  {
    id: 'p50',
    count: 50,
    price: 1500,
    perUnit: 30,
    recommended: true,
    points: ['50 генераций на баланс', 'Не сгорают', 'Все форматы и стили', 'Выгоднее на 14%'],
  },
  {
    id: 'p150',
    count: 150,
    price: 3500,
    perUnit: 23,
    points: ['150 генераций на баланс', 'Не сгорают', 'Все форматы и стили', 'Лучшая цена за генерацию'],
  },
];

export const PACKAGE_BY_ID = Object.fromEntries(PACKAGES.map((p) => [p.id, p])) as Record<string, Package>;

/**
 * Ник владельца в Telegram для ручной продажи. Берётся из env, а не хардкодится:
 * контакт для продаж меняется чаще, чем код. Пустая строка = кнопки покупки скрыты.
 */
export const OWNER_TG: string = import.meta.env.VITE_OWNER_TG ?? '';

/**
 * Ссылка на чат с владельцем с префиллом текста.
 * Платёжную ссылку внутри мини-аппа не открываем сознательно: Telegram требует
 * продавать цифровые товары внутри своих приложений только за Stars. Здесь мы
 * лишь открываем переписку, счёт владелец выставляет вручную из кабинета ЮKassa.
 */
export function buyLink(pkg: Package): string {
  const text = `Хочу пакет ${pkg.count} генераций за ${pkg.price} ₽`;
  return `https://t.me/${OWNER_TG}?text=${encodeURIComponent(text)}`;
}

/** Склонение «генерация/генерации/генераций» для подписей. */
export function pluralGenerations(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'генерация';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'генерации';
  return 'генераций';
}
```

- [ ] **Step 2: Переписать ScreenPricing**

Заменить всё содержимое `app/src/screens/ScreenPricing.tsx` на:

```tsx
import { useState } from 'react';
import { Screen } from '../components/Screen';
import { ScreenIntro } from '../components/ScreenIntro';
import { IconCheck } from '../components/primitives/icons';
import { useMainButton } from '../telegram/useMainButton';
import { useBackButton } from '../telegram/useBackButton';
import { useRouter } from '../router/Router';
import { WebApp } from '../telegram/webapp';
import { OWNER_TG, PACKAGES, buyLink, pluralGenerations } from '../lib/plans';
import { useApp } from '../state/AppContext';

/**
 * Покупка пакета генераций. Оплата на этом этапе ручная: кнопка открывает чат
 * с владельцем, он выставляет счёт из кабинета ЮKassa и начисляет генерации
 * в админке. Автоматический приём платежей появится на сайте вне Telegram.
 */
export function ScreenPricing() {
  const [selected, setSelected] = useState<string>('p50');
  const { back } = useRouter();
  const { user } = useApp();
  const sel = PACKAGES.find((p) => p.id === selected)!;
  const canBuy = OWNER_TG !== '';

  useBackButton(back);
  useMainButton({
    text: canBuy ? `Купить ${sel.count} за ${sel.price.toLocaleString('ru-RU')} ₽` : 'Скоро',
    onClick: () => {
      if (!canBuy) return;
      WebApp?.openTelegramLink?.(buyLink(sel));
    },
  });

  return (
    <Screen>
      <ScreenIntro
        title="Пакеты генераций"
        sub="Платите только за обработки. Пакет не сгорает — тратьте когда удобно."
      />

      <div style={{ padding: '0 16px 14px' }}>
        <div
          className="mono"
          style={{ fontSize: 11, color: 'var(--c-on-dark-3)', letterSpacing: 0.4 }}
        >
          НА БАЛАНСЕ: {user.credits} {pluralGenerations(user.credits)}
        </div>
      </div>

      <div style={{ padding: '0 16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {PACKAGES.map((p) => {
          const isSelected = p.id === selected;
          return (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(p.id)}
              style={{
                padding: 18,
                borderRadius: 22,
                background: isSelected ? 'var(--c-accent)' : 'var(--c-card-d)',
                color: isSelected ? 'var(--c-ink)' : 'var(--c-on-dark)',
                border: isSelected ? 'none' : '1px solid var(--c-line)',
                position: 'relative',
                cursor: 'pointer',
              }}
            >
              {p.recommended && !isSelected && (
                <div
                  style={{
                    position: 'absolute',
                    top: 14,
                    right: 14,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 0.8,
                    padding: '4px 10px',
                    background: 'rgba(147,213,225,0.18)',
                    color: 'var(--c-accent)',
                    borderRadius: 999,
                  }}
                >
                  ВЫГОДНО
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
                <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.3 }}>
                  {p.count} {pluralGenerations(p.count)}
                </div>
                <div style={{ fontSize: 11, opacity: 0.55 }}>· {p.perUnit} ₽ за штуку</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 12 }}>
                <span style={{ fontSize: 32, fontWeight: 600, letterSpacing: -1.2 }}>
                  {p.price.toLocaleString('ru-RU')}
                </span>
                <span style={{ fontSize: 13, opacity: 0.55 }}>₽</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {p.points.map((pt) => (
                  <div
                    key={pt}
                    style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5 }}
                  >
                    <span style={{ marginTop: 2, opacity: 0.75 }}>
                      <IconCheck size={13} />
                    </span>
                    <span style={{ opacity: 0.85 }}>{pt}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ padding: '0 16px 24px', fontSize: 12, color: 'var(--c-on-dark-3)', lineHeight: 1.5 }}>
        {canBuy
          ? 'Нажмите кнопку внизу — откроется чат, вам выставят счёт. После оплаты генерации появятся на балансе.'
          : 'Покупка временно недоступна. Напишите нам, если нужны генерации.'}
      </div>
    </Screen>
  );
}
```

- [ ] **Step 3: Задокументировать переменную окружения**

В `app/.env.example` добавить строку:

```
# Ник владельца в Telegram (без @) — куда ведёт кнопка покупки пакета.
# Пустое значение скрывает кнопки покупки.
VITE_OWNER_TG=DanyaSanta
```

- [ ] **Step 4: Проверить сборку**

```bash
cd app && npm run build
```

Ожидается: ошибки остались только в `ScreenMyPlan`, `UsageBar`,
`ScreenIndividuality`, `ScreenAdmin`, `ScreenPlansCompare`. В `ScreenPricing` и
`plans.ts` ошибок быть не должно.

- [ ] **Step 5: Коммит**

```bash
git add app/src/lib/plans.ts app/src/screens/ScreenPricing.tsx app/.env.example && git commit -m "feat(credits): экран пакетов генераций и ручная покупка через чат"
```

---

### Task 7: Фронт — отображение баланса

**Files:**
- Rewrite: `app/src/components/UsageBar.tsx` (полная замена содержимого)
- Rewrite: `app/src/screens/ScreenMyPlan.tsx` (полная замена содержимого)

**Interfaces:**
- Consumes: `User.credits` из Task 5, `PACKAGES`/`pluralGenerations` из Task 6
- Produces: `<UsageBar credits={number} onUpgrade={() => void} onOpen?={() => void} />`

- [ ] **Step 1: Переписать UsageBar**

Заменить всё содержимое `app/src/components/UsageBar.tsx` на:

```tsx
import { pluralGenerations } from '../lib/plans';

interface Props {
  /** Остаток генераций на балансе. */
  credits: number;
  onUpgrade: () => void;
  /** Если задан — карточка становится кликабельной (открыть баланс). */
  onOpen?: () => void;
}

/**
 * Карточка баланса «осталось N генераций».
 * Полосы прогресса нет намеренно: у баланса нет верхней границы, от которой
 * можно считать процент — пакеты складываются.
 */
export function UsageBar({ credits, onUpgrade, onOpen }: Props) {
  const empty = credits <= 0;
  const low = !empty && credits <= 3;

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
          {empty ? 'Генерации закончились' : `${credits} ${pluralGenerations(credits)}`}
        </div>
        <div style={{ marginTop: 2, fontSize: 11.5, color: 'var(--c-on-dark-3)' }}>
          {empty
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
```

- [ ] **Step 2: Переписать ScreenMyPlan**

Заменить всё содержимое `app/src/screens/ScreenMyPlan.tsx` на:

```tsx
import { Screen } from '../components/Screen';
import { ScreenIntro } from '../components/ScreenIntro';
import { Card } from '../components/primitives/Card';
import { IconArrow } from '../components/primitives/icons';
import { UsageBar } from '../components/UsageBar';
import { pluralGenerations } from '../lib/plans';
import { useApp } from '../state/AppContext';
import { useBackButton } from '../telegram/useBackButton';
import { useMainButton } from '../telegram/useMainButton';
import { useRouter } from '../router/Router';

/**
 * Баланс пользователя: сколько генераций осталось, как они тратятся
 * и переход к покупке пакета.
 */
export function ScreenMyPlan() {
  const { user } = useApp();
  const { back, push } = useRouter();

  useBackButton(back);
  useMainButton({ text: 'Пополнить баланс', onClick: () => push('pricing') });

  return (
    <Screen>
      <ScreenIntro title="Мой баланс" sub="Сколько генераций осталось и как они тратятся." />

      <div style={{ padding: '0 16px 14px' }}>
        <Card
          kind="dark"
          pad={18}
          radius={24}
          style={{
            background: 'linear-gradient(135deg, rgba(147,213,225,0.18), rgba(147,213,225,0.06))',
            border: '1px solid var(--c-line)',
          }}
        >
          <div
            className="mono"
            style={{ fontSize: 10, letterSpacing: 0.8, color: 'var(--c-on-dark-3)', marginBottom: 4 }}
          >
            ОСТАТОК
          </div>
          <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: -1.4, lineHeight: 1.1 }}>
            {user.credits}
          </div>
          <div style={{ fontSize: 13, color: 'var(--c-on-dark-2)', marginTop: 4 }}>
            {pluralGenerations(user.credits)} · не сгорают
          </div>

          <div
            style={{
              marginTop: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              fontSize: 13,
              color: 'var(--c-on-dark-2)',
            }}
          >
            <div>Обычная генерация — 1 с баланса</div>
            <div>Генерация с реквизитами — 3 с баланса</div>
            <div>За неудачную обработку ничего не списывается</div>
          </div>
        </Card>
      </div>

      <div style={{ padding: '0 16px 14px' }}>
        <UsageBar credits={user.credits} onUpgrade={() => push('pricing')} />
      </div>

      <div style={{ padding: '0 16px 18px' }}>
        <Card kind="dark" pad={14} radius={20} onClick={() => push('pricing')}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Пакеты генераций</div>
              <div style={{ fontSize: 11, color: 'var(--c-on-dark-2)', marginTop: 2 }}>
                От 700 ₽ за 20 генераций — чем больше пакет, тем дешевле штука
              </div>
            </div>
            <IconArrow size={14} color="var(--c-on-dark-3)" />
          </div>
        </Card>
      </div>
    </Screen>
  );
}
```

- [ ] **Step 3: Починить вызов UsageBar на главной**

`UsageBar` вызывается ровно в двух местах: `ScreenMyPlan.tsx` (уже переписан в
шаге 2) и `ScreenHome.tsx:178`. В `app/src/screens/ScreenHome.tsx` заменить

```tsx
        <UsageBar
          used={user.usage.used}
          limit={user.usage.limit}
          plan={user.plan}
          onUpgrade={() => push('pricing')}
          onOpen={() => push('myplan')}
        />
```

на

```tsx
        <UsageBar
          credits={user.credits}
          onUpgrade={() => push('pricing')}
          onOpen={() => push('myplan')}
        />
```

Комментарий строкой выше («usage-bar — главная панель прогресса генераций»)
заменить на «баланс генераций; тап ведёт на «Мой баланс»».

Проверить, что других вызовов не появилось:

```bash
grep -rn "<UsageBar" app/src
```

Ожидается: ровно две строки — `ScreenHome.tsx` и `ScreenMyPlan.tsx`.

- [ ] **Step 4: Проверить сборку**

```bash
cd app && npm run build
```

Ожидается: ошибки остались только в `ScreenIndividuality`, `ScreenAdmin`,
`ScreenPlansCompare`.

- [ ] **Step 5: Коммит**

```bash
git add app/src/components/UsageBar.tsx app/src/screens/ScreenMyPlan.tsx app/src/screens/ScreenHome.tsx && git commit -m "feat(credits): отображение баланса вместо тарифа"
```

---

### Task 8: Фронт — декор, админка и зачистка

**Files:**
- Modify: `app/src/screens/ScreenIndividuality.tsx:23-30, 85-97`
- Modify: `app/src/screens/ScreenAdmin.tsx:218-222, 240, 299-307, 326-328`
- Delete: `app/src/screens/ScreenPlansCompare.tsx`
- Delete: `app/src/lib/feature-flags.ts`
- Modify: `app/src/router/Router.tsx:28`
- Modify: `app/src/App.tsx:23, 45`

**Interfaces:**
- Consumes: `User.credits` из Task 5, `COST_DECOR = 3` (значение зафиксировано в Task 1)
- Produces: сборка фронта проходит целиком

- [ ] **Step 1: Перевести экран «Индивидуальность» на баланс**

В `app/src/screens/ScreenIndividuality.tsx` заменить строки 23 и 25:

```tsx
  // Декор стоит 3 кредита — значение зафиксировано в _shared/credits.ts (COST_DECOR).
  const DECOR_COST = 3;
  const locked = user.credits < DECOR_COST;
```

Удалить импорт `LIMITS_DISABLED` из `../lib/feature-flags`.

Заменить подпись в строке 87 на:

```tsx
          : `Добавьте к работе декоративный элемент. Списывается ${DECOR_COST} генерации с баланса.`}
```

В строке 97 условие `selectedId === DECOR_CUSTOM_ID && !locked` не трогать —
оно продолжает работать с новым `locked`.

- [ ] **Step 2: Перевести админку на баланс**

В `app/src/screens/ScreenAdmin.tsx`:

Строку 218 (`{u.plan.toUpperCase()}`) вместе с окружающим бейджем плана удалить.

Строку 222 заменить на:

```tsx
            <span>{u.username ? `@${u.username}` : `id ${u.id}`} · {u.jobsTotal} jobs · баланс {u.credits}</span>
```

Строку 240 (`const [plan, setPlan] = useState<Plan>(user.plan);`) удалить вместе
с импортом типа `Plan`.

Строки 299-307 — удалить блок выбора плана (`Pill` со списком планов и кнопку
«Сменить план», которая звала `api.adminSetPlan`).

Строку 326 заменить, чтобы подпись отражала баланс, а не лимит:

```tsx
          label={busy === 'credits' ? '⏳ выдаём…' : `+${credits || 0} на баланс`}
```

- [ ] **Step 3: Удалить экран сравнения тарифов и фичфлаги**

```bash
rm app/src/screens/ScreenPlansCompare.tsx app/src/lib/feature-flags.ts
```

- [ ] **Step 4: Убрать ссылки на удалённое**

В `app/src/router/Router.tsx` удалить строку `| 'plans-compare'` из `RouteId`.

В `app/src/App.tsx` удалить строку импорта `ScreenPlansCompare` и строку
`'plans-compare': ScreenPlansCompare,` из карты роутов.

Проверить, что нигде не осталось упоминаний:

```bash
grep -rn "plans-compare\|ScreenPlansCompare\|feature-flags\|LIMITS_DISABLED" app/src
```

Ожидается: пустой вывод.

- [ ] **Step 5: Проверить сборку целиком**

```bash
cd app && npm run build
```

Ожидается: **сборка проходит без ошибок**. Это первый момент в плане, когда фронт
собирается — задачи 5-7 намеренно оставляли его сломанным, чтобы каждая правка
была отдельно ревьюабельной.

- [ ] **Step 6: Прогнать все тесты бэкенда**

```bash
deno test --allow-all supabase/functions/_shared/
```

Ожидается: PASS. Для тестов, которые импортируют `env.ts`, нужны заглушки:

```bash
SUPABASE_URL=http://localhost SUPABASE_ANON_KEY=x SUPABASE_SERVICE_ROLE_KEY=x REPLICATE_API_TOKEN=x POLZA_API_KEY=x BOT_TOKEN=x deno test --allow-all supabase/functions/_shared/
```

- [ ] **Step 7: Коммит**

```bash
git add -A && git commit -m "feat(credits): декор и админка на баланс, снос тарифов и фичфлагов"
```

---

## Развёртывание

После того как все восемь задач сделаны и проверены:

- [ ] **Применить миграцию на проде**

```bash
supabase db push
```

- [ ] **Задеплоить изменённые функции**

```bash
supabase functions deploy create-job --no-verify-jwt && supabase functions deploy me --no-verify-jwt && supabase functions deploy admin --no-verify-jwt && supabase functions deploy apply-referral --no-verify-jwt
```

- [ ] **Добавить переменную на Vercel**

`VITE_OWNER_TG=DanyaSanta` в Project Settings → Environment Variables, затем redeploy.

- [ ] **Включить списание баланса**

Пока `LIMITS_DISABLED=1` баланс показывается, но не гейтит — это удобно для
проверки. Когда убедитесь, что цифры сходятся:

```bash
supabase secrets set LIMITS_DISABLED=0
```

- [ ] **Проверить сквозной сценарий**

1. Открыть мини-апп, убедиться, что баланс на главной совпадает с базой.
2. Сделать обычную генерацию, дождаться `done` — баланс уменьшился на 1.
3. Сделать генерацию с декором — баланс уменьшился на 3.
4. Открыть «Пакеты», нажать «Купить» — открылся чат с `@DanyaSanta`
   с текстом «Хочу пакет 50 генераций за 1500 ₽».
5. Начислить себе 10 генераций из админки — баланс вырос на 10.
