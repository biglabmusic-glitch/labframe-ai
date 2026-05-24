-- В новой Supabase-схеме (с переходом на sb_publishable/sb_secret ключи) роль
-- service_role больше не получает права на public-таблицы автоматически.
-- Без этого Edge Functions с service-role клиентом падают:
--   ERROR 42501: permission denied for table jobs
-- Возвращаем явный full-доступ для service_role на наши таблицы и схему.

grant usage on schema public to service_role;

grant select, insert, update, delete
  on public.users, public.brand, public.jobs, public.ai_calls
  to service_role;

-- ai_calls.id — bigserial, нужны права на sequence
grant usage, select on all sequences in schema public to service_role;

-- На случай, если в будущем добавим новые таблицы — даём default-права заранее
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;

alter default privileges in schema public
  grant usage, select on sequences to service_role;
