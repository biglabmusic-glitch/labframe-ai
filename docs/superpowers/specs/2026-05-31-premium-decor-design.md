# Premium-режим «Индивидуальность» — дизайн

Дата: 2026-05-31
Статус: согласован, готов к плану реализации

## Проблема и цель

Сейчас пайплайн жёстко сохраняет работу и **запрещает любые новые объекты** в кадре
(`COMMON_OUTPUT` в `replicate.ts`: `no new scene, no instruments`; агент: «запрети новые
объекты»). Это даёт чистые портфолио-кадры, но не даёт индивидуальности.

Цель: дать платным (а на старте — всем, с лимитом) пользователям возможность добавлять к
работе декоративный элемент/поверхность (как на референсах: змея, аметист, каллиграфия,
вода, камень, металл) — для узнаваемого авторского визуала. 3 бесплатных декор-генерации
на пользователя, дальше — подписка.

## Согласованные решения

1. **Выбор элемента:** гибрид — галерея пресетов + опция «свой вариант» (текст).
2. **Место в потоке:** отдельный экран после выбора стиля; декор ложится поверх любого из
   3 существующих стилей.
3. **Гейтинг:** отдельный premium-счётчик — 3 бесплатных декор-генерации, потом подписка.
   Обычные генерации (без декора) лимитом не ограничены.
4. **Движок промта:** статический шаблон (Approach A) — для декора обходим AI-агента,
   берём готовый premium-шаблон с подстановкой surface/addition.
5. **Набор пресетов:** смешанный — и смелые (змея, аметист, каллиграфия), и спокойные
   (камень, вода, металл).

## Поток экранов

Было: `Фото → Стиль → Бренд → Формат → Текст`
Стало: `Фото → Стиль → **Индивидуальность** → Бренд → Формат → Текст`

Новый экран `ScreenIndividuality`:
- Первая карточка — **«Без декора»**, выбрана по умолчанию (текущее поведение не меняется).
- Галерея пресетов: тап по карточке = выбор пары `{surface, addition}` сразу.
- Последняя карточка — **«+ Свой вариант»** → раскрывает текстовое поле под `{{USER_ADDITION}}`.
- На premium-карточках бейдж остатка («осталось 2 из 3») либо замок, если лимит исчерпан
  и нет активной подписки → тап ведёт на `ScreenPricing`.

## Пресеты (стартовый набор)

Каждый пресет — пара `{surface, addition}`. Набор — это данные, легко правится.

| id | Название (RU) | surface | addition |
|---|---|---|---|
| snake | Белая змея | black stone | white snake beside the work |
| amethyst | Аметист | dark marble | small decorative amethyst crystal / geode |
| calligraphy | Каллиграфия | black velvet | ink brushes + subtle japanese calligraphy in background |
| water | Вода | still water | subtle water ripples and soft reflection |
| stone | Камень | matte ceramic platform | minimal stone accent |
| metal | Металл | brushed metal | premium metallic tray |
| custom | + Свой вариант | (дефолт по стилю) | ← текст пользователя |

`custom`: surface берётся дефолтный под текущий стиль (clean→clean white surface,
soft→neutral surface, dark→dark premium surface), addition = текст пользователя (после
лёгкой санитизации/обрезки длины).

## Данные

### Миграция `0011_premium_decor.sql`

`jobs` — добавить:
- `decor_preset text` — id пресета, либо `'custom'`, либо `null` (нет декора).
- `decor_addition text` — финальная строка для `{{USER_ADDITION}}` (из таблицы пресетов
  или текст пользователя). surface вычисляется из пресета на бэке, отдельно не храним.

`users` — добавить:
- `premium_used int not null default 0`
- `premium_limit int not null default 3`

Триггер `bump_premium_on_done` (по аналогии с `bump_usage_on_done`): при переходе
`jobs.status` → `done`, **если** `decor_preset is not null`, инкрементить
`users.premium_used`.

`apply_plan_limits` (опц., на будущее): при апгрейде плана можно поднимать `premium_limit`
(free=3, start/pro/lab — больше/безлимит). На v1 не обязательно — оставляем 3 для всех,
гейт мягкий.

## Движок промта (Approach A)

В `supabase/functions/_shared/replicate.ts`:

1. **`COMMON_OUTPUT_DECOR`** — копия `COMMON_OUTPUT` с изменениями:
   - убрать `no new scene`;
   - добавить разрешение на **ровно один** декоративный элемент в фоне/рядом, который
     **не касается, не перекрывает и не меняет** зуб/гипс;
   - текст/подписи/водяные знаки, руки, пальцы, перчатки, инструменты, изменение зуба —
     по-прежнему запрещены.

2. **`buildDecorPrompt(style, surface, addition)`** — premium-шаблон пользователя
   (white→`clean`, beige→`soft`, black→`dark`) с подстановкой `{{BASE_SURFACE}}` и
   `{{USER_ADDITION}}`. **Блок `LOGO RULES` НЕ включаем** — логотип остаётся на canvas
   (фронт), как в текущей архитектуре.

3. **`processImage`** — расширить `ProcessImageInput` полем `decor?: { surface, addition }`.
   Если `decor` задан → промт = `POSITION_LOCK + buildDecorPrompt(...) + COMMON_OUTPUT_DECOR`,
   **минуя** `customPrompt`/STYLE_PROMPT.

4. **`process-job`** — если у job есть `decor_preset`, **не вызываем** `buildPersonalizedPrompt`
   (агента), а формируем surface из пресета и передаём `decor` в `processImage`.

## Гейтинг

В `supabase/functions/create-job/index.ts`:
- В `Body` добавить `decorPreset?: string`, `decorAddition?: string`.
- Если декор задан и `users.premium_used >= users.premium_limit` → `402 needs_subscription`.
- Иначе — insert job с `decor_preset` / `decor_addition`.
- «Без декора» (`decorPreset` пустой) — без проверки лимита.

Фронт:
- Ловит `402 needs_subscription` → показывает замок на premium-карточках, тап ведёт на
  `ScreenPricing`. Реальной оплаты пока нет (мягкий гейт; Telegram Stars — позже).
- Премиум-остаток (`premium_used`/`premium_limit`) фронт получает из `/me` (расширить ответ).

## Вне scope v1

- Агент-режим декора (Approach B) — позже.
- Отрисовка логотипа самой моделью — нет, остаётся canvas.
- Раздельный выбор surface и addition — пока бандл в пресете.
- Реальная оплата подписки — отдельная задача (Telegram Stars).

## Затрагиваемые файлы

- `supabase/migrations/0011_premium_decor.sql` (новый)
- `supabase/functions/_shared/replicate.ts` (декор-промт, COMMON_OUTPUT_DECOR)
- `supabase/functions/process-job/index.ts` (ветка декора, surface из пресета)
- `supabase/functions/create-job/index.ts` (приём полей, гейт)
- `supabase/functions/me/index.ts` (отдавать premium_used/premium_limit)
- `app/src/state/types.ts`, `app/src/state/AppContext.tsx` (draft.decor)
- `app/src/screens/ScreenIndividuality.tsx` (новый), router, ScreenStyle (push на новый экран)
- `app/src/lib/presets.ts` (новый — таблица пресетов, общая для фронта; surface-маппинг
  дублируется на бэке, как уже сделано для шрифтов)
- `app/src/lib/api.ts` (передача decor в create-job, обработка 402)
