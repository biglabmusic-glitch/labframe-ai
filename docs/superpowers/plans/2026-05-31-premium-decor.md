# Premium-режим «Индивидуальность» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать пользователям добавлять к фото работы один декоративный элемент/поверхность (пресет или свой текст); 3 бесплатных декор-генерации, дальше — подписка.

**Architecture:** Декор — отдельный шаг после выбора стиля. Для декор-job обходим AI-агента и собираем промт из статического шаблона (POSITION_LOCK + декор-блок + COMMON_OUTPUT_DECOR, где разрешён ровно один новый элемент). Пресеты резолвятся в `{surface, addition}` на бэке и сохраняются в job. Premium-лимит — отдельные поля `users.premium_used/premium_limit`, гейт в create-job, инкремент триггером при `done`.

**Tech Stack:** Supabase Edge Functions (Deno/TS), Postgres (миграции SQL), React + Vite + TS (фронт). Бэкенд-тесты — `Deno.test` (паттерн `referral_test.ts`). Фронт без тест-раннера → гейт `npm run build` (tsc + vite). Спек: [docs/superpowers/specs/2026-05-31-premium-decor-design.md](../specs/2026-05-31-premium-decor-design.md).

> **Замечание по запуску тестов:** по настройке проекта (CLAUDE.md, memory) `deno` локально не установлен и `npm run typecheck` сломан. Поэтому:
> - бэкенд-`Deno.test` — артефакт для CI/удалённого прогона; **локальный гейт бэкенда — визуальный review + деплой функции** (`supabase functions deploy <fn> --no-verify-jwt`);
> - фронт-гейт — `cd app && npm run build` (это и есть рабочая проверка типов в проекте).

---

## Структура файлов

**Бэкенд (создать):**
- `supabase/functions/_shared/decor.ts` — пресеты, `resolveDecor()`, `buildDecorPrompt()`, `COMMON_OUTPUT_DECOR`, `DEFAULT_SURFACE`. Чистая логика, без сетевых импортов.
- `supabase/functions/_shared/decor_test.ts` — Deno-тесты на `resolveDecor` и `buildDecorPrompt`.
- `supabase/migrations/0011_premium_decor.sql` — колонки job/users + триггер.

**Бэкенд (изменить):**
- `supabase/functions/_shared/replicate.ts` — ветка декора в `processImage`, поле `decor` в `ProcessImageInput`.
- `supabase/functions/create-job/index.ts` — приём `decorPreset/decorAddition`, гейт, сохранение.
- `supabase/functions/process-job/index.ts` — при наличии декора пропускаем агента, передаём `decor`.
- `supabase/functions/me/index.ts` — отдаём `premiumUsed/premiumLimit`.

**Фронт (создать):**
- `app/src/lib/presets.ts` — UI-список пресетов (id + RU-подпись + описание).
- `app/src/screens/ScreenIndividuality.tsx` — экран выбора декора.

**Фронт (изменить):**
- `app/src/state/types.ts` — `Draft.decor`, `User.premium`.
- `app/src/api/client.ts` — `CreateJobInput` + `MeResponse` поля, `friendlyError`.
- `app/src/state/AppContext.tsx` — маппинг premium из `/me`, дефолт в `buildInitialUser`.
- `app/src/router/Router.tsx` — route `individuality`.
- `app/src/App.tsx` — регистрация экрана.
- `app/src/screens/ScreenStyle.tsx` — push на `individuality`, StepBadge.
- `app/src/screens/{ScreenBranding,ScreenFormat,ScreenTextType,ScreenProcessing}.tsx` — StepBadge renumber.
- `app/src/screens/ScreenProcessing.tsx` — передать `decorPreset/decorAddition` в create-job.

---

## Task 1: Бэкенд — модуль пресетов и резолвер

**Files:**
- Create: `supabase/functions/_shared/decor.ts`
- Test: `supabase/functions/_shared/decor_test.ts`

- [ ] **Step 1: Написать `decor.ts`**

