-- Включаем pg_cron и pg_net для вызова Edge Function по расписанию.
-- pg_net уже доступен в Supabase, pg_cron нужно включить в Dashboard:
--   Database → Extensions → pg_cron → enable
-- ПОСЛЕ enable выполни этот файл вручную (либо через миграцию).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Раз в 10 секунд дёргаем process-job. Воркер берёт по одному job в работу.
-- Заменяет «правильную» очередь — для MVP с <1 RPS этого хватает.
--
-- Параметры, которые нужно подставить руками перед запуском миграции:
--   PROJECT_REF — ref Supabase-проекта (часть домена .supabase.co)
--   INTERNAL_SECRET — тот же секрет, что в env Edge Functions
--
-- Установить параметры один раз (от owner):
--   alter database postgres set app.project_ref = 'ktvhwraczovhzydbbqle';
--   alter database postgres set app.internal_secret = 'your-long-random-secret';

select cron.schedule(
  'process-jobs-tick',
  '*/10 * * * * *',           -- каждые 10 секунд
  $$
  select net.http_post(
    url := 'https://' || current_setting('app.project_ref') || '.supabase.co/functions/v1/process-job',
    headers := jsonb_build_object(
      'Content-Type',        'application/json',
      'x-internal-secret',   current_setting('app.internal_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
