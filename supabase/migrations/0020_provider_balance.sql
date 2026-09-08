-- История остатка на счёте провайдера моделей.
--
-- Сам провайдер отдаёт только «сколько сейчас». Этого хватает, чтобы не
-- прозевать ноль, но не хватает, чтобы понять экономику: сколько потрачено за
-- неделю и сколько ты внёс.
--
-- Из последовательности замеров выводится и то, и другое: остаток упал между
-- соседними снимками — это расход, вырос — это пополнение. Отдельного учёта
-- платежей провайдеру не требуется.
create table if not exists public.provider_balance (
  id       bigserial   primary key,
  provider text        not null,
  balance  numeric(12, 4) not null,
  currency text        not null default 'RUB',
  at       timestamptz not null default now()
);

create index if not exists provider_balance_idx
  on public.provider_balance (provider, at desc);

-- Наружу не отдаём: сколько денег у владельца на счёте — не дело пользователей.
alter table public.provider_balance enable row level security;

comment on table public.provider_balance is
  'Замеры остатка у провайдера моделей. Расход и пополнения считаются как разности соседних замеров.';
