-- Накопленный расход у провайдера.
--
-- Оказалось, polza отдаёт spentAmount — сколько потрачено за всё время. Это
-- надёжнее, чем выводить расход из падений остатка: пополнения больше не путают
-- расчёт, а «потрачено всего» видно сразу, не дожидаясь накопления замеров.
alter table public.provider_balance
  add column if not exists spent_total numeric(14, 4);

comment on column public.provider_balance.spent_total is
  'Накопленный расход у провайдера на момент замера (spentAmount).';
