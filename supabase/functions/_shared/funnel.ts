// Автоворонка: что и когда бот пишет новичку сам.
//
// Человек застревает на одном из этапов — не открыл приложение, открыл, но не
// загрузил работу, потратил бесплатные и не купил, пропал. На каждом этапе своя
// короткая цепочка сообщений. Раз в час функция funnel проверяет каждого и, если
// подошло время, шлёт ОДНО сообщение с одной главной кнопкой.
//
// Цепочка сама обрывается, когда человек сделал нужное: условия этапа
// проверяются заново при каждой отправке, а не запоминаются.
//
// Здесь только чистая логика без базы и сети — её проверяют тесты в funnel_test.ts.

import { PACKAGES } from './packages.ts';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Больше стольких сообщений воронки человек не получит никогда. */
export const MAX_MESSAGES = 7;
/** Не чаще одного сообщения в столько времени. */
export const MIN_GAP_MS = 22 * HOUR;
/** Только что был в приложении или в чате — не дёргаем, он и так здесь. */
export const RECENT_ACTIVITY_MS = 2 * HOUR;

export type StepId =
  | 'open_1' | 'open_2'
  | 'first_1' | 'first_2' | 'first_3'
  | 'community'
  | 'more_1'
  | 'pay_1' | 'pay_2'
  | 'invite'
  | 'paid_idle'
  | 'sleep';

/** Подписи этапов для админки. */
export const STEP_LABELS: Record<StepId, string> = {
  open_1:    'Не открыл приложение · 3 ч',
  open_2:    'Не открыл приложение · 2 дня',
  first_1:   'Не загрузил работу · 3 ч',
  first_2:   'Не загрузил работу · 2 дня',
  first_3:   'Не загрузил работу · 6 дней',
  community: 'Первый пост → канал и чат',
  more_1:    'Остались бесплатные · 1 день',
  pay_1:     'Бесплатные кончились · 1 день',
  pay_2:     'Бесплатные кончились · 5 дней',
  invite:    'Пригласить коллегу',
  paid_idle: 'Купил и пропал · 7 дней',
  sleep:     'Уснул · 14 дней',
};

/** Что считается «сработало» для этапа — для статистики в админке. */
export type StepGoal = 'open' | 'job' | 'payment' | null;

export const STEP_GOALS: Record<StepId, StepGoal> = {
  open_1: 'open', open_2: 'open',
  first_1: 'job', first_2: 'job', first_3: 'job',
  community: null,
  more_1: 'job',
  pay_1: 'payment', pay_2: 'payment',
  invite: null,
  paid_idle: 'job',
  sleep: 'job',
};

/** Состояние человека, собранное из базы. Время — в миллисекундах. */
export interface FunnelUser {
  createdAt: number;
  /** Дал согласие — значит, открывал приложение. */
  consentAt: number | null;
  lastSeenAt: number;
  credits: number;
  /** Работ всего, включая упавшие. */
  jobsTotal: number;
  jobsDone: number;
  firstDoneAt: number | null;
  thirdDoneAt: number | null;
  lastJobAt: number | null;
  /** Работа прямо сейчас в обработке. */
  activeJob: boolean;
  firstPaidAt: number | null;
  /** Уже отправленные шаги и когда. */
  sent: Partial<Record<StepId, number>>;
}

export interface FunnelOptions {
  /** Есть ли куда звать: канал или чат заданы. */
  hasCommunity: boolean;
}

interface Stage {
  applies: (u: FunnelUser, o: FunnelOptions) => boolean;
  anchor: (u: FunnelUser) => number | null;
  steps: Array<[StepId, number]>;
}

// Порядок важен: если созрели сразу два этапа, уходит тот, что выше.
const STAGES: Stage[] = [
  {
    // Нажал /start, но так и не открыл приложение.
    applies: (u) => u.consentAt === null && u.jobsTotal === 0,
    anchor: (u) => u.createdAt,
    steps: [['open_1', 3 * HOUR], ['open_2', 2 * DAY]],
  },
  {
    // Открыл, дал согласие, но не загрузил ни одной работы.
    applies: (u) => u.consentAt !== null && u.jobsTotal === 0,
    anchor: (u) => u.consentAt,
    steps: [['first_1', 3 * HOUR], ['first_2', 2 * DAY], ['first_3', 6 * DAY]],
  },
  {
    // Первый готовый пост — лучший момент позвать в канал и чат.
    applies: (u, o) => o.hasCommunity && u.jobsDone >= 1,
    anchor: (u) => u.firstDoneAt,
    steps: [['community', 2 * HOUR]],
  },
  {
    applies: (u) => u.jobsDone >= 1 && u.firstPaidAt === null && u.credits > 0,
    anchor: (u) => u.lastJobAt,
    steps: [['more_1', 1 * DAY]],
  },
  {
    applies: (u) => u.jobsDone >= 1 && u.firstPaidAt === null && u.credits <= 0,
    anchor: (u) => u.lastJobAt,
    steps: [['pay_1', 1 * DAY], ['pay_2', 5 * DAY]],
  },
  {
    // Зовём приглашать тех, кому уже нравится: три поста или покупка.
    applies: (u) => u.thirdDoneAt !== null || u.firstPaidAt !== null,
    anchor: (u) => minOf(u.thirdDoneAt, u.firstPaidAt),
    steps: [['invite', 1 * DAY]],
  },
  {
    applies: (u) => u.firstPaidAt !== null && u.credits > 0 && u.lastJobAt !== null,
    anchor: (u) => u.lastJobAt,
    steps: [['paid_idle', 7 * DAY]],
  },
  {
    applies: (u) => u.jobsDone >= 1 && !(u.firstPaidAt !== null && u.credits > 0),
    anchor: (u) => u.lastJobAt,
    steps: [['sleep', 14 * DAY]],
  },
];

