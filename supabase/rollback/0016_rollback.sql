-- ОТКАТ миграции 0016_credit_packages.sql
--
-- Лежит ВНЕ папки migrations/ намеренно: supabase CLI не должен применять его
-- автоматически. Запускать вручную через SQL Editor в дашборде.
--
-- Когда нужен: если после 0016 что-то пошло не так на проде. Возвращает систему
-- к тарифам Free/Pro ровно в том виде, в каком она была до миграции.
--
-- Почему откат вообще возможен: 0016 ничего не удаляет безвозвратно. Колонки
-- usage_used, usage_limit, usage_period_start, premium_used, premium_limit и enum
-- plan остались на месте и продолжали жить — 0016 их просто перестала использовать.
-- Поэтому откат сводится к тому, чтобы вернуть три триггера и снять новый.

-- ─── 1. Снять новую механику ────────────────────────────────────────────────
drop trigger  if exists trg_spend_credits_on_done on public.jobs;
drop function if exists public.spend_credits_on_done();

-- ─── 2. Вернуть счётчик обычных генераций (из 0001_init.sql) ────────────────
create or replace function public.bump_usage_on_done()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'done' and (old.status is distinct from 'done') then
    update public.users
       set usage_used = usage_used + 1
     where id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bump_usage_on_done on public.jobs;
create trigger trg_bump_usage_on_done
  after update on public.jobs
  for each row execute function public.bump_usage_on_done();

-- ─── 3. Вернуть premium-счётчик (из 0011_premium_decor.sql) ─────────────────
create or replace function public.bump_premium_on_done()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'done'
     and (old.status is distinct from 'done')
     and new.decor_preset is not null then
    update public.users
       set premium_used = premium_used + 1
     where id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bump_premium_on_done on public.jobs;
create trigger trg_bump_premium_on_done
  after update on public.jobs
  for each row execute function public.bump_premium_on_done();

-- ─── 4. Вернуть лимиты по тарифу (версия из 0012_two_plans.sql) ─────────────
create or replace function public.apply_plan_limits()
returns trigger
language plpgsql
as $$
begin
  if new.plan is distinct from old.plan then
    new.usage_limit := case new.plan
      when 'free'  then 10
      when 'start' then 10
      when 'pro'   then 9999
      when 'lab'   then 9999
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

drop trigger if exists trg_apply_plan_limits on public.users;
create trigger trg_apply_plan_limits
  before update on public.users
  for each row execute function public.apply_plan_limits();

-- ─── 5. Колонку credits НЕ дропаем ──────────────────────────────────────────
-- Она никому не мешает, а если откат окажется временным — данные не придётся
-- считать заново. Если всё же нужно убрать начисто:
--   alter table public.users drop column credits;

-- ─── После отката ───────────────────────────────────────────────────────────
-- Вернуть код: git checkout main (ветка feat/credit-packages остаётся на месте),
-- затем передеплоить create-job, me, admin, apply-referral со старого кода
-- и вернуть VITE_LIMITS_DISABLED=1 на Vercel.
