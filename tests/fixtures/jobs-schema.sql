-- Minimal pre-migration schema for isolated transaction/permissions tests.
create role anon;
create role authenticated;
create role service_role;
create type public.job_status as enum('created','photo_uploaded','settings_selected','processing','done','failed');
create type public.work_type as enum('crown','veneer','bridge','other');
create type public.style_id as enum('clean','dark','soft');
create type public.format_id as enum('4x5','1x1','9x16');
create type public.branding_kind as enum('none','name','logo');
create type public.text_type as enum('short','sell','tech','none');
create table public.users(id bigint primary key,credits int not null default 3,banned boolean not null default false,consent_at timestamptz,consent_version int default 2);
create table public.rate_hits(id bigint generated always as identity primary key,user_id bigint not null,action text not null,at timestamptz not null default now());
create table public.jobs(
 id uuid primary key default gen_random_uuid(), user_id bigint not null references public.users(id),
 status public.job_status not null default 'created', photo_path text not null, work_type public.work_type,
 style public.style_id not null,format public.format_id not null,branding public.branding_kind not null default 'none',
 text_type public.text_type not null default 'short',decor_preset text,decor_surface text,decor_addition text,
 credits_reserved int not null default 0,result_path text,thumb_path text,caption_main text,caption_alt text,
 hashtags text[] not null default '{}',prompt_used text,agent_notes text,model_used text,error_message text,
 created_at timestamptz not null default now(),started_at timestamptz,finished_at timestamptz
);
create function public.enforce_usage_limit() returns trigger language plpgsql as $$begin return new; end$$;
create function public.spend_credits_on_done() returns trigger language plpgsql as $$begin return new; end$$;
create function public.refund_credits_on_fail() returns trigger language plpgsql as $$
begin
 if new.status='failed' and old.status is distinct from 'failed' and old.credits_reserved>0 then
  update public.users set credits=credits+old.credits_reserved where id=new.user_id;
  new.credits_reserved:=0;
 end if;
 return new;
end$$;
create trigger trg_spend_credits_on_done before update on public.jobs for each row execute function public.spend_credits_on_done();
create trigger trg_refund_credits_on_fail before update on public.jobs for each row execute function public.refund_credits_on_fail();
