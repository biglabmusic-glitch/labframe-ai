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
- `sign-upload` — подписанный PUT URL на bucket `photos`
- `create-job` — insert в `jobs`, триггерит `process-job` через `EdgeRuntime.waitUntil` (без pg_cron)
- `get-job` — polling статуса для фронта
- `process-job` — воркер: Replicate (Flux Kontext) + polza.ai (gpt-4o-mini), пушит результат в TG-чат через бота
- `notify-bot` — служебная

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

## Известные блокеры (на момент паузы)

🔴 **`401 bad_signature` от `sign-upload`** — HMAC проверка initData не сходится при загрузке фото из мини-аппа в Telegram. Уже исправлено:
1. ✅ Порядок HMAC: key=BOT_TOKEN, data="WebAppData" (было наоборот)
2. ✅ CORS: добавили `x-telegram-initdata` в `Access-Control-Allow-Headers`
3. ⏳ Если всё ещё `bad_signature` — посмотри `auth.ts` debug-вывод (возвращает `tg_hash_8`, `our_hash_8`, `keys`, `dcs_len`, `bot_id` в JSON). Скорее всего проблема в одном из:
   - порядок сортировки в `dataCheckString` (сортировать по ключу, не по строке `key=value`)
   - URL-encoding значений (`URLSearchParams` декодирует — это правильно, но проверь)
   - наличие лишних/невалидных полей в initData

## Как продолжить

```powershell
$env:PATH = "$env:USERPROFILE\scoop\shims;$env:PATH"
$env:SUPABASE_ACCESS_TOKEN = '<sbp_... — спросить у юзера>'
Set-Location 'c:\Users\Слава\Desktop\зубтех'

# деплой одной функции
supabase functions deploy sign-upload --no-verify-jwt

# деплой всех auth-функций
foreach ($fn in @('me','sign-upload','create-job','get-job','notify-bot','process-job')) {
  supabase functions deploy $fn --no-verify-jwt
}

# фронт пушится сам через git push (Vercel auto-deploy)
cd app && npm run build           # проверка перед push
git add -A && git commit -m "..."
git push
```

## Гитарь

- main branch
- author: Нейробанда / neirobanda@gmail.com (локальный конфиг репо)

## Дальше по плану

1. Починить `bad_signature` (см. блокер)
2. Прогнать end-to-end в TG: загрузка → AI → пуш в чат
3. Задеплоить бот на Railway (есть `bot/`, есть DEPLOY.md шаг 4)
4. Ротировать секреты, которые юзер шарил в чате
5. Telegram Stars payments (когда продукт подтвердится)
