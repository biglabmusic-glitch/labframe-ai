-- Автоворонка: бот сам пишет новичкам в зависимости от того, где они застряли.
-- Логика этапов и тексты — supabase/functions/_shared/funnel.ts,
-- рассылка — функция funnel, раз в час по расписанию ниже.

-- Воронка только для новых пользователей. Колонка добавляется со значением
-- false — его получают все, кто уже зарегистрирован, — и только потом default
-- меняется на true для тех, кто придёт после запуска.
alter table public.users
  add column if not exists funnel_enabled boolean not null default false;
alter table public.users
  alter column funnel_enabled set default true;

-- Нажал «Не присылать советы» под сообщением воронки.
alter table public.users
  add column if not exists funnel_opt_out_at timestamptz;

-- Бот не может писать человеку: заблокировали или диалог не начат.
-- Снимается, как только человек сам напишет боту или разблокирует его.
alter table public.users
  add column if not exists bot_blocked_at timestamptz;

create table if not exists public.funnel_messages (
  id bigint generated always as identity primary key,
  user_id bigint not null references public.users(id) on delete cascade,
  step text not null,
  status text not null default 'sending',   -- sending | sent | failed
  error text,
  sent_at timestamptz not null default now(),
  -- Каждый шаг человек получает не больше одного раза. Строка вставляется ДО
  -- отправки, поэтому два одновременных запуска не пришлют одно и то же дважды.
  unique (user_id, step)
);

create index if not exists funnel_messages_sent_at_idx on public.funnel_messages (sent_at);

alter table public.funnel_messages enable row level security;

-- Раз в час с 10:07 до 19:07 по Москве (в cron время UTC). Функция ещё раз
-- проверяет время сама — на случай ручного запуска.
select cron.schedule(
  'funnel-tick',
  '7 7-16 * * *',
  $$
  select net.http_post(
    url := 'https://mmegdmfmozgaycuyeacl.supabase.co/functions/v1/funnel',
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'x-internal-secret', coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'internal_secret'),
        ''
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
