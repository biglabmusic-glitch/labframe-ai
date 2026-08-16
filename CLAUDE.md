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

pg_cron на проекте **не включён**, поэтому единственный триггер — вызов из `create-job`.
Из-за этого воркер устроен так, чтобы ни один job не потерялся без cron:

1. `create-job` передаёт `{ jobId }` — воркер лочит именно его, а не «самый старый в очереди».
2. Если наш job уже забрали — идём по очереди, пробуя несколько кандидатов подряд
   (раньше проигранная гонка означала выход ни с чем, и чужой job мог осиротеть).
3. Перед выбором `sweepStale()` добивает зависшие: `processing` старше 5 мин → `failed: timeout`,
   `created` старше 15 мин → `failed: not_picked_up`. Это дубль `0003_watchdog.sql` на случай,
   что pg_cron не работает; система лечится при первом же действии любого юзера.
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

🔴 **Бот нигде не запущен.** Railway не поднят, `/start`, `/help`, `/app`, `/pricing` не отвечают.
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
deno test --allow-all supabase/functions/_shared/    # нужны заглушки env, см. ниже
deno check supabase/functions/process-job/index.ts
```

`_shared/env.ts` требует переменные на импорте, поэтому для тестов:
`$env:SUPABASE_URL='http://localhost'` + `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`REPLICATE_API_TOKEN`, `POLZA_API_KEY`, `BOT_TOKEN` — любые непустые значения.

## Гитарь

- main branch
- author: Нейробанда / neirobanda@gmail.com (локальный конфиг репо)

## Дальше по плану

1. **Задеплоить бот на Railway** — единственный оставшийся блокер (DEPLOY.md шаг 4,
   конфиг `bot/railway.json` готов). Без этого `/start` молчит и пуш результата в чат не доходит.
2. Прогнать end-to-end в TG: загрузка → AI → пуш в чат
3. Ротировать секреты, которые юзер шарил в чате
4. Платёжный вебхук: он должен звать `grantReferralReward()` напрямую,
   после чего можно удалить временный админ-экшн `mark-paid`
5. Включить оплату — **два** флага с одинаковым смыслом, менять вместе:
   `LIMITS_DISABLED=0` в секретах Supabase (бэк начнёт применять лимиты в `create-job`)
   и `VITE_LIMITS_DISABLED=0` на Vercel (UI начнёт показывать лимиты и тарифы).
   Триггер `enforce_usage_limit` возвращать НЕ нужно — лимит теперь проверяется в `create-job`.
