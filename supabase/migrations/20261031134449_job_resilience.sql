-- Server-only job creation, leases and durable provider attempts.
alter table public.jobs
  add column if not exists request_key uuid,
  add column if not exists request_fingerprint text,
  add column if not exists billing_exempt boolean not null default false,
  add column if not exists is_test boolean not null default false,
  add column if not exists caption_source text not null default 'ai'
    check (caption_source in ('ai', 'template', 'none')),
  add column if not exists worker_token uuid,
  add column if not exists worker_lease_until timestamptz,
  add column if not exists next_poll_at timestamptz;

create unique index if not exists jobs_user_request_key_idx on public.jobs(user_id, request_key)
  where request_key is not null;
create index if not exists jobs_pending_poll_idx on public.jobs(next_poll_at, created_at)
  where status in ('created', 'processing');

create table public.ai_image_attempts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  attempt_no int not null check (attempt_no between 1 and 2),
  provider text not null check (provider in ('polza', 'replicate-flux', 'replicate-nano', 'fal')),
  model text not null check (length(model) between 1 and 200),
  status text not null default 'starting' check (status in ('starting','pending','succeeded','failed','unknown')),
  provider_task_id text check (length(provider_task_id) between 1 and 200),
  result_url text check (length(result_url) <= 8192),
  error_code text check (length(error_code) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(job_id, attempt_no)
);
create index ai_image_attempts_created_idx on public.ai_image_attempts(created_at);
alter table public.ai_image_attempts enable row level security;
revoke all on public.ai_image_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.ai_image_attempts to service_role;

create table public.ai_provider_health (
  provider text primary key check (provider in ('polza', 'replicate', 'fal')),
  consecutive_failures int not null default 0,
  open_until timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error_code text,
  updated_at timestamptz not null default now()
);
alter table public.ai_provider_health enable row level security;
revoke all on public.ai_provider_health from public, anon, authenticated;
grant select, insert, update, delete on public.ai_provider_health to service_role;

create table public.backup_runs(
  id uuid primary key default gen_random_uuid(),snapshot_at timestamptz not null,
  completed_at timestamptz not null default now(),sha256 text not null unique check(sha256~'^[a-fA-F0-9]{64}$'),
  row_count bigint not null,table_count int not null,storage_objects int not null default 0,
  storage_included boolean not null default false,data_verified boolean not null default false,
  storage_verified boolean not null default false,portable_recovery boolean not null default false
);
alter table public.backup_runs enable row level security;
revoke all on public.backup_runs from public,anon,authenticated;
grant select,insert,update,delete on public.backup_runs to service_role;

