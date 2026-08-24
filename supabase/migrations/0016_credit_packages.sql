-- Переход с тарифов Free/Pro на пакеты генераций.
--
-- Было: usage_limit (сколько всего можно) + usage_used (сколько потрачено),
-- баланс = разница; плюс параллельная пара premium_limit / premium_used.
-- UI при этом обещал «10 генераций в месяц», хотя ежемесячного сброса в системе
-- никогда не было: usage_used := 0 стоял только в apply_plan_limits, который
-- срабатывает при смене плана, а usage_period_start писался и никем не читался.
-- Подписчик заплатил бы второй месяц и не получил бы новых генераций.
--
-- Стало: одно поле credits — остаток генераций, который не сгорает.

-- ─── Баланс ─────────────────────────────────────────────────────────────────
alter table public.users
  add column if not exists credits int not null default 5;

-- Перенос существующих пользователей.
-- Админы работают без ограничений; тариф pro никто реально не оплачивал
-- (оплата не была подключена), поэтому им подарок, а не 9999 навсегда.
-- coalesce не нужен: is_admin, plan, usage_limit и usage_used — все NOT NULL.
update public.users set credits = case
  when is_admin     then 9999
  when plan = 'pro' then 50
  else greatest(usage_limit - usage_used, 5)
end;

-- ─── Списание при done ──────────────────────────────────────────────────────
-- Списываем по факту готовой работы, а не при создании job: за упавшую
-- генерацию пользователь платить не должен. Стоимость дублирует
-- _shared/credits.ts (COST_NORMAL = 1 / COST_DECOR = 3) — менять синхронно,
-- значения там закреплены тестом credits_test.ts.
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

-- enforce_usage_limit НЕ возвращаем: его триггер снят миграцией 0005, гейт живёт
-- в create-job. Саму функцию не дропаем — она спит и не мешает.

-- Колонки usage_used, usage_limit, usage_period_start, premium_used, premium_limit
-- и enum plan оставляем на один релиз как страховку отката. Дроп — отдельной
-- миграцией после проверки на проде.
--
-- ВНИМАНИЕ той будущей миграции: перед дропом колонок снесите заодно спящую
-- функцию enforce_usage_limit — её тело читает usage_used/usage_limit. Postgres
-- не проверяет тело plpgsql при drop column, поэтому она молча доживёт до первого
-- вызова и упадёт только там.
