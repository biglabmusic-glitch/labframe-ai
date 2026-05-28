-- Назначаемые админы прямо в БД (раньше только env ADMIN_IDS).
-- ADMIN_IDS остаётся как «супер-админ bootstrap»: эти id всегда админы и
-- синхронизируются в is_admin при заходе через /me. Остальных админов можно
-- назначать/снимать из самой админки (action set-admin) — отражается тут.
alter table public.users
  add column if not exists is_admin boolean not null default false;

-- Частичный индекс — быстро вытянуть список всех админов.
create index if not exists idx_users_is_admin
  on public.users (id) where is_admin = true;