function minOf(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

/** Какой шаг отправить сейчас. null — никакой. */
export function nextStep(u: FunnelUser, now: number, o: FunnelOptions): StepId | null {
  if (u.activeJob) return null;
  if (now - u.lastSeenAt < RECENT_ACTIVITY_MS) return null;

  const sentTimes = Object.values(u.sent) as number[];
  if (sentTimes.length >= MAX_MESSAGES) return null;
  if (sentTimes.length && now - Math.max(...sentTimes) < MIN_GAP_MS) return null;

  for (const stage of STAGES) {
    if (!stage.applies(u, o)) continue;
    const anchor = stage.anchor(u);
    if (anchor === null) continue;

    // Внутри этапа идём только вперёд: шаги до последнего отправленного
    // пропускаем, даже если их не слали. Если созрело несколько — например,
    // человек пропал, пока шли тихие часы, — шлём самый поздний, а не
    // догоняем его всей пачкой.
    let lastSent = -1;
    stage.steps.forEach(([id], i) => { if (u.sent[id] !== undefined) lastSent = i; });

    let due: StepId | null = null;
    for (let i = lastSent + 1; i < stage.steps.length; i++) {
      const [id, delay] = stage.steps[i];
      if (now >= anchor + delay) due = id;
    }
    if (due) return due;
  }
  return null;
}

/** Бот пишет только днём — с 10 до 20 по Москве. */
export function isDaytimeMoscow(now: number): boolean {
  const hour = (new Date(now).getUTCHours() + 3) % 24;
  return hour >= 10 && hour < 20;
}

// ─── Тексты ────────────────────────────────────────────────────────────────

export interface FunnelButton {
  text: string;
  url?: string;
  callback_data?: string;
  web_app?: { url: string };
}

export interface FunnelLinks {
  webAppUrl: string;
  channelUrl?: string;
  chatUrl?: string;
  /** Готовая ссылка «поделиться» с реферальным кодом — только для invite. */
  inviteUrl?: string;
}

export const CALLBACK_STOP = 'funnel:stop';
export const CALLBACK_PACKAGES = 'funnel:packs';

/**
 * Куда звать людей. Канал с обсуждением под постами — это одна ссылка на
 * двоих, и две кнопки на один и тот же адрес выглядели бы глупо.
 */
export function communityLinks(
  links: FunnelLinks,
): Array<{ url: string; label: string; where: string }> {
  const { channelUrl, chatUrl } = links;
  if (channelUrl && chatUrl && channelUrl !== chatUrl) {
    return [
      { url: channelUrl, label: 'Канал', where: 'в нашем канале' },
      { url: chatUrl, label: 'Чат техников', where: 'в чате техников' },
    ];
  }
  const single = channelUrl || chatUrl;
  return single ? [{ url: single, label: 'Канал техников', where: 'в нашем канале' }] : [];
}

/** 1 генерация, 2 генерации, 5 генераций. */
export function generations(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} генерация`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} генерации`;
  return `${n} генераций`;
}

/** «20 генераций — 700 ₽, в большом пакете выходит по 23 ₽ за пост». */
export function priceLine(): string {
  const byCredits = [...PACKAGES].sort((a, b) => a.credits - b.credits);
  const small = byCredits[0];
  const cheapest = Math.min(...PACKAGES.map((p) => Math.floor(p.priceRub / p.credits)));
  return `${generations(small.credits)} — ${small.priceRub} ₽, ` +
    `в большом пакете выходит по ${cheapest} ₽ за пост. Генерации не сгорают.`;
}

