-- Ограничитель частоты и ежедневная сводка админам.

-- ─── 1. Частота обращений ───────────────────────────────────────────────────
--
-- Часть эндпоинтов тратит деньги на каждом вызове: подбор хэштегов ходит в
-- polza, подпись загрузки открывает запись в хранилище. Проверка initData
-- защищает от чужих, но не от своего же пользователя (или от утекшей строки
-- initData), который зациклит запрос и будет жечь наш счёт.

create table if not exists public.rate_hits (
  id      bigint generated always as identity primary key,
  user_id bigint      not null,
  action  text        not null,
  at      timestamptz not null default now()
);

create index if not exists rate_hits_lookup_idx
  on public.rate_hits (user_id, action, at desc);

alter table public.rate_hits enable row level security;

/*
 * Отмечает обращение и говорит, можно ли его обслуживать.
 * true — в пределах лимита, false — перебор.
 */
create or replace function public.hit_rate_limit(
  p_user_id    bigint,
  p_action     text,
  p_limit      int,
  p_window_sec int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  used int;
begin
  select count(*) into used
    from public.rate_hits
   where user_id = p_user_id
     and action  = p_action
     and at > now() - make_interval(secs => p_window_sec);

  if used >= p_limit then
    return false;
  end if;

  insert into public.rate_hits (user_id, action) values (p_user_id, p_action);

  -- Изредка подчищаем хвост, чтобы таблица не росла вечно. Чистить на каждом
  -- вызове — дороже самой проверки.
  if random() < 0.01 then
    delete from public.rate_hits where at < now() - interval '2 days';
  end if;

  return true;
end;
$$;

revoke execute on function public.hit_rate_limit(bigint, text, int, int) from public, anon, authenticated;
grant  execute on function public.hit_rate_limit(bigint, text, int, int) to service_role;

-- ─── 2. Ежедневная сводка ───────────────────────────────────────────────────
--
-- Бот уже пишет админам об оплатах и о низком остатке. Сводка закрывает
-- остальное: всплеск упавших работ или тишину в генерациях видно, не открывая
-- админку. Строка на день — чтобы при нескольких запусках в час сводка ушла
-- ровно один раз.

create table if not exists public.admin_digests (
  day        date primary key,
  created_at timestamptz not null default now()
);

alter table public.admin_digests enable row level security;
