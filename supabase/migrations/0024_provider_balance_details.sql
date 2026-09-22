-- Подробности замера остатка у провайдера моделей.
--
-- Раньше писали только available — свободные деньги. Когда цифра в админке
-- разошлась с личным кабинетом polza, выяснить причину было нечем: не видно
-- ни общей суммы на счёте, ни зарезервированного, ни времени замера.
alter table public.provider_balance
  add column if not exists amount   numeric(12, 4),
  add column if not exists reserved numeric(12, 4);

comment on column public.provider_balance.amount is
  'Вся сумма на счёте провайдера (amount), включая зарезервированное.';
comment on column public.provider_balance.reserved is
  'Зарезервировано под незавершённые запросы (reservedAmount).';
