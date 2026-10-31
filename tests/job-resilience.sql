begin;
do $$
declare
 settings jsonb:='{"photo_path":"1/test.png","style":"clean","format":"4x5"}';
 first jsonb; duplicate jsonb; second jsonb; third jsonb; claimed public.jobs%rowtype; old_token uuid; n int;
begin
 insert into public.users(id,credits,consent_at) values(1,3,now());
 -- A bad insert must roll back the debit in the same transaction.
 begin
  perform public.create_job_atomic(1,gen_random_uuid(),settings||'{"style":"invalid"}',false);
  raise exception 'expected enum rejection';
 exception when invalid_text_representation then null;
 end;
 assert (select credits from public.users where id=1)=3,'failed insert leaked credits';
 first:=public.create_job_atomic(1,'11111111-1111-4111-8111-111111111111',settings,false);
 duplicate:=public.create_job_atomic(1,'11111111-1111-4111-8111-111111111111',settings,false);
 assert first->>'id'=duplicate->>'id','duplicate created another job';
 assert (select credits from public.users where id=1)=2,'duplicate reserved twice';
 begin
  perform public.create_job_atomic(1,'11111111-1111-4111-8111-111111111111',settings||'{"format":"1x1"}',false);
  raise exception 'expected conflict';
 exception when raise_exception then assert sqlerrm='idempotency_conflict',sqlerrm; end;
 duplicate:=public.create_job_atomic(1,gen_random_uuid(),settings||'{"decor_preset":"test"}',false);
 assert duplicate->>'error'='insufficient_credits','decor undercharged';
 second:=public.create_job_atomic(1,gen_random_uuid(),settings,false);
 begin
  perform public.create_job_atomic(1,gen_random_uuid(),settings,false);
  raise exception 'expected active limit';
 exception when raise_exception then assert sqlerrm='too_many_in_progress',sqlerrm; end;
 update public.jobs set status='failed' where id=(first->>'id')::uuid;
 update public.jobs set status='failed' where id=(first->>'id')::uuid;
 assert (select credits from public.users where id=1)=2,'failed job refund was duplicated';
 update public.jobs set status='done' where id=(second->>'id')::uuid;
 assert (select credits from public.users where id=1)=2,'done job was charged again';
 third:=public.create_job_atomic(1,gen_random_uuid(),settings,false);
 select * into claimed from public.claim_job((third->>'id')::uuid);
 assert claimed.worker_token is not null,'job not claimed';
 select count(*) into n from public.claim_job(claimed.id);
 assert n=0,'live lease claimed twice';
 old_token:=claimed.worker_token;
 update public.jobs set worker_lease_until=now()-interval '1 minute' where id=claimed.id;
 select * into claimed from public.claim_job(claimed.id);
 assert claimed.worker_token<>old_token,'lease token was reused';
 begin
  perform public.begin_image_attempt(claimed.id,old_token,'polza','test',200);
  raise exception 'expected lost lease';
 exception when raise_exception then assert sqlerrm='lease_lost',sqlerrm; end;
 perform public.begin_image_attempt(claimed.id,claimed.worker_token,'polza','test',200);
 begin
  perform public.begin_image_attempt(claimed.id,claimed.worker_token,'polza','test',200);
  raise exception 'expected attempt guard';
 exception when raise_exception then assert sqlerrm='attempt_not_allowed',sqlerrm; end;
 update public.ai_image_attempts set status='unknown' where job_id=claimed.id;
 begin
  perform public.begin_image_attempt(claimed.id,claimed.worker_token,'replicate-flux','test',200);
  raise exception 'unknown submission must not fall back';
 exception when raise_exception then assert sqlerrm='attempt_not_allowed',sqlerrm; end;
 update public.ai_image_attempts set status='failed' where job_id=claimed.id;
 perform public.begin_image_attempt(claimed.id,claimed.worker_token,'replicate-flux','test',200);
 assert (select count(*) from public.ai_image_attempts where job_id=claimed.id)=2,'fallback not recorded';
 update public.ai_image_attempts set status='failed' where job_id=claimed.id;
 begin
  perform public.begin_image_attempt(claimed.id,claimed.worker_token,'polza','test',200);
  raise exception 'expected maximum two attempts';
 exception when raise_exception then assert sqlerrm='attempt_not_allowed',sqlerrm; end;
 perform public.record_ai_provider_result('polza',false,'provider_unavailable');
 perform public.record_ai_provider_result('polza',false,'provider_unavailable');
 assert (select open_until>now() from public.ai_provider_health where provider='polza'),'circuit did not open';
 perform public.record_ai_provider_result('polza',true);
 assert (select consecutive_failures=0 and open_until is null from public.ai_provider_health where provider='polza'),'circuit did not reset';
 perform public.record_ai_provider_result('replicate',false,'account_402');
 assert (select open_until>now() from public.ai_provider_health where provider='replicate'),'empty account must open circuit immediately';
 insert into public.users(id,credits,consent_at)values(2,0,now());
 duplicate:=public.create_job_atomic(2,gen_random_uuid(),settings||'{"photo_path":"2/test.png"}',true);
 update public.jobs set status='done' where id=(duplicate->>'id')::uuid;
 assert (select credits from public.users where id=2)=0,'exempt job billed';
 insert into public.users(id,credits)values(3,3);
 begin
  perform public.create_job_atomic(3,gen_random_uuid(),settings||'{"photo_path":"3/test.png"}',false);
  raise exception 'expected consent guard';
 exception when raise_exception then assert sqlerrm='consent_required',sqlerrm; end;
 assert not has_function_privilege('anon','public.create_job_atomic(bigint,uuid,jsonb,boolean,integer)','execute'),'anonymous RPC access';
 assert not has_function_privilege('authenticated','public.begin_image_attempt(uuid,uuid,text,text,integer)','execute'),'authenticated attempt access';
 assert not has_table_privilege('anon','public.ai_image_attempts','select'),'anonymous table access';
 assert public.hit_rate_limit(0,'global-test',2,86400),'first global action blocked';
 assert public.hit_rate_limit(0,'global-test',2,86400),'second global action blocked';
 assert not public.hit_rate_limit(0,'global-test',2,86400),'global limit bypassed';
end$$;
rollback;