```typescript
// Декор-режим «Индивидуальность»: пресеты, резолвер и сборка статического промта.
// Чистая логика без сетевых импортов — тестируется через Deno.test (см. decor_test.ts).
// ВАЖНО: POSITION_LOCK добавляет replicate.ts ДО этого блока, COMMON_OUTPUT_DECOR — ПОСЛЕ.
import type { StyleId } from './replicate.ts';

export interface DecorPreset {
  id: string;
  surface: string;   // {{BASE_SURFACE}}
  addition: string;  // {{USER_ADDITION}}
}

// Источник истины набора пресетов. Фронт держит свой UI-список (presets.ts) с теми же id.
export const DECOR_PRESETS: Record<string, DecorPreset> = {
  snake:       { id: 'snake',       surface: 'black stone',             addition: 'a single elegant white snake resting beside the work' },
  amethyst:    { id: 'amethyst',    surface: 'dark marble',             addition: 'a small decorative amethyst crystal geode' },
  calligraphy: { id: 'calligraphy', surface: 'black velvet',            addition: 'two japanese ink brushes and subtle calligraphy in the background' },
  water:       { id: 'water',       surface: 'still water',             addition: 'subtle water ripples and a soft reflection' },
  stone:       { id: 'stone',       surface: 'a matte ceramic platform', addition: 'a minimal natural stone accent' },
  metal:       { id: 'metal',       surface: 'brushed metal',           addition: 'a premium metallic tray' },
};

export const DECOR_CUSTOM_ID = 'custom';

// Поверхность по умолчанию для «своего варианта» — берётся под выбранный стиль.
export const DEFAULT_SURFACE: Record<StyleId, string> = {
  clean: 'a clean matte white surface',
  soft:  'a soft neutral studio surface',
  dark:  'a dark premium matte surface',
};

export interface ResolvedDecor {
  surface: string;
  addition: string;
}

// Чистим текст «своего варианта»: одна строка, только буквы/цифры/базовая пунктуация, до 120 симв.
export function sanitizeAddition(s: string): string {
  return s
    .replace(/[\n\r]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s.,'\-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

// Резолвим выбор пользователя в финальную пару {surface, addition}.
// Возвращает null, если декора нет (пустой preset / неизвестный id / пустой custom-текст).
export function resolveDecor(
  preset: string | undefined | null,
  customAddition: string | undefined | null,
  style: StyleId,
): ResolvedDecor | null {
  if (!preset) return null;
  if (preset === DECOR_CUSTOM_ID) {
    const add = sanitizeAddition(customAddition ?? '');
    if (!add) return null;
    return { surface: DEFAULT_SURFACE[style], addition: add };
  }
  const p = DECOR_PRESETS[preset];
  if (!p) return null;
  return { surface: p.surface, addition: p.addition };
}

const DECOR_STYLE_BLOCK: Record<StyleId, string> = {
  clean: `STYLE:
clean white dental photography, bright minimal white background,
soft high-key studio lighting, clean medical aesthetic,
natural soft shadows, premium clinical portfolio presentation,
minimal and elegant composition.`,
  soft: `STYLE:
soft studio dental photography, smooth neutral beige background,
soft diffused lighting, gentle natural shadows, balanced contrast,
calm elegant studio atmosphere, minimal premium medical aesthetic.`,
  dark: `STYLE:
premium dark dental photography, dark graphite or luxury black background,
deep elegant shadows, soft directional studio lighting,
high contrast but realistic, cinematic dark studio mood,
luxury portfolio presentation.`,
};

// Средняя секция промта: стиль + поверхность + один декоративный элемент.
// POSITION_LOCK и COMMON_OUTPUT_DECOR навешивает replicate.ts.
export function buildDecorPrompt(style: StyleId, surface: string, addition: string): string {
  return `${DECOR_STYLE_BLOCK[style]}

BASE SURFACE:
Place the dental work on: ${surface}.
The base surface must look realistic, clean and premium, support the work naturally,
and must NOT distort, cover, hide, or alter the dental restoration or gypsum model.
Keep lighting, reflections, shadows and texture realistic and subtle.

ADDITIONAL DECORATIVE ELEMENT:
Add exactly one decorative element to the scene: ${addition}.
The element must be decorative and secondary. It must NOT touch, cover, hide, distort,
or overlap the dental restoration or gypsum model, and must NOT change its position,
angle, scale, color, anatomy or texture. Place it naturally in the background or around
the composition, with realistic lighting, perspective, shadows and reflections.
It should enhance the premium presentation without distracting from the dental work.`;
}

// Аналог COMMON_OUTPUT, но разрешает РОВНО ОДИН декоративный элемент + поверхность.
// Текст/руки/инструменты/изменения зуба по-прежнему запрещены. Снято только "no new scene".
export const COMMON_OUTPUT_DECOR = `Output:
single clean image, same framing as source, studio-quality final look.

