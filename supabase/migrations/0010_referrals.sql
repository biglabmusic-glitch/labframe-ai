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
