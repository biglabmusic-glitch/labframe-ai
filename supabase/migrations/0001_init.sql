-- LabFrame AI — initial schema
-- Соответствует ТЗ §10 (Что хранить в базе данных) и MVP-флоу мини-аппа.

create extension if not exists "pgcrypto";

-- ─── Enums ──────────────────────────────────────────────────────────────────
do $$ begin
  create type plan as enum ('free', 'start', 'pro', 'lab');
exception when duplicate_object then null; end $$;

do $$ begin
  create type work_type as enum ('crown', 'veneer', 'bridge', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type style_id as enum ('clean', 'dark', 'soft');
exception when duplicate_object then null; end $$;

do $$ begin
  create type format_id as enum ('4x5', '1x1', '9x16');
exception when duplicate_object then null; end $$;

do $$ begin
  create type text_type as enum ('short', 'sell', 'tech', 'none');
exception when duplicate_object then null; end $$;

do $$ begin
  create type branding_kind as enum ('logo', 'name', 'none');
exception when duplicate_object then null; end $$;

do $$ begin
  create type job_status as enum (
    'created', 'photo_uploaded', 'settings_selected',
    'processing', 'done', 'failed'
  );
exception when duplicate_object then null; end $$;

-- ─── users ──────────────────────────────────────────────────────────────────
create table if not exists public.users (
  id bigint primary key,                      -- Telegram ID
  username text,
  first_name text,
  last_name text,
  photo_url text,
  language_code text default 'ru',
  plan plan not null default 'free',
  usage_used int not null default 0,
  usage_limit int not null default 3,         -- Free Test
  usage_period_start timestamptz not null default now(),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists users_plan_idx on public.users(plan);

-- ─── brand ──────────────────────────────────────────────────────────────────
create table if not exists public.brand (
  user_id bigint primary key references public.users(id) on delete cascade,
  logo_path text,                             -- путь в Storage bucket 'brand'
  logo_uploaded_at timestamptz,
  master_name text,
  lab_name text,
  default_style style_id,
  logo_placement text default 'bottom-right',
  hashtags text[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- ─── jobs ───────────────────────────────────────────────────────────────────
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id bigint not null references public.users(id) on delete cascade,
  status job_status not null default 'created',

  -- input
  photo_path text not null,                   -- путь в Storage bucket 'photos'
  work_type work_type,
  style style_id not null,
  format format_id not null,
  branding branding_kind not null default 'none',
  text_type text_type not null default 'short',

  -- output
  result_path text,                           -- путь в bucket 'results'
  result_paths jsonb,                         -- для Pro/Lab — несколько форматов
  caption_main text,
  caption_alt text,
  hashtags text[] not null default '{}',

  error_code text,
  error_message text,

  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists jobs_user_created_idx on public.jobs(user_id, created_at desc);
create index if not exists jobs_status_idx on public.jobs(status) where status in ('created', 'processing');

-- ─── ai_calls (журнал вызовов внешних AI, для биллинга/отладки) ────────────
create table if not exists public.ai_calls (
  id bigserial primary key,
  job_id uuid references public.jobs(id) on delete cascade,
  provider text not null,                     -- 'replicate' | 'polza' | ...
  model text not null,
  prompt_tokens int,
  completion_tokens int,
  duration_ms int,
  cost_usd numeric(10, 5),
  ok boolean not null,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists ai_calls_job_idx on public.ai_calls(job_id);
create index if not exists ai_calls_provider_idx on public.ai_calls(provider, created_at desc);

-- ─── Storage buckets (созданы декларативно через сидер) ────────────────────
insert into storage.buckets (id, name, public)
values
  ('photos',  'photos',  false),
  ('brand',   'brand',   false),
  ('results', 'results', true)             -- результаты публичные (для шаринга)
on conflict (id) do nothing;

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- На MVP всё дёргаем через Edge Functions с service-role-key (RLS обходится).
-- Поэтому включаем RLS и default-deny — никто, кроме Edge Functions, не пишет.
alter table public.users    enable row level security;
alter table public.brand    enable row level security;
alter table public.jobs     enable row level security;
alter table public.ai_calls enable row level security;

-- ─── Лимит usage (тригер): запрет создавать job, если usage_used >= usage_limit
create or replace function public.enforce_usage_limit()
returns trigger
language plpgsql
as $$
declare
  u public.users%rowtype;
begin
  select * into u from public.users where id = new.user_id for update;
  if u.usage_used >= u.usage_limit then
    raise exception 'usage_limit_reached'
      using errcode = 'P0001', hint = 'plan=' || u.plan::text;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_usage_limit on public.jobs;
create trigger trg_enforce_usage_limit
  before insert on public.jobs
  for each row execute function public.enforce_usage_limit();

-- Инкремент usage при done
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

-- ─── Лимиты по тарифу — при апгрейде плана выставляем новый usage_limit ────
create or replace function public.apply_plan_limits()
returns trigger
language plpgsql
as $$
begin
  if new.plan is distinct from old.plan then
    new.usage_limit := case new.plan
      when 'free'  then 3
      when 'start' then 30
      when 'pro'   then 150
      when 'lab'   then 1000
    end;
    new.usage_used := 0;
    new.usage_period_start := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_apply_plan_limits on public.users;
create trigger trg_apply_plan_limits
  before update on public.users
  for each row execute function public.apply_plan_limits();