You MAY add exactly one decorative element and the requested base surface as described above — nothing else new.

ABSOLUTELY NO TEXT in the image:
no signature, no watermark, no lab name, no brand name, no master name,
no logo, no caption, no letters, no numbers, no characters of any kind,
no autograph, no stamp, no website, no @handle, no copyright mark.
The frame must be completely free of any text or graphics.

Also forbidden:
no collage, no face, no patient, no blood, no clinical treatment scene,
no changed dental work, no changed position, no added hands, no fingers, no gloves, no instruments.`;
```

- [ ] **Step 2: Написать тест `decor_test.ts`**

```typescript
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { resolveDecor, buildDecorPrompt, sanitizeAddition, DECOR_PRESETS } from './decor.ts';

Deno.test('resolveDecor: известный пресет → его surface+addition', () => {
  const r = resolveDecor('snake', undefined, 'dark');
  assertEquals(r?.surface, DECOR_PRESETS.snake.surface);
  assertEquals(r?.surface, 'black stone');
  assertStringIncludes(r?.addition ?? '', 'white snake');
});

Deno.test('resolveDecor: custom → дефолтная поверхность по стилю + очищенный текст', () => {
  const r = resolveDecor('custom', '  белая змея!!! ', 'clean');
  assertEquals(r?.surface, 'a clean matte white surface');
  assertEquals(r?.addition, 'белая змея');
});

Deno.test('resolveDecor: пустой/неизвестный/пустой-custom → null', () => {
  assertEquals(resolveDecor(null, null, 'clean'), null);
  assertEquals(resolveDecor('', null, 'clean'), null);
  assertEquals(resolveDecor('nope', null, 'clean'), null);
  assertEquals(resolveDecor('custom', '   ', 'clean'), null);
});

Deno.test('sanitizeAddition: режет мусор и длину', () => {
  assertEquals(sanitizeAddition('a\nb'), 'a b');
  assertEquals(sanitizeAddition('snake <script>'), 'snake script');
  assertEquals(sanitizeAddition('x'.repeat(200)).length, 120);
});

Deno.test('buildDecorPrompt: содержит стиль, поверхность и элемент', () => {
  const p = buildDecorPrompt('dark', 'black stone', 'a white snake');
  assertStringIncludes(p, 'premium dark dental photography');
  assertStringIncludes(p, 'Place the dental work on: black stone');
  assertStringIncludes(p, 'a white snake');
  assertStringIncludes(p, 'exactly one decorative element');
});
```

- [ ] **Step 3: Прогнать тест (если есть deno; иначе пропустить локально)**

Run: `deno test supabase/functions/_shared/decor_test.ts`
Expected: `ok | 5 passed`. Если `deno` не установлен — пропусти, гейт этой задачи = ревью кода.

- [ ] **Step 4: Коммит**

```bash
git add supabase/functions/_shared/decor.ts supabase/functions/_shared/decor_test.ts
git commit -m "feat(decor): пресеты, резолвер и шаблон декор-промта + тесты"
```

---

## Task 2: Бэкенд — ветка декора в `replicate.ts`

**Files:**
- Modify: `supabase/functions/_shared/replicate.ts`

- [ ] **Step 1: Импортировать декор-модуль (после строки 3, рядом с импортом image-providers)**

```typescript
import { buildDecorPrompt, COMMON_OUTPUT_DECOR } from './decor.ts';
```

- [ ] **Step 2: Добавить поле `decor` в `ProcessImageInput` (внутри interface, после `customPrompt`)**

```typescript
  customPrompt?: string;             // если задан — используется вместо STYLE_PROMPT (см. agent.ts)
  decor?: { surface: string; addition: string }; // если задан — декор-ветка (минуя агента)
```

- [ ] **Step 3: Заменить сборку `prompt` в `processImage` (строки ~133-135)**

