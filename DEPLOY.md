# LabFrame AI — деплой

Пошагово. Не требуется DevOps-опыт.

## Что у нас есть

| Папка | Что | Куда деплоить |
|---|---|---|
| `app/` | React + Vite + TS + @twa-dev/sdk | **Vercel** |
| `bot/` | grammY бот, принимает `/start`, открывает мини-апп | **Railway** |
| (позже) Supabase | БД + Storage + Edge Functions (Image AI + Text AI) | **Supabase Cloud** |

---

## Шаг 1. Залить код на GitHub

1. На github.com создай приватный репозиторий `labframe-ai` (без `.gitignore`, без README — у нас уже свои).
2. В корне проекта (`c:\Users\Слава\Desktop\зубтех`):

```powershell
git init
git add .
git commit -m "LabFrame AI: initial scaffold (front + bot)"
git branch -M main
git remote add origin https://github.com/<твой-логин>/labframe-ai.git
git push -u origin main
```

---

## Шаг 2. Фронт на Vercel

1. Зайди на [vercel.com](https://vercel.com) → **Add New → Project** → подключить GitHub → выбрать `labframe-ai`.
2. **Root Directory** → нажми «Edit» → выбери `app`.
3. Framework Preset: **Vite** (определится сам).
4. **Deploy**. Через 30–60 секунд получишь URL вида `https://labframe-ai-xxxx.vercel.app`.

Запомни этот URL — нужен для следующих шагов.

> 💡 Vercel автоматически передеплоит при каждом `git push` в `main`. Это и есть автоматизация — ничего больше делать не надо.

---

## Шаг 3. Создать бота в Telegram

1. Открой [@BotFather](https://t.me/BotFather) в Telegram.
2. Команды по порядку:

```
/newbot
LabFrame AI
labframe_ai_bot         ← должен заканчиваться на _bot и быть свободным
```

BotFather пришлёт **HTTP API token** — сохрани, нужен для Railway.

3. Привязать мини-апп к боту:

```
/newapp
@labframe_ai_bot       ← твой бот
LabFrame AI            ← название
AI-студия для зубных техников   ← описание
```

4. BotFather попросит **фото 640×360** (заглушку можно сделать в Figma).
5. Дальше попросит **Web App URL** — вставь Vercel URL из Шага 2.
6. Дальше попросит **short name** — например `app`. BotFather пришлёт ссылку вида `t.me/labframe_ai_bot/app`.

7. Добавить кнопку меню (та, что снизу у любого чата с ботом):

```
/setmenubutton
@labframe_ai_bot
Открыть LabFrame AI
<твой Vercel URL>
```

**Уже сейчас** — открой `t.me/labframe_ai_bot/app` в Telegram и убедись, что мини-апп открывается и листается.

---

## Шаг 4. Бот на Railway

1. Зайди на [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo** → `labframe-ai`.
2. **Settings → Root Directory** → `bot`.
3. **Settings → Variables** — добавь:

| Ключ | Значение |
|---|---|
| `BOT_TOKEN` | токен от BotFather |
| `MINI_APP_URL` | Vercel URL из Шага 2 |
| `WEBHOOK_SECRET` | любая случайная строка (32+ символов) |

4. **Settings → Networking → Generate Domain** — получишь URL вида `https://labframe-ai-bot.up.railway.app`.
5. Добавь ещё одну переменную:

| Ключ | Значение |
|---|---|
| `WEBHOOK_URL` | `https://<railway-domain>/webhook` |

6. Railway сам передеплоит. Через минуту в логах увидишь `Webhook set to ...` и `Bot listening on :3000`.

7. Проверь в Telegram: напиши `/start` своему боту. Должно прийти сообщение с кнопкой «Открыть LabFrame AI ✨».

---

## Шаг 5. Что уже работает без тебя

- Любой `git push` в `main` → Vercel пересобирает фронт + Railway пересобирает бота. **Релиз = коммит.**
- Бот слушает webhook 24/7 на Railway.
- Vercel раздаёт фронт через CDN.
- **Стоимость:** Railway ~$5/мес, Vercel $0, BotFather $0. Итого $5/мес фикс.

---

## Шаг 6. Supabase: БД + Storage + Edge Functions

Код миграций и функций уже лежит в `supabase/`. Делаем по порядку.

### 6.1. Создать проект

1. [supabase.com](https://supabase.com) → **New project** → регион `EU Frankfurt`.
2. Сохрани **Project Ref** (часть домена `<ref>.supabase.co`) и **service_role key** (Settings → API).

### 6.2. Применить SQL-миграции

Settings → SQL Editor → New query. Выполни по очереди файлы из `supabase/migrations/`:

- `0001_init.sql` — таблицы, enum'ы, триггеры лимитов, buckets.
- `0002_cron.sql` — перед запуском раскомментируй и подставь свои значения:
  ```sql
  alter database postgres set app.project_ref = '<твой Project Ref>';
  alter database postgres set app.internal_secret = '<длинная случайная строка>';
  ```
  Затем включи `pg_cron` в **Database → Extensions** и запусти миграцию.

### 6.3. Установить Supabase CLI и задеплоить функции

```powershell
# Windows: качаем CLI
scoop install supabase   # либо из GitHub Releases напрямую

cd c:\Users\Слава\Desktop\зубтех
supabase login
supabase link --project-ref <твой Project Ref>

supabase functions deploy me
supabase functions deploy create-job
supabase functions deploy get-job
supabase functions deploy process-job
supabase functions deploy notify-bot
```

### 6.4. Задать секреты для Edge Functions

Supabase Dashboard → **Project Settings → Edge Functions → Add new secret**. Добавь:

| Ключ | Откуда |
|---|---|
| `BOT_TOKEN` | от BotFather (тот же, что в Railway) |
| `REPLICATE_API_TOKEN` | [replicate.com/account/api-tokens](https://replicate.com/account/api-tokens) |
| `POLZA_API_KEY` | [polza.ai/docs/glavnoe/quickstart](https://polza.ai/docs/glavnoe/quickstart) |
| `INTERNAL_SECRET` | та же случайная строка, что в `0002_cron.sql` |

Опционально (если хочешь сменить модели):

| `REPLICATE_MODEL` | по умолчанию `black-forest-labs/flux-kontext-pro` |
| `POLZA_MODEL`     | по умолчанию `gpt-4o-mini` |

### 6.5. Подключить фронт

В Vercel → Settings → Environment Variables:

| Ключ | Значение |
|---|---|
| `VITE_API_BASE_URL` | `https://<ref>.supabase.co/functions/v1` |
| `VITE_SUPABASE_ANON_KEY` | anon key из Settings → API |

Передеплой фронта (Vercel → Deployments → Redeploy).

### 6.6. Что теперь работает автоматически

1. Юзер в мини-аппе загружает фото → фронт PUT'ит его в bucket `photos` через подписанный URL.
2. Фронт зовёт `POST /create-job` → запись в БД со статусом `created`.
3. `pg_cron` каждые 10 сек дёргает `process-job` → берёт первый `created`, статус → `processing`.
4. `process-job` дёргает **Replicate** (Image AI), результат складывает в bucket `results`.
5. Параллельно дёргает **polza.ai** (Text AI) → текст + хэштеги в таблицу `jobs`.
6. Статус → `done`. `usage_used` инкрементируется триггером.
7. `process-job` шлёт `bot.sendPhoto(user_id, result_url)` → пользователь получает готовый пост в чат.
8. Мини-апп опросом видит `done` и показывает экран результата.

**Никаких ручных действий.** AI-вызовы залогированы в `ai_calls` (видно расходы).

---

## Шаг 7. Алерты, чтобы знать о проблемах

- **UptimeRobot** (бесплатно): добавь пинг `https://<railway>/health` каждые 5 минут. Если бот упал — придёт письмо.
- **Sentry** (бесплатно до 5k событий): подключим в `bot/` и `app/` для трейсов ошибок.
- Сделаем приватный Telegram-канал, куда бот шлёт сообщения о фейлах AI-вызовов.

---

## Локальная разработка

```powershell
# фронт
cd app
npm run dev          # http://localhost:5173

# бот (long polling, без webhook)
cd bot
copy .env.example .env
# открой .env и впиши BOT_TOKEN
npm run dev
```
