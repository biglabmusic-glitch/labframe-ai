-- Transactional smoke test after the smile_invites migration has been applied.
-- Only synthetic users and invitation hashes are used. No network/storage calls.
-- Run the complete file. The nested exception block also rolls back every fixture
-- before returning or propagating an assertion failure; the final ROLLBACK is an
-- additional guard. This is not a cross-session concurrency test.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

do $smile_smoke$
declare
  actor_id constant bigint := 9000000000001;
  recipient_id constant bigint := 9000000000002;
  result text;
  allowed boolean;
  consumed_by bigint;
  consumed_at timestamptz;
  role_name text;
  privilege_name text;
begin
  if exists (select 1 from public.users where id in (actor_id, recipient_id)) then
    raise exception 'smile invite smoke: synthetic user ids are occupied; no fixtures inserted';
  end if;
  if exists (select 1 from public.smile_invites where token_hash in (
    repeat('a', 64), repeat('b', 64), repeat('c', 64), repeat('d', 64)
  )) then
    raise exception 'smile invite smoke: synthetic hashes are occupied; no fixtures inserted';
  end if;

  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.smile_invites'::regclass) then
    raise exception 'smile invite smoke: RLS must be enabled';
  end if;
  if (select prosecdef from pg_catalog.pg_proc where oid = 'public.redeem_smile_invite(text,bigint)'::regprocedure) then
    raise exception 'smile invite smoke: redemption must be SECURITY INVOKER';
  end if;
  foreach role_name in array array['anon', 'authenticated'] loop
    if has_function_privilege(role_name, 'public.redeem_smile_invite(text,bigint)', 'EXECUTE') then
      raise exception 'smile invite smoke: % can execute redemption', role_name;
    end if;
    foreach privilege_name in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if has_table_privilege(role_name, 'public.smile_invites', privilege_name) then
        raise exception 'smile invite smoke: % has invitation % privilege', role_name, privilege_name;
      end if;
    end loop;
  end loop;
  if not has_function_privilege('service_role', 'public.redeem_smile_invite(text,bigint)', 'EXECUTE') then
    raise exception 'smile invite smoke: service_role cannot execute redemption';
  end if;
  foreach privilege_name in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
    if not has_table_privilege('service_role', 'public.smile_invites', privilege_name) then
      raise exception 'smile invite smoke: service_role lacks invitation % privilege', privilege_name;
    end if;
  end loop;

  -- Every write is inside this subtransaction. A success sentinel deliberately
  -- rolls back all of them before the notice is emitted.
  begin
    insert into public.users (id, banned, is_admin, smile_tester, funnel_enabled)
      values (actor_id, false, false, false, false),
             (recipient_id, false, false, false, false);
    insert into public.smile_invites (token_hash, created_by, label)
      values (repeat('a', 64), actor_id, 'transactional synthetic smoke');

    result := public.redeem_smile_invite(repeat('a', 64), recipient_id);
    if result is distinct from 'accepted' then raise exception 'expected accepted, got %', result; end if;
    select smile_tester into allowed from public.users where id = recipient_id;
    if allowed is distinct from true then raise exception 'accepted invitation did not grant access'; end if;
    select used_by, used_at into consumed_by, consumed_at from public.smile_invites where token_hash = repeat('a', 64);
    if consumed_by is distinct from recipient_id or consumed_at is null then
      raise exception 'accepted invitation was not consumed by its recipient';
    end if;

    result := public.redeem_smile_invite(repeat('a', 64), actor_id);
    if result is distinct from 'used' then raise exception 'second account expected used, got %', result; end if;
    select smile_tester into allowed from public.users where id = actor_id;
    if allowed is distinct from false then raise exception 'one invitation granted a second account'; end if;

    update public.users set smile_tester = false where id = recipient_id;
    result := public.redeem_smile_invite(repeat('a', 64), recipient_id);
    if result is distinct from 'already' then raise exception 'same account replay expected already, got %', result; end if;
    select smile_tester into allowed from public.users where id = recipient_id;
    if allowed is distinct from false then raise exception 'replay restored manually revoked access'; end if;

    insert into public.smile_invites (token_hash, created_by, created_at, expires_at)
      values (repeat('b', 64), actor_id, now() - interval '2 days', now() - interval '1 day');
    result := public.redeem_smile_invite(repeat('b', 64), recipient_id);
    if result is distinct from 'expired' then raise exception 'expected expired, got %', result; end if;

    insert into public.smile_invites (token_hash, created_by, revoked_at)
      values (repeat('c', 64), actor_id, now());
    result := public.redeem_smile_invite(repeat('c', 64), recipient_id);
    if result is distinct from 'revoked' then raise exception 'expected revoked, got %', result; end if;

    insert into public.smile_invites (token_hash, created_by)
      values (repeat('d', 64), actor_id);
    update public.users set banned = true where id = recipient_id;
    result := public.redeem_smile_invite(repeat('d', 64), recipient_id);
    if result is distinct from 'invalid' then raise exception 'banned user expected invalid, got %', result; end if;
    select smile_tester into allowed from public.users where id = recipient_id;
    if allowed is distinct from false then raise exception 'denied invitation granted access'; end if;
    if exists (select 1 from public.smile_invites where token_hash in (repeat('b', 64), repeat('c', 64), repeat('d', 64))
      and (used_at is not null or used_by is not null)) then
      raise exception 'expired/revoked/banned attempt consumed an invitation';
    end if;

    result := public.redeem_smile_invite(null, recipient_id);
    if result is distinct from 'invalid' then raise exception 'null hash expected invalid'; end if;
    result := public.redeem_smile_invite(repeat('d', 64), 0);
    if result is distinct from 'invalid' then raise exception 'invalid user id was accepted'; end if;

    raise exception using errcode = 'ZX001', message = 'smile invite smoke successful rollback';
  exception when sqlstate 'ZX001' then
    raise notice 'smile invite smoke passed: accepted, one-use, replay after revoke, expiry, revoke, ban, privileges; fixtures rolled back';
  end;

  if exists (select 1 from public.users where id in (actor_id, recipient_id)) then
    raise exception 'smile invite smoke: fixtures survived their subtransaction';
  end if;
  if exists (select 1 from public.smile_invites where token_hash in (repeat('a', 64), repeat('b', 64), repeat('c', 64), repeat('d', 64))) then
    raise exception 'smile invite smoke: invitations survived their subtransaction';
  end if;
end;
$smile_smoke$;

rollback;