Было:
```typescript
  const prompt = input.customPrompt
    ? `${POSITION_LOCK}\n\n${input.customPrompt}\n\n${COMMON_OUTPUT}`
    : (input.logoUrl ? buildPromptWithLogo(input.style) : buildPrompt(input.style));
```
Стало:
```typescript
  const prompt = input.decor
    ? `${POSITION_LOCK}\n\n${buildDecorPrompt(input.style, input.decor.surface, input.decor.addition)}\n\n${COMMON_OUTPUT_DECOR}`
    : input.customPrompt
      ? `${POSITION_LOCK}\n\n${input.customPrompt}\n\n${COMMON_OUTPUT}`
      : (input.logoUrl ? buildPromptWithLogo(input.style) : buildPrompt(input.style));
```

- [ ] **Step 4: Проверка типов сборкой не покрывается (Deno) — ревью + деплой**

Run: `supabase functions deploy process-job --no-verify-jwt` (деплой подтянет replicate.ts; ошибки типов вылезут при деплое).
Expected: деплой без ошибок. Если деплой не делаешь сейчас — гейт = визуальный review импортов и ветвления.

- [ ] **Step 5: Коммит**

```bash
git add supabase/functions/_shared/replicate.ts
git commit -m "feat(decor): ветка декор-промта в processImage"
```

---

## Task 3: Бэкенд — миграция (колонки + триггер premium)

**Files:**
- Create: `supabase/migrations/0011_premium_decor.sql`

- [ ] **Step 1: Написать миграцию**

```sql
-- Premium-режим «Индивидуальность»: декор в jobs + отдельный счётчик premium у users.

-- jobs: что за декор был выбран (preset id, либо 'custom', либо NULL = без декора)
-- + резолвнутые surface/addition (их пишет create-job, читает process-job).
alter table public.jobs
  add column if not exists decor_preset   text,
  add column if not exists decor_surface  text,
  add column if not exists decor_addition text;

-- users: отдельный premium-лимит (3 бесплатных декор-генерации).
alter table public.users
  add column if not exists premium_used  int not null default 0,
  add column if not exists premium_limit int not null default 3;

-- Инкремент premium_used при done — ТОЛЬКО для job с декором.
create or replace function public.bump_premium_on_done()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'done'
     and (old.status is distinct from 'done')
     and new.decor_preset is not null then
    update public.users
       set premium_used = premium_used + 1
     where id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bump_premium_on_done on public.jobs;
create trigger trg_bump_premium_on_done
  after update on public.jobs
  for each row execute function public.bump_premium_on_done();
```

- [ ] **Step 2: Применить миграцию**

Run: `supabase db push` (или через рабочий деплой-флоу проекта).
Expected: `Applying migration 0011_premium_decor.sql... done`. Если не применяешь сейчас — гейт = SQL-ревью (идемпотентность `if not exists`, корректность условия триггера).

- [ ] **Step 3: Коммит**

```bash
git add supabase/migrations/0011_premium_decor.sql
git commit -m "feat(decor): миграция — decor-поля jobs + premium-счётчик users"
```

---

## Task 4: Бэкенд — `create-job`: приём декора, гейт, сохранение

**Files:**
- Modify: `supabase/functions/create-job/index.ts`

- [ ] **Step 1: Импортировать резолвер (после строки 7)**

```typescript
import { resolveDecor } from '../_shared/decor.ts';
```

- [ ] **Step 2: Расширить `Body` (внутри interface, после `textType`)**

```typescript
  textType: 'short' | 'sell' | 'tech' | 'none';
  decorPreset?: string;     // id пресета / 'custom' / отсутствует = без декора
  decorAddition?: string;   // текст для 'custom'
```

- [ ] **Step 3: После валидации обязательных полей (после блока `if (missing.length)`, ~строка 69) добавить резолв + гейт**

```typescript
  // Декор: резолвим выбор в {surface, addition}. null = декора нет.
  const decor = resolveDecor(body.decorPreset, body.decorAddition, body.style);

  // Premium-гейт: декор-генерации сверх лимита требуют подписки.
  if (decor) {
    const { data: u } = await db
      .from('users')
      .select('premium_used, premium_limit')
      .eq('id', tg.id)
      .maybeSingle();
    if ((u?.premium_used ?? 0) >= (u?.premium_limit ?? 3)) {
      return jsonResponse({ error: 'needs_subscription' }, { status: 402 });
    }
  }
```

- [ ] **Step 4: Добавить decor-поля в `insert` (внутри объекта `.insert({...})`, после `text_type`)**

