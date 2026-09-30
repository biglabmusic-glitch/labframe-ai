-- Закрываем функции базы от внешнего мира.
--
-- Postgres по умолчанию разрешает выполнять любую функцию всем (PUBLIC), а
-- Supabase выставляет функции схемы public наружу как /rest/v1/rpc/<имя>.
-- Публичный ключ проекта лежит в сборке мини-аппа — это нормально, он и
-- задуман публичным, — но вместе с этим любой желающий мог вызвать:
--
--   add_credits(<свой id>, 100000)          — начислить себе генерации;
--   add_credits(<чужой id>, -100000)        — обнулить чужой баланс;
--   apply_payment(...)                      — провести «оплату», которой не было.
--
-- Обе функции SECURITY DEFINER, то есть RLS их не останавливает. Проверено
-- 30.09.2026 безвредным вызовом add_credits(1, 0): сервер ответил 200.
--
-- Эти функции нужны только нашим Edge Functions, а те ходят в базу под
-- service_role. Больше их никто вызывать не должен.

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

-- И чтобы новые функции не открывались наружу сами собой.
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
