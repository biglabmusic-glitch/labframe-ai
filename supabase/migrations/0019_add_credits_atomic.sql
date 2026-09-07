-- Атомарное начисление генераций.
--
-- Раньше баланс менялся чтением и последующей записью: select credits, потом
-- update credits = прочитанное + N. Между этими шагами в баланс мог прилететь
-- другой платёж или реферальный бонус — и он терялся, потому что второй запрос
-- писал значение, посчитанное из устаревшего.
--
-- Здесь всё считает СУБД: credits = credits + delta одним запросом, под
-- блокировкой строки. Отрицательная дельта тоже допустима (возврат, коррекция),
-- но баланс не уходит ниже нуля.
create or replace function public.add_credits(
  p_user_id bigint,
  p_delta   int
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance int;
begin
  update public.users
     set credits = greatest(credits + p_delta, 0)
   where id = p_user_id
  returning credits into new_balance;

  return new_balance;  -- NULL, если такого пользователя нет
end;
$$;

comment on function public.add_credits is
  'Меняет баланс генераций на delta одним атомарным запросом. Возвращает новый баланс.';
