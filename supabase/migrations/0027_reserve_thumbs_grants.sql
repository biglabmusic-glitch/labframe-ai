-- Три вещи из аудита 30 сентября 2026.

-- ─── 1. Резервирование генераций при запуске ────────────────────────────────
--
-- Раньше баланс проверялся при создании работы, а списывался только при её
-- готовности. Человек с одной генерацией мог быстро запустить две работы: обе
-- проходили проверку, а вторая списывалась в ноль (greatest(…, 0)) — то есть
-- доставалась бесплатно.
--
-- Теперь генерации списываются сразу, одним атомарным запросом, и запоминаются
-- в jobs.credits_reserved. Упала работа — возвращаем их обратно триггером.
-- Готова — оставляем списанными, повторно не трогаем.

alter table public.jobs
  add column if not exists credits_reserved int not null default 0;

create or replace function public.reserve_credits(p_user_id bigint, p_cost int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected int;
begin
  update public.users
     set credits = credits - p_cost
   where id = p_user_id
     and credits >= p_cost;
  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;

revoke execute on function public.reserve_credits(bigint, int) from public, anon, authenticated;
grant  execute on function public.reserve_credits(bigint, int) to service_role;

comment on function public.reserve_credits is
  'Атомарно списывает p_cost генераций, если их хватает. false — не хватило.';

-- Возврат при падении. BEFORE, чтобы в той же записи обнулить резерв: второй
-- переход в failed ничего не вернёт повторно.
create or replace function public.refund_credits_on_fail()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'failed'
     and old.status is distinct from 'failed'
     and old.credits_reserved > 0 then
    update public.users
       set credits = credits + old.credits_reserved
     where id = new.user_id;
    new.credits_reserved := 0;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_refund_credits_on_fail on public.jobs;
create trigger trg_refund_credits_on_fail
  before update on public.jobs
  for each row execute function public.refund_credits_on_fail();

-- Списание при готовности остаётся только для работ без резерва: запущенных
-- до этой миграции и в демо-режиме (LIMITS_DISABLED=1). Работа, которую сторож
-- успел пометить упавшей, получила резерв назад — и если она всё же доделается,
-- спишется здесь, как и положено.
create or replace function public.spend_credits_on_done()
returns trigger
language plpgsql
as $$
declare
  cost int;
begin
  if new.status = 'done'
     and old.status is distinct from 'done'
     and coalesce(old.credits_reserved, 0) = 0 then
    cost := case when new.decor_preset is not null then 3 else 1 end;
    update public.users
       set credits = greatest(credits - cost, 0)
     where id = new.user_id;
  end if;
  return new;
end;
$$;

-- ─── 2. Миниатюры для истории ───────────────────────────────────────────────
--
-- На главном экране в квадратик истории грузилась полная картинка ~350 КБ.
-- 24 работы — 8 МБ при каждом открытии приложения, отсюда трафик Supabase.
-- Уменьшенная копия ~30 КБ кладётся рядом с результатом.

alter table public.jobs
  add column if not exists thumb_path text;

create index if not exists jobs_thumb_backfill_idx
  on public.jobs (created_at desc)
  where status = 'done' and result_path is not null and thumb_path is null;

-- ─── 3. Журнал ручных начислений ────────────────────────────────────────────
--
-- Начисления из админки нигде не записывались. При аудите у троих нашёлся
-- баланс без покупок — оказалось, призы конкурса, но отличить их от взлома
-- было нечем.

create table if not exists public.credit_grants (
  id         bigint generated always as identity primary key,
  user_id    bigint      not null references public.users(id) on delete cascade,
  admin_id   bigint      not null,
  delta      int         not null,
  reason     text,
  created_at timestamptz not null default now()
);

create index if not exists credit_grants_user_idx
  on public.credit_grants (user_id, created_at desc);

alter table public.credit_grants enable row level security;