```typescript
      text_type: body.textType ?? 'short',
      decor_preset:   decor ? body.decorPreset : null,
      decor_surface:  decor?.surface  ?? null,
      decor_addition: decor?.addition ?? null,
      status: 'created',
```

- [ ] **Step 5: Деплой/ревью**

Run: `supabase functions deploy create-job --no-verify-jwt`
Expected: деплой без ошибок. Иначе — гейт = ревью.

- [ ] **Step 6: Коммит**

```bash
git add supabase/functions/create-job/index.ts
git commit -m "feat(decor): create-job принимает декор, гейтит по premium-лимиту"
```

---

## Task 5: Бэкенд — `process-job`: пропустить агента при декоре

**Files:**
- Modify: `supabase/functions/process-job/index.ts`

- [ ] **Step 1: Перед блоком агента (~строка 59, где `const agentDisabled = ...`) вычислить флаг декора**

```typescript
    const hasDecor = Boolean(job.decor_preset);
    const agentDisabled = Deno.env.get('AGENT_DISABLED') === 'true';
    let agentResult: Awaited<ReturnType<typeof buildPersonalizedPrompt>> = null;

    if (!agentDisabled && !hasDecor) {
```

(добавлено `const hasDecor`; в условие `if` добавлено `&& !hasDecor`).

- [ ] **Step 2: Передать `decor` в `processImage` (заменить вызов ~строки 113-119)**

Было:
```typescript
    const img = await processImage({
      photoUrl,
      logoUrl,
      style:         job.style,
      format:        job.format,
      customPrompt:  agentResult?.prompt,
    });
```
Стало:
```typescript
    const img = await processImage({
      photoUrl,
      logoUrl,
      style:         job.style,
      format:        job.format,
      customPrompt:  hasDecor ? undefined : agentResult?.prompt,
      decor:         hasDecor ? { surface: job.decor_surface, addition: job.decor_addition } : undefined,
    });
```

- [ ] **Step 3: Деплой/ревью**

Run: `supabase functions deploy process-job --no-verify-jwt`
Expected: деплой без ошибок.

- [ ] **Step 4: Коммит**

```bash
git add supabase/functions/process-job/index.ts
git commit -m "feat(decor): process-job минует агента и шлёт декор в processImage"
```

---

## Task 6: Бэкенд — `me`: отдать premium-счётчик

**Files:**
- Modify: `supabase/functions/me/index.ts`

- [ ] **Step 1: Добавить поля в возвращаемый `user` (после `usageLimit`, ~строка 89)**

```typescript
      usageUsed:  user.usage_used ?? 0,
      usageLimit: user.usage_limit ?? 3,
      premiumUsed:  user.premium_used ?? 0,
      premiumLimit: user.premium_limit ?? 3,
```

- [ ] **Step 2: Деплой/ревью**

Run: `supabase functions deploy me --no-verify-jwt`
Expected: деплой без ошибок.

- [ ] **Step 3: Коммит**

```bash
git add supabase/functions/me/index.ts
git commit -m "feat(decor): /me отдаёт premiumUsed/premiumLimit"
```

---

## Task 7: Фронт — типы + UI-список пресетов

**Files:**
- Create: `app/src/lib/presets.ts`
- Modify: `app/src/state/types.ts`

- [ ] **Step 1: Создать `app/src/lib/presets.ts`**

```typescript
// UI-список декор-пресетов. id синхронны с бэком (supabase/functions/_shared/decor.ts).
// Тексты surface/addition живут на бэке — фронт их не дублирует.
export interface DecorPresetUI {
  id: string;
  ru: string;
  desc: string;
}

export const DECOR_PRESETS_UI: DecorPresetUI[] = [
  { id: 'snake',       ru: 'Белая змея',   desc: 'Чёрный камень и белая змея рядом.' },
  { id: 'amethyst',    ru: 'Аметист',      desc: 'Тёмный мрамор и друза аметиста.' },
  { id: 'calligraphy', ru: 'Каллиграфия',  desc: 'Чёрный бархат, кисти и иероглифы.' },
  { id: 'water',       ru: 'Вода',         desc: 'Гладь воды с лёгкими бликами.' },
  { id: 'stone',       ru: 'Камень',       desc: 'Матовая керамика и каменный акцент.' },
  { id: 'metal',       ru: 'Металл',       desc: 'Браш-металл и премиальный поднос.' },
];

export const DECOR_CUSTOM_ID = 'custom';
```