create or replace function public.create_job_atomic(
  p_user_id bigint, p_request_key uuid, p_settings jsonb,
  p_billing_exempt boolean default false, p_daily_limit int default 50
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  u public.users%rowtype;
  existing public.jobs%rowtype;
  new_job public.jobs%rowtype;
  fingerprint text;
  request_id uuid;
  cost int;
begin
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' or p_daily_limit not between 1 and 1000 then
    raise exception 'invalid_settings';
  end if;
  select * into u from public.users where id = p_user_id for update;
  if not found then raise exception 'user_not_found'; end if;
  if u.banned then raise exception 'banned'; end if;
  if u.consent_at is null or u.consent_version is distinct from 2 then raise exception 'consent_required'; end if;
  if not starts_with(p_settings->>'photo_path', p_user_id::text || '/')
     or position('..' in p_settings->>'photo_path') > 0
     or length(p_settings->>'photo_path') > 512
     or p_settings->>'photo_path' like '%/smile-pilot/%' then
    raise exception 'forbidden_path';
  end if;
  fingerprint := encode(sha256(convert_to(p_settings::text, 'UTF8')), 'hex');
  -- Compatibility for old clients: an identical payload cannot reserve twice.
  request_id := coalesce(p_request_key, md5(p_settings::text)::uuid);
  select * into existing from public.jobs where user_id = p_user_id and request_key = request_id;
  if found then
    if existing.request_fingerprint is distinct from fingerprint then raise exception 'idempotency_conflict'; end if;
    return jsonb_build_object('id',existing.id,'status',existing.status,'duplicate',true);
  end if;
  if (select count(*) from public.jobs where user_id=p_user_id and status in ('created','processing')
      and created_at > now()-interval '15 minutes') >= 2 then raise exception 'too_many_in_progress'; end if;
  if (select count(*) from public.jobs where user_id=p_user_id and created_at > now()-interval '24 hours') >= p_daily_limit then
    raise exception 'daily_limit';
  end if;
  cost := case when p_settings->>'decor_preset' is not null then 3 else 1 end;
  if not p_billing_exempt then
    if u.credits < cost then
      return jsonb_build_object('error','insufficient_credits','needed',cost,'have',u.credits);
    end if;
    update public.users set credits=credits-cost where id=p_user_id;
  end if;
  insert into public.jobs(user_id,request_key,request_fingerprint,credits_reserved,billing_exempt,
    photo_path,work_type,style,format,branding,text_type,decor_preset,decor_surface,decor_addition,status)
  values(p_user_id,request_id,fingerprint,case when p_billing_exempt then 0 else cost end,p_billing_exempt,
    p_settings->>'photo_path',(p_settings->>'work_type')::public.work_type,
    (p_settings->>'style')::public.style_id,(p_settings->>'format')::public.format_id,
    coalesce(p_settings->>'branding','none')::public.branding_kind,
    coalesce(p_settings->>'text_type','short')::public.text_type,
    p_settings->>'decor_preset',p_settings->>'decor_surface',p_settings->>'decor_addition','created')
  returning * into new_job;
  return jsonb_build_object('id',new_job.id,'status',new_job.status,'duplicate',false);
end $$;
revoke execute on function public.create_job_atomic(bigint,uuid,jsonb,boolean,int) from public,anon,authenticated;
grant execute on function public.create_job_atomic(bigint,uuid,jsonb,boolean,int) to service_role;

create or replace function public.claim_job(p_job_id uuid default null)
returns setof public.jobs language plpgsql security invoker set search_path = '' as $$
declare chosen uuid;
begin
  select id into chosen from public.jobs
   where (status='created' or (status='processing' and worker_token is not null))
     and (p_job_id is null or id=p_job_id)
     and (worker_lease_until is null or worker_lease_until < now())
     and (next_poll_at is null or next_poll_at <= now())
   order by coalesce(next_poll_at,created_at), created_at
   for update skip locked limit 1;
  if chosen is null then return; end if;
  return query update public.jobs set status='processing',started_at=coalesce(started_at,now()),
    worker_token=gen_random_uuid(),worker_lease_until=now()+interval '120 seconds'
    where id=chosen returning *;
end $$;
revoke execute on function public.claim_job(uuid) from public,anon,authenticated;
grant execute on function public.claim_job(uuid) to service_role;

create or replace function public.begin_image_attempt(
  p_job_id uuid,p_worker_token uuid,p_provider text,p_model text,p_daily_limit int default 200
) returns setof public.ai_image_attempts language plpgsql security invoker set search_path = '' as $$
declare current_job public.jobs%rowtype; n int;
begin
  select * into current_job from public.jobs where id=p_job_id for update;
  if not found or current_job.status <> 'processing' or current_job.worker_token is distinct from p_worker_token
     or current_job.worker_lease_until is null or current_job.worker_lease_until < now() then raise exception 'lease_lost'; end if;
  select count(*) into n from public.ai_image_attempts where job_id=p_job_id;
  if n >= 2 or exists(select 1 from public.ai_image_attempts where job_id=p_job_id and status <> 'failed') then
    raise exception 'attempt_not_allowed';
  end if;
  -- Serialize the global cost guard, not the external network operation.
  perform pg_advisory_xact_lock(713821,1);
  if p_daily_limit not between 1 and 10000 or
     (select count(*) from public.ai_image_attempts where created_at>now()-interval '24 hours') >= p_daily_limit then
    raise exception 'provider_daily_limit';
  end if;
  return query insert into public.ai_image_attempts(job_id,attempt_no,provider,model)
    values(p_job_id,n+1,p_provider,p_model) returning *;
end $$;
revoke execute on function public.begin_image_attempt(uuid,uuid,text,text,int) from public,anon,authenticated;
grant execute on function public.begin_image_attempt(uuid,uuid,text,text,int) to service_role;

create or replace function public.record_ai_provider_result(p_provider text,p_success boolean,p_error_code text default null)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.ai_provider_health(provider,consecutive_failures,open_until,last_success_at,last_failure_at,last_error_code)
  values(p_provider,case when p_success then 0 else 1 end,
    case when not p_success and p_error_code in ('account_401','account_402','account_403') then now()+interval '15 minutes' end,
    case when p_success then now() end,case when not p_success then now() end,left(p_error_code,80))
  on conflict(provider) do update set
    consecutive_failures=case when p_success then 0 else public.ai_provider_health.consecutive_failures+1 end,
    open_until=case when p_success then null
      when p_error_code in ('account_401','account_402','account_403') then now()+interval '15 minutes'
      when public.ai_provider_health.consecutive_failures+1 >= 2 then now()+interval '5 minutes'
      else public.ai_provider_health.open_until end,
    last_success_at=case when p_success then now() else public.ai_provider_health.last_success_at end,
    last_failure_at=case when p_success then public.ai_provider_health.last_failure_at else now() end,
    last_error_code=case when p_success then null else left(p_error_code,80) end,updated_at=now();
end $$;
revoke execute on function public.record_ai_provider_result(text,boolean,text) from public,anon,authenticated;
grant execute on function public.record_ai_provider_result(text,boolean,text) to service_role;

-- Serialize each limit key; concurrent requests must not all pass the same count.
create or replace function public.hit_rate_limit(p_user_id bigint,p_action text,p_limit int,p_window_sec int)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare used int;
begin
  if p_user_id is null or p_user_id<0 or p_action is null or length(p_action)>80 or
    p_limit is null or p_limit not between 1 and 10000 or
    p_window_sec is null or p_window_sec not between 1 and 86400 then raise exception 'invalid_rate_limit'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_action,0));
  select count(*) into used from public.rate_hits where user_id=p_user_id and action=p_action
    and at>now()-make_interval(secs=>p_window_sec);
  if used>=p_limit then return false; end if;
  insert into public.rate_hits(user_id,action) values(p_user_id,p_action);
  if random()<0.01 then delete from public.rate_hits where at<now()-interval '2 days'; end if;
  return true;
