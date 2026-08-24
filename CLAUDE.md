# LabFrame AI — заметки для Claude

Telegram Mini App для зубных техников: фото работы → AI обработка → готовый пост Instagram.

## Структура репо

```
app/        — фронт (React + Vite + TS + @twa-dev/sdk), 14 экранов, на Vercel
bot/        — Telegram-бот (grammY), готов для Railway, но ещё НЕ задеплоен
supabase/   — БД + Storage + 6 Edge Functions (Deno)
scripts/    — bootstrap-supabase.ps1 (интерактивный setup)
design/     — HTML+JSX-референс (не код)
specs/      — ТЗ, MVP, User Journey
DEPLOY.md   — пошаговая инструкция
HANDOFF.md  — дизайн-handoff для разработчиков
```

## Куда задеплоено

| Сервис | URL / Ref | Статус |
|---|---|---|
| GitHub | https://github.com/biglabmusic-glitch/labframe-ai | ✅ |
| Vercel (фронт) | https://labframe-ai.vercel.app | ✅ env vars: VITE_API_BASE_URL + VITE_SUPABASE_ANON_KEY |
| Supabase | project ref `mmegdmfmozgaycuyeacl`, region eu-west-1 | ✅ 4 таблицы + 3 buckets + 6 функций |
| Telegram bot | @labframe_ai_bot, id `8845191717`, mini app: `t.me/labframe_ai_bot/app` | ✅ привязан к Vercel URL |
| Railway (бот webhook) | — | ❌ ещё не задеплоен (бот пока без long-polling) |

## Edge Functions

Все деплоятся с `--no-verify-jwt`. Telegram initData проверяется через `_shared/auth.ts → authorize()`.

- `me` — upsert юзера + профиль/бренд
- `sign-upload` — подписанный PUT URL на bucket `photos` (принимает только `image/*`)
- `create-job` — insert в `jobs`, триггерит `process-job` через `EdgeRuntime.waitUntil` (без pg_cron), передавая `{ jobId }`
- `get-job` — polling статуса для фронта
- `process-job` — воркер: Replicate (Flux Kontext) + polza.ai (gpt-4o-mini), пушит результат в TG-чат через бота
- `notify-bot` — служебная

### Как воркер выбирает job

**Состояние pg_cron (проверено 16.08.2026 на проде).** Расширение 1.6.4, обе задачи активны:

| Задача | Расписание | Состояние |
|---|---|---|
| `process-jobs-tick` | `* * * * *` (раз в минуту) | ⏳ SQL отрабатывает, `process-job` отвечает 403 — ждёт секрет в Vault |
| `process-jobs-watchdog` | `*/1 * * * *` | ✅ работает |

Здесь было **две** ошибки, обе из `0002_cron.sql`, обе чинились миграциями:

1. Тик читал настройки через `current_setting('app.project_ref' / 'app.internal_secret')`
   и падал с `unrecognized configuration parameter`. Выставить их **нельзя**: роль `postgres`
   в управляемом Supabase не суперюзер, `alter database ... set` отдаёт
   `42501: permission denied to set parameter`. **Шаг из DEPLOY.md с `alter database postgres set`
   нерабочий — не пытайся его повторить.** Починено `0014_cron_vault.sql`: project ref литералом
   (не секрет), секрет из Vault.
2. Расписание `*/10 * * * * *` с комментарием «каждые 10 секунд» на деле давало **раз в 10 минут**:
   pg_cron разбирает строку как пятипольный cron, `*/10` попадает в поле минут, шестое поле
   игнорируется (замерено — 6 запусков за час). Для sub-minute нужен интервал (`'10 seconds'`),
   а не шесть полей. Починено `0015_cron_schedule_fix.sql` — раз в минуту: тик нужен только как
   страховка на непроехавший фоновый fetch, а 10 секунд сожгли бы половину бесплатной квоты
   вызовов функций вхолостую.

Остался **один ручной шаг** — положить секрет в Vault (в репозиторий значение не попадает):

```sql
select vault.create_secret(
  '<значение INTERNAL_SECRET из секретов Edge Functions>',
  'internal_secret',
  'Секрет для вызова process-job из cron'
);
```

Проверить, что заработало (должен появиться `200` вместо `403`):

```sql
select status_code, count(*), max(created)
  from net._http_response
 where created > now() - interval '10 minutes'
 group by status_code;
```

Пока Vault пуст, тик шлёт пустой заголовок и получает 403 — очередь не разгребается,
единственный триггер — вызов из `create-job`. Watchdog при этом чинит зависшие
`processing`, но статус `created` не покрывает.

Поэтому воркер устроен так, чтобы ни один job не потерялся без рабочего тика:

1. `create-job` передаёт `{ jobId }` — воркер лочит именно его, а не «самый старый в очереди».
2. Если наш job уже забрали — идём по очереди, пробуя несколько кандидатов подряд
   (раньше проигранная гонка означала выход ни с чем, и чужой job мог осиротеть).
