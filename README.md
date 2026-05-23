# LabFrame AI

AI-студия для зубных техников в формате Telegram Mini App. Фото работы → выбор стиля → готовый пост для Instagram.

## Структура репозитория

```
.
├── app/         — Telegram Mini App (React + Vite + TypeScript + @twa-dev/sdk)
├── bot/         — Telegram-бот (grammY, Railway)
├── supabase/    — БД, Storage, Edge Functions (Image AI + Text AI)
├── design/      — дизайн-референсы (HTML + JSX)
├── specs/       — ТЗ и пользовательские сценарии
├── HANDOFF.md   — дизайн-handoff для разработчиков
└── DEPLOY.md    — пошаговая инструкция по деплою
```

## Быстрый старт (локально)

```powershell
# фронт
cd app && npm install && npm run dev          # http://localhost:5173

# бот (long-polling)
cd bot && npm install
copy .env.example .env                         # подставь BOT_TOKEN
npm run dev
```

## Прод

См. [DEPLOY.md](DEPLOY.md). Кратко:

1. GitHub → Vercel (фронт)
2. @BotFather (бот + мини-апп)
3. Railway (бот, webhook)
4. Supabase (БД + Edge Functions + AI)

Каждый `git push` в `main` пересобирает фронт и бота автоматически.

## Технический стек

| Слой | Инструмент |
|---|---|
| Front | React 18, Vite, TypeScript, @twa-dev/sdk |
| Bot   | grammY, Node 22 |
| DB / Storage / Functions | Supabase (Postgres + pg_cron) |
| Image AI | Replicate (Flux Kontext) |
| Text AI  | polza.ai (gpt-4o-mini, OpenAI-совместимый) |

## Принципы продукта

См. [HANDOFF.md](HANDOFF.md) и [specs/](specs/).

**Главное:** AI меняет фон, свет, кадр и композицию. Анатомию, форму, цвет
зуботехнической работы **не трогает** — это страховка от юридических и
репутационных рисков (ТЗ §11.1).
