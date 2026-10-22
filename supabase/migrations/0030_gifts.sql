-- Подарочные пакеты генераций.
--
-- Человек оплачивает пакет не себе, а «в воздух»: получает код и ссылку,
-- которую пересылает кому угодно. Тот открывает бота по ссылке, и генерации
-- падают ему на баланс — даже если он у нас впервые. Это и есть смысл затеи:
-- подарок приводит нового человека.
--
-- Почему код, а не @username получателя: username меняется, может быть пустым
-- и его легко написать с ошибкой — деньги взяты, а подарок ушёл не туда.
-- Ссылку же можно переслать в любой чат, и адресат определяется тем, кто её
-- открыл.
--
-- Подарки бессрочные, бонуса дарителю нет — решено 22.10.2026.

create table if not exists public.gifts (
  id         uuid        primary key default gen_random_uuid(),
  -- Код из ссылки t.me/<бот>?start=gift_<код>. Видимый, поэтому без похожих символов.
  code       text        not null unique,
  -- Заказ, которым подарок оплачен. Уникален: повторное уведомление Продамуса
  -- не создаст второй подарок на те же деньги.
  order_id   text        not null unique,
  package_id text        not null,
  credits    int         not null,
  buyer_id   bigint      not null references public.users(id) on delete cascade,
  claimed_by bigint               references public.users(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists gifts_buyer_idx  on public.gifts (buyer_id, created_at desc);
create index if not exists gifts_unclaimed_idx on public.gifts (created_at desc) where claimed_by is null;

alter table public.gifts enable row level security;
grant select, insert, update, delete on public.gifts to service_role;
revoke all on public.gifts from anon, authenticated;

/*
 * Проводит оплату подарка: записывает платёж и создаёт сам подарок.
 *
 * Деньги при этом записываются на покупателя (это наша выручка), а генерации
 * никому не начисляются — они ждут в подарке. Одной транзакцией, чтобы не
 * получилось «платёж есть, подарка нет».
 *
 * false — такой платёж уже проводили (повторное уведомление Продамуса).
 */
create or replace function public.apply_gift_payment(
  p_order_id   text,
  p_buyer_id   bigint,
  p_package_id text,
  p_credits    int,
  p_amount     numeric,
  p_raw        jsonb,
  p_code       text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected int;
begin
  insert into public.payments (order_id, user_id, package_id, credits, amount_rub, raw)
       values (p_order_id, p_buyer_id, p_package_id, p_credits, p_amount, p_raw)
  on conflict (order_id) do nothing;
  get diagnostics affected = row_count;
  if affected = 0 then
    return false;
  end if;

  insert into public.gifts (code, order_id, package_id, credits, buyer_id)
       values (p_code, p_order_id, p_package_id, p_credits, p_buyer_id);
  return true;
end;
$$;

/*
 * Активация подарка. Возвращает строку, если подарок достался именно этому
 * вызову, и ничего — если кода нет или его уже активировали.
 *
 * Условие claimed_by is null в самом update — это и есть замок: двое, открывших
 * ссылку одновременно, не получат генерации дважды.
 */
create or replace function public.claim_gift(
  p_code    text,
  p_user_id bigint
) returns table (credits int, buyer_id bigint, package_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
  g record;
begin
  update public.gifts
     set claimed_by = p_user_id,
         claimed_at = now()
   where public.gifts.code = p_code
     and public.gifts.claimed_by is null
  returning public.gifts.credits, public.gifts.buyer_id, public.gifts.package_id
       into g;

  if not found then
    return;
  end if;

  update public.users
     set credits = credits + g.credits
   where id = p_user_id;

  credits    := g.credits;
  buyer_id   := g.buyer_id;
  package_id := g.package_id;
  return next;
end;
$$;

revoke execute on function public.apply_gift_payment(text, bigint, text, int, numeric, jsonb, text)
  from public, anon, authenticated;
grant  execute on function public.apply_gift_payment(text, bigint, text, int, numeric, jsonb, text)
  to service_role;

revoke execute on function public.claim_gift(text, bigint) from public, anon, authenticated;
grant  execute on function public.claim_gift(text, bigint) to service_role;
