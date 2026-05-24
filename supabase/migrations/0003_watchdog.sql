-- Watchdog: помечает зависшие job-ы как failed.
-- Если Replicate подвисает дольше wait=60s, edge-функция уходит по таймауту,
-- job остаётся в processing навсегда, фронт waitForJob крутит спиннер до бесконечности.
-- Этот cron-job ловит такие случаи через 3 минуты.

select cron.schedule(
  'process-jobs-watchdog',
  '*/1 * * * *',                              -- каждую минуту
  $$
  update public.jobs
     set status         = 'failed',
         error_message  = 'timeout',
         finished_at    = now()
   where status      = 'processing'
     and started_at < now() - interval '3 minutes';
  $$
);
