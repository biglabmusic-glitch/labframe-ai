-- Переход на два тарифа: Free и Pro (2 000 ₽/мес).
--   Free — 10 обычных генераций + 5 «с реквизитами» (про-режим) в месяц.
--   Pro  — всё без ограничений.
-- Тарифы start/lab сняты с продажи. Enum plan не трогаем (чтобы не ломать
-- существующие строки), но всех таких юзеров переводим на pro.
--
-- ВАЖНО: usage-лимит обычных генераций сейчас НЕ действует (триггер
-- enforce_usage_limit снят миграцией 0005 — демо-период). Декор-гейт в
-- create-job тоже отключён флагом LIMITS_DISABLED. Когда подключим оплату
-- («через недельку»): set LIMITS_DISABLED=0 + вернуть триггер enforce_usage_limit.

-- Новые дефолты лимитов под Free.
alter table public.users alter column usage_limit   set default 10;
alter table public.users alter column premium_limit set default 5;

-- Тариф → лимиты при смене плана.
create or replace function public.apply_plan_limits()
returns trigger
language plpgsql
as $$
begin
  if new.plan is distinct from old.plan then
    new.usage_limit := case new.plan
      when 'free'  then 10
      when 'start' then 10      -- legacy, тариф больше не предлагается
      when 'pro'   then 9999
      when 'lab'   then 9999    -- legacy
    end;
    new.premium_limit := case new.plan
      when 'free' then 5
      else 9999
    end;
    new.usage_used := 0;
    new.premium_used := 0;
    new.usage_period_start := now();
  end if;
  return new;
end;
$$;

-- Переносим существующих пользователей со снятых тарифов на Pro.
update public.users set plan = 'pro' where plan in ('start', 'lab');

-- Подтягиваем лимиты под новую модель для уже существующих пользователей.
update public.users set usage_limit   = 10 where plan = 'free' and usage_limit < 10;
update public.users set premium_limit = 5  where plan = 'free';
update public.users set usage_limit = 9999, premium_limit = 9999 where plan = 'pro';
