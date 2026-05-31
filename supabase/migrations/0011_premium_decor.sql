-- Premium-режим «Индивидуальность»: декор в jobs + отдельный счётчик premium у users.

-- jobs: что за декор был выбран (preset id, либо 'custom', либо NULL = без декора)
-- + резолвнутые surface/addition (их пишет create-job, читает process-job).
alter table public.jobs
  add column if not exists decor_preset   text,
  add column if not exists decor_surface  text,
  add column if not exists decor_addition text;

-- users: отдельный premium-лимит (3 бесплатных декор-генерации).
alter table public.users
  add column if not exists premium_used  int not null default 0,
  add column if not exists premium_limit int not null default 3;

-- Инкремент premium_used при done — ТОЛЬКО для job с декором.
create or replace function public.bump_premium_on_done()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'done'
     and (old.status is distinct from 'done')
     and new.decor_preset is not null then
    update public.users
       set premium_used = premium_used + 1
     where id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bump_premium_on_done on public.jobs;
create trigger trg_bump_premium_on_done
  after update on public.jobs
  for each row execute function public.bump_premium_on_done();
