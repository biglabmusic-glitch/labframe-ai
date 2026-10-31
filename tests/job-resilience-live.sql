-- No network calls or committed fixtures. Safe against the working schema.
begin;
set local role service_role;
do $$
declare qa bigint:=9000000000000001; settings jsonb; request_id uuid:=gen_random_uuid();
 first jsonb; again jsonb; claimed public.jobs%rowtype; balance int;
begin
 assert not exists(select 1 from public.users where id=qa),'QA fixture id already in use';
 insert into public.users(id,credits,consent_at,consent_version,funnel_enabled)
  values(qa,3,now(),2,false);
 settings:=jsonb_build_object('photo_path',qa::text||'/sql-only.png','style','clean','format','4x5');
 first:=public.create_job_atomic(qa,request_id,settings,false);
 again:=public.create_job_atomic(qa,request_id,settings,false);
 assert first->>'id'=again->>'id','idempotency failed';
 select credits into balance from public.users where id=qa;
 assert balance=2,'duplicate debit';
 select * into claimed from public.claim_job((first->>'id')::uuid);
 assert claimed.worker_token is not null,'claim failed';
 perform public.begin_image_attempt(claimed.id,claimed.worker_token,'polza','qa-no-network',10000);
 update public.ai_image_attempts set status='pending',provider_task_id='qa-never-submitted' where job_id=claimed.id;
 update public.jobs set worker_lease_until=null,next_poll_at=now() where id=claimed.id;
 select * into claimed from public.claim_job(claimed.id);
 assert claimed.worker_token is not null,'deferred job could not resume';
 assert (select count(*) from public.ai_image_attempts where job_id=claimed.id)=1,'attempt duplicated';
 update public.jobs set status='failed' where id=claimed.id;
 update public.jobs set status='failed' where id=claimed.id;
 assert (select credits from public.users where id=qa)=3,'refund incorrect';
 assert not has_function_privilege('anon','public.create_job_atomic(bigint,uuid,jsonb,boolean,integer)','execute'),'public RPC';
end $$;
rollback;
