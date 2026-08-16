-- Чиним cron-тик очереди.
--
-- Задача process-jobs-tick из 0002_cron.sql существует и активна, но падает на КАЖДОМ
-- запуске: `unrecognized configuration parameter "app.project_ref"`. Она читала настройки
-- через current_setting('app.project_ref' / 'app.internal_secret'), а выставить их нельзя —
-- в управляемом Supabase роль postgres не суперюзер, и `alter database ... set` для
-- кастомных параметров отдаёт `42501: permission denied to set parameter`.
--
-- Поэтому: project ref пишем литералом (он не секрет — это часть публичного домена),
-- а секрет берём из Vault, где он лежит зашифрованным.
--
-- ПЕРЕД применением миграции секрет нужно один раз положить в Vault (значение в репозиторий
-- не попадает, поэтому шаг ручной):
--
--   select vault.create_secret(
--     '<значение INTERNAL_SECRET из секретов Edge Functions>',
--     'internal_secret',
--     'Секрет для вызова process-job из cron'
--   );
--
--   -- если секрет с таким именем уже есть:
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'internal_secret'),
--     '<новое значение>'
--   );
--
-- Если Vault пуст, заголовок уйдёт пустым и process-job ответит 403 — то есть не хуже,
-- чем сейчас, когда задача падает целиком. Ничего не ломается, тик просто не работает.
--
-- cron.schedule с существующим именем задачи ПЕРЕЗАПИСЫВАЕТ её, новую не плодит,
-- поэтому миграция идемпотентна.

select cron.schedule(
  'process-jobs-tick',
  '*/10 * * * * *',                          -- каждые 10 секунд
  $$
  select net.http_post(
    url := 'https://mmegdmfmozgaycuyeacl.supabase.co/functions/v1/process-job',
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'x-internal-secret', coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'internal_secret'),
        ''
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
