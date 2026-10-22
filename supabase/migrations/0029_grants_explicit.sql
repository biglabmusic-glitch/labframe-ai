-- Явные права service_role на все наши таблицы.
--
-- С 30 октября 2026 Supabase перестаёт раздавать права на новые таблицы в
-- схеме public автоматически — об этом письмо от 20.10.2026. Нас это касается
-- с хорошей стороны: anon и authenticated прав у нас и так нет, и теперь они
-- не появятся сами собой у следующей таблицы.
--
-- Опасна обратная сторона: служебной роли, под которой ходят Edge Functions,
-- права тоже нужно выдавать явно. Сейчас они держатся на alter default
-- privileges из 0004_grants.sql — а это работает, только если таблицу создала
-- та же роль, что эти privileges выставила. Таблица, созданная из дашборда,
-- через preview-ветку или после supabase db reset, прав не получит, и функция
-- молча упрётся в permission denied.
--
-- Поэтому проходим по всем таблицам схемы и выдаём права явно. Миграция
-- идемпотентна: повторный запуск ничего не ломает.

do $$
declare
  t record;
begin
  for t in
    select format('public.%I', tablename) as name
      from pg_tables
     where schemaname = 'public'
  loop
    execute format('grant select, insert, update, delete on %s to service_role', t.name);
    -- anon и authenticated не трогаем специально: наружу таблицы не отдаём,
    -- всё ходит через Edge Functions с проверкой Telegram initData.
    execute format('revoke all on %s from anon, authenticated', t.name);
  end loop;
end $$;

grant usage on schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Правило на будущее: новую таблицу создаём сразу с этой строкой.
--   grant select, insert, update, delete on public.<таблица> to service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to service_role;