end $$;
revoke execute on function public.hit_rate_limit(bigint,text,int,int) from public,anon,authenticated;
grant execute on function public.hit_rate_limit(bigint,text,int,int) to service_role;

-- Explicit billing exemption, and no implicit second debit of a reserved job.
create or replace function public.spend_credits_on_done()
returns trigger language plpgsql set search_path = '' as $$
declare cost int;
begin
  if new.status='done' and old.status is distinct from 'done' and not new.billing_exempt
    and coalesce(old.credits_reserved,0)=0 then
    cost := case when new.decor_preset is not null then 3 else 1 end;
    update public.users set credits=greatest(credits-cost,0) where id=new.user_id;
  end if;
  return new;
end $$;
alter function public.refund_credits_on_fail() set search_path = '';
alter function public.enforce_usage_limit() set search_path = '';

-- Provider tasks may outlive an Edge invocation; expire after twelve minutes.
do $$
begin
  if exists(select 1 from pg_namespace where nspname='cron') then
    perform cron.schedule('process-jobs-watchdog','* * * * *',
      $watchdog$update public.jobs set status='failed',error_message='timeout',finished_at=now(),
        worker_token=null,worker_lease_until=null
        where status='processing' and started_at<now()-interval '12 minutes';$watchdog$);
  end if;
end $$;