- [ ] **Step 2: В `types.ts` добавить `decor` в `Draft` (после `textType?`, строка 54)**

```typescript
  textType?: TextType;
  /** Декор: id пресета (или 'custom'); addition — только для custom. undefined = без декора. */
  decor?: { preset: string; addition?: string };
  status: JobStatus;
```

- [ ] **Step 3: В `types.ts` добавить `premium` в `User` (после `usage`, строка 22)**

```typescript
  usage: { used: number; limit: number; period: string };
  premium: { used: number; limit: number };
```

- [ ] **Step 4: Гейт сборкой (тип `User.premium` обязателен → поломает места без него; чиним в Task 9, но сначала фиксируем тип)**

Run: `cd app && npm run build`
Expected: ошибка про отсутствие `premium` в литералах `User` (в AppContext) — это ожидаемо, исправим в Task 9. Зафиксируй, что ошибка ИМЕННО про `premium`, не про presets.ts.

- [ ] **Step 5: Коммит**

```bash
git add app/src/lib/presets.ts app/src/state/types.ts
git commit -m "feat(decor): фронт-типы Draft.decor, User.premium + UI-пресеты"
```

---

## Task 8: Фронт — api-клиент

**Files:**
- Modify: `app/src/api/client.ts`

- [ ] **Step 1: Расширить `CreateJobInput` (после `textType`, строка 67)**

```typescript
  textType: TextType;
  decorPreset?: string;
  decorAddition?: string;
```

- [ ] **Step 2: Добавить premium-поля в `MeResponse.user` (после `usageLimit`, строка 86)**

```typescript
    usageUsed: number;
    usageLimit: number;
    premiumUsed?: number;
    premiumLimit?: number;
```

- [ ] **Step 3: Добавить ветку `needs_subscription` в `friendlyError` (перед блоком `usage_limit_reached`, ~строка 342)**

```typescript
  if (raw.includes('needs_subscription')) {
    return {
      title: 'Закончились бесплатные premium-генерации',
      sub:   'Оформите подписку в разделе «Тарифы», чтобы добавлять декор к работам.',
    };
  }
```

- [ ] **Step 4: Гейт сборкой (premium в AppContext всё ещё не починен — ок)**

Run: `cd app && npm run build`
Expected: та же ошибка про `premium` в AppContext (Task 9), но НЕ про client.ts.

- [ ] **Step 5: Коммит**

```bash
git add app/src/api/client.ts
git commit -m "feat(decor): api-клиент — декор в create-job, premium в /me, ошибка needs_subscription"
```

---

## Task 9: Фронт — AppContext: premium из `/me`

**Files:**
- Modify: `app/src/state/AppContext.tsx`

- [ ] **Step 1: Дефолт `premium` в обоих ветках `buildInitialUser` (строки ~52 и ~61)**

В ветке с `tg` (после `usage: { used: 0, limit: 3, period: 'месяц' },`):
```typescript
      usage: { used: 0, limit: 3, period: 'месяц' },
      premium: { used: 0, limit: 3 },
```
И в ветке «Гость» (после такой же строки `usage`):
```typescript
    usage: { used: 0, limit: 3, period: 'месяц' },
    premium: { used: 0, limit: 3 },
```

- [ ] **Step 2: Маппинг premium из `/me` (в `setUserState((p) => ({...}))`, после строки `usage: { used: me.user!.usageUsed, ... }`)**

```typescript
            usage:      { used: me.user!.usageUsed, limit: me.user!.usageLimit, period: 'месяц' },
            premium:    { used: me.user!.premiumUsed ?? 0, limit: me.user!.premiumLimit ?? 3 },
```

- [ ] **Step 3: Гейт сборкой — теперь должно собраться чисто**

Run: `cd app && npm run build`
Expected: `built in ...` без ошибок типов.

- [ ] **Step 4: Коммит**

```bash
git add app/src/state/AppContext.tsx
git commit -m "feat(decor): AppContext подтягивает premium-счётчик из /me"
```

---

## Task 10: Фронт — экран «Индивидуальность» + роутинг + проброс в create-job