3. Перед выбором `sweepStale()` добивает зависшие: `processing` старше 5 мин → `failed: timeout`,
   `created` старше 15 мин → `failed: not_picked_up`. Первое дублирует рабочий watchdog,
   второе не покрыто больше ничем; система лечится при первом же действии любого юзера.
4. Фронт (`waitForJob`) сдаётся через 6 минут — спиннер больше не крутится вечно.
5. Rate-limit в `create-job` (2 активных job) не считает job старше 15 мин — иначе пара
   зависших блокировала юзера навсегда.

## Секреты

Все в Supabase Functions Secrets (через `supabase secrets set`):

- `BOT_TOKEN`, `REPLICATE_API_TOKEN`, `POLZA_API_KEY`, `INTERNAL_SECRET`
- `REPLICATE_MODEL=black-forest-labs/flux-kontext-pro`
- `POLZA_BASE_URL=https://api.polza.ai/api/v1`, `POLZA_MODEL=gpt-4o-mini`

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — Supabase выставляет автоматически, не нужно ставить руками.

На Vercel:
- `VITE_API_BASE_URL=https://mmegdmfmozgaycuyeacl.supabase.co/functions/v1`
- `VITE_SUPABASE_ANON_KEY=sb_publishable_...`

Конкретные значения секретов хранятся **только у пользователя** в его заметках. В чат не присылать — пользователь обещал ротировать.

## Известные блокеры

🟡 **Бот: статус спорный, перед действиями проверь.** Запись ниже сделана до 24.08.2026,
владелец 24.08.2026 сказал, что «всё работает» — но проверки `/start` в чате не было.
Прежде чем что-то деплоить, просто напиши боту `/start` и посмотри, отвечает ли.
Если да — удали этот блок, он вводит в заблуждение.

Что было записано раньше: Railway не поднят, `/start`, `/help`, `/app`, `/pricing` не отвечают.
Мини-апп при этом открывается (menu button) и реф-ссылки `?startapp=ref_CODE` работают — им бот-процесс не нужен.
Но пока юзер не начал диалог, Telegram запрещает боту писать первым, поэтому пуш результата
в чат из `process-job` возвращает 403. Такие провалы теперь пишутся в `ai_calls`
(provider=`telegram`) и видны в админке в «последних ошибках».
Деплой: `bot/railway.json` уже готов, нужен только сам проект на Railway (DEPLOY.md шаг 4).

✅ **`401 bad_signature`** — починено. Причина: Telegram с конца 2024 добавил в initData поле
`signature`, которое нужно исключать из `data_check_string` (коммит `b2d1731`).
Сейчас `auth.ts` валидирует через reference-валидатор `@telegram-apps/init-data-node`,
ручной HMAC остался вторым эшелоном для диагностики. Диагностика пишется только в логи функции —
наружу в 401 не отдаётся.

## Как продолжить

```powershell
$env:PATH = "$env:USERPROFILE\scoop\shims;$env:PATH"
$env:SUPABASE_ACCESS_TOKEN = '<sbp_... — спросить у юзера>'
Set-Location 'c:\Users\Слава\Desktop\зубтех'

# деплой одной функции
supabase functions deploy sign-upload --no-verify-jwt

# деплой всех функций
foreach ($fn in @('me','sign-upload','create-job','get-job','list-jobs','job-feedback',
                  'save-brand','admin','apply-referral','regen-hashtags',
                  'regen-brand-hashtags','notify-bot','process-job')) {
  supabase functions deploy $fn --no-verify-jwt
}

# фронт пушится сам через git push (Vercel auto-deploy)
cd app && npm run build           # проверка перед push
git add -A && git commit -m "..."
git push
```

Проверка перед деплоем (Deno стоит через scoop, `npm run typecheck` в app/ сломан — юзать `build`):

```powershell
deno test --allow-all supabase/functions/_shared/                  # заглушки env, см. ниже
deno check --allow-import supabase/functions/process-job/index.ts
```

Флаги у `test` и `check` разные, перепутать легко (проверено на Deno 2.9.5):
`--allow-all` и `--allow-import` **несовместимы** в `deno test` (первый уже включает
доступ к импортам), а у `deno check` нет `--allow-all` и без `--allow-import` он падает
на любом внешнем URL.

