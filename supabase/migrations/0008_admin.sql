-- Админ-функционал: бан юзеров.
-- Список админов хранится в env ADMIN_IDS (через запятую telegram_id),
-- проверка делается в /admin функции — RLS/таблицы для админов не нужны.
alter table public.users
  add column if not exists banned boolean not null default false;

-- Индекс для быстрого поиска юзеров в админке (по last_seen).
create index if not exists idx_users_last_seen
  on public.users (last_seen_at desc nulls last);
