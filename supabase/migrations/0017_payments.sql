-- Платежи: журнал + идемпотентное начисление баланса.
--
-- Продамус повторяет уведомление, пока не получит 200 — при таймауте или деплое
-- функции это штатная ситуация. Без защиты повтор начислил бы пакет второй раз,
-- поэтому order_id уникален, а начисление и запись платежа идут одной транзакцией.

create table if not exists public.payments (
  id          uuid primary key default gen_random_uuid(),
  -- Ключ идемпотентности. Формат: lf-<tgId>-<packageId>-<nonce>, см. _shared/packages.ts.
  order_id    text        not null unique,
  user_id     bigint      not null references public.users(id) on delete cascade,
  package_id  text        not null,
  credits     int         not null,
  amount_rub  numeric(10,2) not null,
  -- Всё уведомление целиком: если разберём спор с покупателем, пригодится оригинал.
  raw         jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists payments_user_id_idx    on public.payments (user_id);
create index if not exists payments_created_at_idx on public.payments (created_at desc);

-- RLS: таблицу читает только service_role (Edge Functions). Политик не заводим —
-- при включённом RLS без политик обычные роли не видят ничего, а service_role
-- проходит мимо RLS. Это ровно то, что нужно: платежи наружу не отдаём.
alter table public.payments enable row level security;

-- ─── Идемпотентное начисление ───────────────────────────────────────────────
-- Возвращает true, если платёж записан и баланс начислен;
-- false — если такой order_id уже был (повторное уведомление).
create or replace function public.apply_payment(
  p_order_id   text,
  p_user_id    bigint,
  p_package_id text,
  p_credits    int,
  p_amount     numeric,
  p_raw        jsonb
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  -- get diagnostics отдаёт ЦЕЛОЕ число строк, не булево.
  affected int;
begin
  insert into public.payments (order_id, user_id, package_id, credits, amount_rub, raw)
       values (p_order_id, p_user_id, p_package_id, p_credits, p_amount, p_raw)
  on conflict (order_id) do nothing;

  get diagnostics affected = row_count;

  -- 0 строк значит сработал on conflict: этот платёж уже проводили.
  if affected = 0 then
    return false;
  end if;

  update public.users
     set credits = credits + p_credits
   where id = p_user_id;

  return true;
end;
$$;

comment on function public.apply_payment is
  'Начисляет пакет генераций ровно один раз на order_id. Вызывается из payment-webhook.';
