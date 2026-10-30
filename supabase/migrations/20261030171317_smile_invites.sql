-- Одноразовое приглашение в закрытый тест. В БД никогда не хранится сама ссылка.
create table if not exists public.smile_invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by bigint not null references public.users(id),
  label text check (label is null or (char_length(label) <= 80 and label !~ '[[:cntrl:]]')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  revoked_at timestamptz,
  used_by bigint references public.users(id) on delete set null,
  used_at timestamptz,
  check (expires_at > created_at),
  check (used_by is null or used_at is not null)
);

create index if not exists smile_invites_created_idx on public.smile_invites (created_at desc);
alter table public.smile_invites enable row level security;
revoke all on public.smile_invites from public, anon, authenticated;
grant select, insert, update, delete on public.smile_invites to service_role;

-- Row lock сериализует активации: одна ссылка не выдаст доступ двум людям.
-- Повтор той же ссылки тем же человеком не возвращает отозванный вручную доступ.
create or replace function public.redeem_smile_invite(p_token_hash text, p_user_id bigint)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  invitation public.smile_invites%rowtype;
  user_banned boolean;
begin
  if p_user_id is null or p_user_id <= 0 or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return 'invalid';
  end if;

  select * into invitation from public.smile_invites
    where token_hash = p_token_hash for update;
  if not found then return 'invalid'; end if;

  select banned into user_banned from public.users where id = p_user_id for update;
  if not found or user_banned is distinct from false then return 'invalid'; end if;

  -- used_at remains set even after deletion of the original recipient's account.
  if invitation.used_at is not null then
    if invitation.used_by = p_user_id then return 'already'; end if;
    return 'used';
  end if;
  if invitation.revoked_at is not null then return 'revoked'; end if;
  if invitation.expires_at <= clock_timestamp() then return 'expired'; end if;

  update public.users set smile_tester = true where id = p_user_id;
  update public.smile_invites set used_by = p_user_id, used_at = clock_timestamp()
    where id = invitation.id;
  return 'accepted';
end;
$$;

revoke execute on function public.redeem_smile_invite(text, bigint) from public, anon, authenticated;
grant execute on function public.redeem_smile_invite(text, bigint) to service_role;
