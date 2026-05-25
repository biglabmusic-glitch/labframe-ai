-- Временно отключаем usage-лимит до подключения оплаты.
-- Триггер enforce_usage_limit бросал 'usage_limit_reached' при попытке
-- создать job с usage_used >= usage_limit. Пока нет реальной монетизации
-- (Telegram Stars / ЮKassa), все юзеры должны иметь возможность создавать
-- сколько угодно job.
--
-- При подключении оплаты — вернуть триггер обратно (см. 0001_init.sql:152-155).
drop trigger if exists trg_enforce_usage_limit on public.jobs;

-- bump_usage_on_done оставляем — он копит счётчик usage_used,
-- это полезный stat для будущего биллинга, и сам по себе ничего не блокирует.