**Files:**
- Create: `app/src/screens/ScreenIndividuality.tsx`
- Modify: `app/src/router/Router.tsx`, `app/src/App.tsx`, `app/src/screens/ScreenStyle.tsx`,
  `app/src/screens/ScreenBranding.tsx`, `app/src/screens/ScreenFormat.tsx`,
  `app/src/screens/ScreenTextType.tsx`, `app/src/screens/ScreenProcessing.tsx`

- [ ] **Step 1: Создать `app/src/screens/ScreenIndividuality.tsx`**

```tsx
import { useState } from 'react';
import { Screen } from '../components/Screen';
import { ScreenIntro } from '../components/ScreenIntro';
import { StepBadge } from '../components/StepBadge';
import { IconCheck } from '../components/primitives/icons';
import { useApp } from '../state/AppContext';
import { useMainButton } from '../telegram/useMainButton';
import { useBackButton } from '../telegram/useBackButton';
import { useRouter } from '../router/Router';
import { DECOR_PRESETS_UI, DECOR_CUSTOM_ID } from '../lib/presets';

export function ScreenIndividuality() {
  const { draft, setDraft, user } = useApp();
  const { push, back } = useRouter();
  const [customText, setCustomText] = useState(
    draft.decor?.preset === DECOR_CUSTOM_ID ? (draft.decor.addition ?? '') : '',
  );

  useBackButton(back);
  useMainButton({ text: 'Продолжить', onClick: () => push('brand'), enabled: true });

  const left = Math.max(0, (user.premium?.limit ?? 3) - (user.premium?.used ?? 0));
  const locked = left <= 0;
  const selectedId = draft.decor?.preset ?? 'none';

  const selectPreset = (id: string) => {
    if (id === 'none') { setDraft({ decor: undefined }); return; }
    if (locked) { push('pricing'); return; }
    if (id === DECOR_CUSTOM_ID) {
      setDraft({ decor: { preset: DECOR_CUSTOM_ID, addition: customText } });
      return;
    }
    setDraft({ decor: { preset: id } });
  };

  const Row = ({ id, title, sub }: { id: string; title: string; sub: string }) => {
    const selected = selectedId === id;
    const isLockable = id !== 'none' && locked;
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => selectPreset(id)}
        style={{
          display: 'flex', gap: 14, alignItems: 'center', padding: 14, paddingRight: 16,
          borderRadius: 22,
          background: selected ? 'var(--c-card-l)' : 'var(--c-card-d)',
          color: selected ? 'var(--c-ink)' : 'var(--c-on-dark)',
          border: selected ? 'none' : '1px solid var(--c-line)',
          opacity: isLockable ? 0.6 : 1,
          cursor: 'pointer',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.2 }}>
            {title}{isLockable ? ' 🔒' : ''}
          </div>
          <div style={{ fontSize: 11.5, opacity: selected ? 0.7 : 0.55, lineHeight: 1.35, marginTop: 2 }}>
            {sub}
          </div>
        </div>
        <div style={{
          width: 22, height: 22, borderRadius: 999,
          background: selected ? 'var(--c-ink)' : 'transparent',
          border: selected ? 'none' : '1.5px solid rgba(239,243,255,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {selected && <IconCheck size={13} color="var(--c-accent)" />}
        </div>
      </div>
    );
  };

  return (
    <Screen>
      <div style={{ padding: '12px 22px 14px' }}>
        <StepBadge n={4} total={8} />
      </div>
      <ScreenIntro
        title="Индивидуальность"
        sub={locked
          ? 'Бесплатные premium-генерации закончились — оформите подписку в «Тарифах».'
          : `Добавьте к работе декоративный элемент. Бесплатно осталось: ${left} из ${user.premium?.limit ?? 3}.`}
      />

      <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Row id="none" title="Без декора" sub="Чистый кадр, как обычно." />
        {DECOR_PRESETS_UI.map((p) => (
          <Row key={p.id} id={p.id} title={p.ru} sub={p.desc} />
        ))}
        <Row id={DECOR_CUSTOM_ID} title="Свой вариант" sub="Опишите элемент своими словами." />

        {selectedId === DECOR_CUSTOM_ID && !locked && (
          <textarea
            value={customText}
            onChange={(e) => {
              setCustomText(e.target.value);
              setDraft({ decor: { preset: DECOR_CUSTOM_ID, addition: e.target.value } });
            }}
            placeholder="например: белая змея рядом с работой"
            rows={2}
            maxLength={120}
            style={{
              width: '100%', resize: 'none', padding: 14, borderRadius: 16,
              background: 'var(--c-card-d)', color: 'var(--c-on-dark)',
              border: '1px solid var(--c-line)', fontSize: 14, fontFamily: 'inherit',
            }}
          />
        )}
      </div>
    </Screen>
  );
}
```

