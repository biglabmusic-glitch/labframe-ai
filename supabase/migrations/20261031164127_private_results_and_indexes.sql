-- Apply only after get-job/list-jobs/process-job serve signed URLs.
update storage.buckets set public=false where id='results';
alter table public.jobs add column test_provider text check(test_provider in ('polza','flux-kontext','nano-banana','fal')),
  add constraint jobs_test_provider_internal check(test_provider is null or is_test);
create index if not exists gifts_claimed_by_idx on public.gifts(claimed_by);
create index if not exists jobs_parent_job_id_idx on public.jobs(parent_job_id);
create index if not exists smile_invites_created_by_idx on public.smile_invites(created_by);
create index if not exists smile_invites_used_by_idx on public.smile_invites(used_by);
create index if not exists users_referred_by_idx on public.users(referred_by);
