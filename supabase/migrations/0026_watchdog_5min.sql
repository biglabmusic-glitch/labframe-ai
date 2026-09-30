-- Сторож зависших работ: 3 минуты → 5.
--
-- Модель теперь ждём до 100 секунд (image-providers.ts), и вместе с
-- агентом, повтором, логотипом и подписью обработка в худшем случае
-- подбирается к трём минутам. Сторож успевал бы пометить ещё живую работу
-- как упавшую: человек видел ошибку, а через минуту работа становилась
-- готовой и списывала генерацию.
--
-- Пять минут — тот же порог, что у sweepStale в самой функции process-job.
select cron.schedule(
  'process-jobs-watchdog',
  '*/1 * * * *',
  $$
  update public.jobs
     set status         = 'failed',
         error_message  = 'timeout',
         finished_at    = now()
   where status      = 'processing'
     and started_at < now() - interval '5 minutes';
  $$
);