- [ ] **Step 2: Зарегистрировать route в `Router.tsx` (в union `RouteId`, после `'style'`, строка 17)**

```typescript
  | 'style'
  | 'individuality'
  | 'brand'
```

- [ ] **Step 3: Зарегистрировать экран в `App.tsx`**

Импорт (после строки 12 `import { ScreenStyle } ...`):
```typescript
import { ScreenStyle } from './screens/ScreenStyle';
import { ScreenIndividuality } from './screens/ScreenIndividuality';
```
В `REGISTRY` (после `style: ScreenStyle,`, строка 38):
```typescript
  style:           ScreenStyle,
  individuality:   ScreenIndividuality,
```

- [ ] **Step 4: В `ScreenStyle.tsx` — push на `individuality` (строка 99) и StepBadge total (строка 106)**

`onClick: () => push('brand'),` → `onClick: () => push('individuality'),`
`<StepBadge n={3} total={7} />` → `<StepBadge n={3} total={8} />`

- [ ] **Step 5: Renumber StepBadge в остальных экранах**

- `ScreenBranding.tsx:31` — `<StepBadge n={4} total={7} />` → `<StepBadge n={5} total={8} />`
- `ScreenFormat.tsx:41` — `<StepBadge n={5} total={7} />` → `<StepBadge n={6} total={8} />`
- `ScreenTextType.tsx:53` — `<StepBadge n={6} total={7} />` → `<StepBadge n={7} total={8} />`
- `ScreenProcessing.tsx:121` — `<StepBadge n={7} total={7} />` → `<StepBadge n={8} total={8} />`

(`ScreenUpload`=1, `ScreenWorkType`=2 не трогаем кроме total: ниже Step 6 — но эти два экрана тоже показывают `total={7}`; обнови и их.)

- [ ] **Step 6: Обновить total в `ScreenUpload.tsx:105` и `ScreenWorkType.tsx:33`**

- `ScreenUpload.tsx:105` — `<StepBadge n={1} total={7} />` → `<StepBadge n={1} total={8} />`
- `ScreenWorkType.tsx:33` — `<StepBadge n={2} total={7} />` → `<StepBadge n={2} total={8} />`

- [ ] **Step 7: Пробросить декор в create-job (`ScreenProcessing.tsx`, в объекте `api.createJob({...})`, после `textType:`, строка 80)**

```typescript
          textType:  draft.textType ?? 'short',
          decorPreset:   draft.decor?.preset,
          decorAddition: draft.decor?.addition,
```

- [ ] **Step 8: Гейт сборкой**

Run: `cd app && npm run build`
Expected: `built in ...` без ошибок. Пролистай вручную поток Стиль → Индивидуальность → Бренд в dev (`npm run dev`), убедись, что экран рендерится, «Без декора» выбран по умолчанию, «Свой вариант» открывает поле.

- [ ] **Step 9: Коммит**

```bash
git add app/src/screens/ScreenIndividuality.tsx app/src/router/Router.tsx app/src/App.tsx app/src/screens/ScreenStyle.tsx app/src/screens/ScreenBranding.tsx app/src/screens/ScreenFormat.tsx app/src/screens/ScreenTextType.tsx app/src/screens/ScreenProcessing.tsx app/src/screens/ScreenUpload.tsx app/src/screens/ScreenWorkType.tsx
git commit -m "feat(decor): экран «Индивидуальность» + роут + проброс декора в create-job"
```

---

## Финальная проверка

- [ ] `cd app && npm run build` — фронт собирается.
- [ ] (если deno доступен) `deno test supabase/functions/_shared/decor_test.ts` — зелёный.
- [ ] Деплой функций: `me`, `create-job`, `process-job` (`--no-verify-jwt`) + `supabase db push` для миграции 0011.
- [ ] E2E в TG: Фото → Стиль → выбрать пресет → пройти до конца → в чат приходит картинка с декором; повторить 3 раза → 4-я декор-генерация даёт экран «Тарифы» (или 402 → friendlyError). «Без декора» работает без лимита.
```