`_shared/env.ts` требует переменные на импорте, поэтому для тестов:
`$env:SUPABASE_URL='http://localhost'` + `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`REPLICATE_API_TOKEN`, `POLZA_API_KEY`, `BOT_TOKEN` — любые непустые значения.

## Гитарь

- main branch
- author: Нейробанда / neirobanda@gmail.com (локальный конфиг репо)

## Монетизация: баланс генераций, а не тарифы

**Тарифов Free/Pro больше нет.** У пользователя одно поле `users.credits` — остаток
генераций, который не сгорает и не обнуляется.

| Событие | Что происходит |
|---|---|
| Регистрация | `credits = 5` (default колонки) |
| Покупка пакета | `credits += 20 / 50 / 150` (700 / 1500 / 3500 ₽) |
| Обычная генерация `done` | `credits -= 1` |
| Генерация с декором `done` | `credits -= 3` |
| Реферальная награда, бонус из админки | `credits += N` |

Списание — триггером `spend_credits_on_done` по факту `done`: за упавшую генерацию
пользователь не платит. Гейт на входе — в `create-job`, отдаёт
`402 { error: 'insufficient_credits', needed, have }`.

**Стоимость живёт в двух местах и их надо менять синхронно:** `_shared/credits.ts`
(`COST_NORMAL` / `COST_DECOR`, для гейта) и SQL-функция `spend_credits_on_done`
в миграции `0016` (для списания). Триггер не может импортировать TypeScript, поэтому
дублирование сознательное; `credits_test.ts` фиксирует значения, чтобы расхождение
всплыло сразу.

**Почему ушли от подписки.** UI обещал «10 генераций в месяц», но ежемесячного сброса
в системе никогда не было: `usage_used := 0` стоял только в `apply_plan_limits`, который
срабатывает при *смене плана*, а `usage_period_start` писался и никем не читался.
Подписчик заплатил бы второй месяц и не получил бы новых генераций. Плюс автосписание
самозанятому в ЮKassa включается только через менеджера и может быть не согласовано,
а разовый платёж подключается без согласований.

Спек и план: `docs/superpowers/specs/2026-08-24-credit-packages-design.md`,
`docs/superpowers/plans/2026-08-24-credit-packages.md`.

## Дальше по плану

0. ✅ **Пакеты генераций в проде (24.08.2026).** Ветка `feat/credit-packages` влита в
   `main`, миграция `0016` применена, четыре функции (`create-job`, `me`, `admin`,
   `apply-referral`) задеплоены, `LIMITS_DISABLED=0` — списание включено.
   Перенос балансов сверен по всем 17 пользователям: сходится с формулой миграции.

   ⚠️ **`0016` сначала вставили руками через SQL Editor, мимо журнала миграций.**
   Потом журнал синхронизировали через `db push` — прогон прошёл вхолостую
   (`already exists, skipping`), балансы уцелели только благодаря защите из `5fea56f`.
   Мораль: применяй миграции через `db push`, иначе журнал врёт о состоянии базы.

1. 🔴 **Секрет в Vault неверный — cron до сих пор не работает.** В `vault.secrets`
   под именем `internal_secret` лежит текст плейсхолдера, а не сам секрет: команду
   выполнили, не заменив `'сюда_настоящий_INTERNAL_SECRET'`. Из-за этого тик получает
   403 и очередь не разгребается. Починка:
   ```sql
   select vault.update_secret(
     (select id from vault.secrets where name = 'internal_secret'),
     'настоящее значение INTERNAL_SECRET'
   );
   ```
   Проверить, не зная секрета, — сверить хеш с дайджестом из `supabase secrets list`:
   ```sql
   select encode(extensions.digest(decrypted_secret,'sha256'),'hex')
          = '<DIGEST столбца INTERNAL_SECRET>' as ok
     from vault.decrypted_secrets where name = 'internal_secret';
   ```
   Затем убедиться, что в `net._http_response` пошли `200` вместо `403`.

2. **На Vercel добавить `VITE_OWNER_TG=DanyaSanta`** и передеплоить: Vite вшивает env
   на сборке. Без неё кнопки покупки скрыты (это безопасный дефолт, не битая ссылка).

3. 🔴 **Бэкапов базы нет вообще** (Supabase: «LAST BACKUP: No backups»). Теперь в базе
   лежат балансы, за которые люди платят деньги — закрыть раньше остального.

4. **Бот нигде не запущен** — Railway не поднят, `/start` молчит, пуш результата в чат
   не доходит. Конфиг `bot/railway.json` готов, DEPLOY.md шаг 4.

5. Ротировать секреты, которые юзер шарил в чате (в т.ч. токен `sbp_…`).

6. Платёжный вебхук на сайте вне Telegram: он начисляет `credits` и зовёт
   `grantReferralReward()` напрямую, после чего можно удалить временный админ-экшн
   `mark-paid`. **Внутри мини-аппа платёжную ссылку показывать нельзя** — Telegram
   требует продавать цифровые товары внутри своих приложений только за Stars
   (`core.telegram.org/bots/payments-stars`). Сейчас кнопка «Купить» открывает чат
   с владельцем, счёт он выставляет вручную из кабинета ЮKassa.

7. Реферальный код теряется на `t.me/<bot>?start=ref_CODE` — бот payload не читает,
   работает только `?startapp=` на мини-апп. Чинить до запуска рекламы.

8. 152-ФЗ: в `users` лежат `first_name`, `last_name`, `photo_url` — это персональные
   данные, а база в Ирландии (`eu-west-1`). Вариант дешевле переезда — перестать их
   хранить и брать из initData на лету.