export function renderStep(
  step: StepId,
  u: FunnelUser,
  links: FunnelLinks,
): { text: string; buttons: FunnelButton[][] } {
  const open = (text: string): FunnelButton => ({ text, web_app: { url: links.webAppUrl } });
  const packs: FunnelButton = { text: 'Выбрать пакет', callback_data: CALLBACK_PACKAGES };
  const stop: FunnelButton[] = [{ text: 'Не присылать советы', callback_data: CALLBACK_STOP }];
  // Куда задавать вопросы: чат, если он отдельный, иначе канал с обсуждением.
  const ask = communityLinks(links).at(-1);
  const askButton: FunnelButton[] = ask ? [{ text: ask.label, url: ask.url }] : [];

  const reply = (text: string, main: FunnelButton[]) => ({ text, buttons: [main, stop] });

  switch (step) {
    case 'open_1':
      return reply(
        'Вы запустили LabFrame, но ещё не заглянули внутрь.\n\n' +
        'Как это работает: фотографируете коронку прямо на рабочем столе — через минуту ' +
        'получаете готовый пост с чистым фоном, логотипом лаборатории и подписью.\n\n' +
        'Первые генерации бесплатно.',
        [open('Открыть LabFrame')],
      );

    case 'open_2':
      return reply(
        'Пост о работе обычно съедает вечер: снять, вычистить фон, придумать текст.\n\n' +
        'В LabFrame на это уходит минута и одно фото. Попробуйте на работе, ' +
        'которая сейчас у вас на столе.',
        [open('Попробовать')],
      );

    case 'first_1':
      return reply(
        'Вы ещё ни разу не загрузили работу.\n\n' +
        'Подойдёт любое фото с телефона — даже на фоне гипса и инструментов. ' +
        'Фон уберём, свет выровняем, саму работу не трогаем.',
        [open('Загрузить работу')],
      );

    case 'first_2':
      return reply(
        'Что лучше всего получается в LabFrame:\n' +
        '• коронки и виниры крупным планом\n' +
        '• мосты на модели\n' +
        '• работа в руке или на пинцете\n\n' +
        'Снимайте при дневном свете, без вспышки — остальное сделает приложение.' +
        (u.credits > 0 ? `\n\nНа балансе ${generations(u.credits)}.` : ''),
        [open('Загрузить работу')],
      );

    case 'first_3':
      return reply(
        'Последнее напоминание об этом, дальше не побеспокою.\n\n' +
        (u.credits > 0 ? `У вас ${generations(u.credits)} — они ждут первой работы. ` : '') +
        (ask ? `Если что-то не получается или непонятно, спросите ${ask.where} — там подскажут.` : ''),
        [open('Загрузить работу'), ...askButton],
      );

    case 'community': {
      const places = communityLinks(links);
      const separate = places.length > 1;
      return reply(
        'Первый пост готов 👏\n\n' +
        (separate
          ? 'У LabFrame есть канал и чат зубных техников. В канале — примеры и новые стили, ' +
            'в чате делятся работами и спрашивают совета. Заходите и покажите свою.'
          : 'У LabFrame есть канал зубных техников: примеры, новые стили и обсуждение ' +
            'под постами. Заходите и покажите свою работу.'),
        places.map((p) => ({ text: p.label, url: p.url })),
      );
    }

    case 'more_1':
      return reply(
        `У вас осталось ${generations(u.credits)}.\n\n` +
        'Попробуйте ту же работу в другом стиле: на тёмном фоне керамика смотрится дороже, ' +
        'на светлом — чище. Посты в разных стилях удобно чередовать в ленте.',
        [open('Сделать ещё')],
      );

    case 'pay_1':
      return reply(
        'Бесплатные генерации закончились.\n\n' + priceLine(),
        [packs],
      );

    case 'pay_2':
      return reply(
        'Врачи выбирают техника глазами: регулярные посты с работами — самый простой ' +
        'способ показать уровень лаборатории.\n\n' + priceLine(),
        [packs],
      );

    case 'invite':
      return reply(
        'Нравится результат? Пригласите коллегу.\n\n' +
        'Когда он оплатит первый пакет, вам обоим начислим бонусные генерации.',
        [links.inviteUrl ? { text: 'Пригласить коллегу', url: links.inviteUrl } : open('Пригласить коллегу')],
      );

    case 'paid_idle':
      return reply(
        `На балансе ${generations(u.credits)} — они не сгорают.\n\n` +
        'За неделю наверняка накопились работы, которые стоит показать. На пост уходит минута.',
        [open('Загрузить работу')],
      );

    case 'sleep':
      return reply(
        'Две недели без новых постов.\n\n' +
        'Клиники смотрят ленту техника, прежде чем отдать работу, — пауза в ней заметна. ' +
        'Загрузите последнюю работу, пост будет готов через минуту.',
        [u.credits > 0 ? open('Загрузить работу') : packs],
      );
  }
}
