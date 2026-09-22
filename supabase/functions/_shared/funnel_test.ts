import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  type FunnelUser,
  MAX_MESSAGES,
  generations,
  isDaytimeMoscow,
  nextStep,
  renderStep,
} from './funnel.ts';

const H = 60 * 60 * 1000;
const D = 24 * H;
const T0 = Date.UTC(2026, 8, 17, 9, 0); // 12:00 по Москве

const WITH_COMMUNITY = { hasCommunity: true };
const NO_COMMUNITY = { hasCommunity: false };

/** Новичок: нажал /start в T0 и больше ничего не делал. */
function user(patch: Partial<FunnelUser> = {}): FunnelUser {
  return {
    createdAt: T0,
    consentAt: null,
    lastSeenAt: T0,
    credits: 3,
    jobsTotal: 0,
    jobsDone: 0,
    firstDoneAt: null,
    thirdDoneAt: null,
    lastJobAt: null,
    activeJob: false,
    firstPaidAt: null,
    sent: {},
    ...patch,
  };
}

Deno.test('не открыл приложение: через 3 часа первое, через 2 дня второе', () => {
  assertEquals(nextStep(user(), T0 + 2 * H, NO_COMMUNITY), null);
  assertEquals(nextStep(user(), T0 + 3 * H, NO_COMMUNITY), 'open_1');
  assertEquals(nextStep(user({ sent: { open_1: T0 + 3 * H } }), T0 + D, NO_COMMUNITY), null);
  assertEquals(nextStep(user({ sent: { open_1: T0 + 3 * H } }), T0 + 2 * D, NO_COMMUNITY), 'open_2');
  assertEquals(
    nextStep(user({ sent: { open_1: T0 + 3 * H, open_2: T0 + 2 * D } }), T0 + 30 * D, NO_COMMUNITY),
    null,
  );
});

Deno.test('открыл приложение — цепочка «не открыл» обрывается', () => {
  const opened = user({ consentAt: T0 + H, lastSeenAt: T0 + H, sent: { open_1: T0 + 3 * H } });
  assertEquals(nextStep(opened, T0 + D, NO_COMMUNITY), null); // с open_1 не прошло 22 часа
  assertEquals(nextStep(opened, T0 + D + 2 * H, NO_COMMUNITY), 'first_1');
  assertEquals(nextStep(opened, T0 + 3 * D, NO_COMMUNITY), 'first_2');
});

Deno.test('проспали несколько шагов — шлём самый поздний, а не всю пачку', () => {
  const opened = user({ consentAt: T0, lastSeenAt: T0 });
  assertEquals(nextStep(opened, T0 + 7 * D, NO_COMMUNITY), 'first_3');
  // И к ранним шагам после этого не возвращаемся.
  assertEquals(nextStep({ ...opened, sent: { first_3: T0 + 7 * D } }, T0 + 9 * D, NO_COMMUNITY), null);
});

Deno.test('недавняя активность и работа в процессе — молчим', () => {
  assertEquals(nextStep(user({ lastSeenAt: T0 + 3 * H }), T0 + 4 * H, NO_COMMUNITY), null);
  assertEquals(nextStep(user({ activeJob: true }), T0 + 5 * H, NO_COMMUNITY), null);
});

Deno.test('не чаще раза в 22 часа и не больше лимита', () => {
  const recently = user({ sent: { invite: T0 + 2 * H } });
  assertEquals(nextStep(recently, T0 + 10 * H, NO_COMMUNITY), null);

  const many: FunnelUser['sent'] = {};
  const ids = ['first_1', 'first_2', 'first_3', 'community', 'more_1', 'pay_1', 'pay_2'] as const;
  ids.slice(0, MAX_MESSAGES).forEach((id, i) => { many[id] = T0 - (i + 30) * D; });
  assertEquals(nextStep(user({ sent: many }), T0 + 5 * H, NO_COMMUNITY), null);
});

Deno.test('первый пост: зовём в канал, только если он задан', () => {
  const done = user({
    consentAt: T0, lastSeenAt: T0, jobsTotal: 1, jobsDone: 1, credits: 2,
    firstDoneAt: T0, lastJobAt: T0,
  });
  assertEquals(nextStep(done, T0 + 3 * H, WITH_COMMUNITY), 'community');
  assertEquals(nextStep(done, T0 + 3 * H, NO_COMMUNITY), null);
  assertEquals(nextStep(done, T0 + D, NO_COMMUNITY), 'more_1');
});

Deno.test('бесплатные кончились и не купил — предлагаем пакет', () => {
  const empty = user({
    consentAt: T0, lastSeenAt: T0, jobsTotal: 3, jobsDone: 3, credits: 0,
    firstDoneAt: T0, thirdDoneAt: T0, lastJobAt: T0,
    sent: { community: T0 - 30 * D },
  });
  assertEquals(nextStep(empty, T0 + D, WITH_COMMUNITY), 'pay_1');
  assertEquals(nextStep({ ...empty, sent: { ...empty.sent, pay_1: T0 + D } }, T0 + 5 * D, WITH_COMMUNITY), 'pay_2');
});

Deno.test('купил — продажи замолкают, зовём приглашать и напоминаем о балансе', () => {
  const paid = user({
    consentAt: T0, lastSeenAt: T0, jobsTotal: 2, jobsDone: 2, credits: 20,
    firstDoneAt: T0, lastJobAt: T0, firstPaidAt: T0,
    sent: { community: T0 - 30 * D, pay_1: T0 - 20 * D },
  });
  assertEquals(nextStep(paid, T0 + D, WITH_COMMUNITY), 'invite');
  const invited = { ...paid, sent: { ...paid.sent, invite: T0 + D } };
  assertEquals(nextStep(invited, T0 + 6 * D, WITH_COMMUNITY), null);
  assertEquals(nextStep(invited, T0 + 7 * D, WITH_COMMUNITY), 'paid_idle');
});

Deno.test('работа упала и больше ничего — «не загрузили работу» не пишем', () => {
  const failed = user({ consentAt: T0, lastSeenAt: T0, jobsTotal: 1, lastJobAt: T0 });
  assertEquals(nextStep(failed, T0 + 3 * D, NO_COMMUNITY), null);
});

Deno.test('пишем только днём по Москве', () => {
  assertEquals(isDaytimeMoscow(Date.UTC(2026, 8, 17, 6, 59)), false); // 09:59
  assertEquals(isDaytimeMoscow(Date.UTC(2026, 8, 17, 7, 0)), true);   // 10:00
  assertEquals(isDaytimeMoscow(Date.UTC(2026, 8, 17, 16, 59)), true); // 19:59
  assertEquals(isDaytimeMoscow(Date.UTC(2026, 8, 17, 17, 0)), false); // 20:00
});

Deno.test('склонение генераций', () => {
  assertEquals(generations(1), '1 генерация');
  assertEquals(generations(3), '3 генерации');
  assertEquals(generations(5), '5 генераций');
  assertEquals(generations(11), '11 генераций');
  assertEquals(generations(21), '21 генерация');
  assertEquals(generations(22), '22 генерации');
});

Deno.test('одна ссылка на канал с чатом — одна кнопка, а не две одинаковых', () => {
  const one = renderStep('community', user(), { webAppUrl: 'https://app/', channelUrl: 'https://t.me/+abc', chatUrl: 'https://t.me/+abc' });
  assertEquals(one.buttons[0].length, 1);
  assertEquals(one.buttons[0][0].url, 'https://t.me/+abc');

  const two = renderStep('community', user(), { webAppUrl: 'https://app/', channelUrl: 'https://t.me/c', chatUrl: 'https://t.me/g' });
  assertEquals(two.buttons[0].map((b) => b.url), ['https://t.me/c', 'https://t.me/g']);
});

Deno.test('у каждого сообщения есть кнопка отписки', () => {
  const links = { webAppUrl: 'https://app/', channelUrl: 'https://t.me/c', chatUrl: 'https://t.me/g' };
  const ids = ['open_1', 'open_2', 'first_1', 'first_2', 'first_3', 'community', 'more_1',
    'pay_1', 'pay_2', 'invite', 'paid_idle', 'sleep'] as const;
  for (const id of ids) {
    const { text, buttons } = renderStep(id, user({ credits: 2 }), links);
    assertEquals(text.length > 0, true);
    assertEquals(buttons.at(-1)?.[0].text, 'Не присылать советы');
    assertEquals(buttons[0].length > 0, true, `у ${id} нет главной кнопки`);
  }
  assertStringIncludes(renderStep('pay_1', user(), links).text, '700 ₽');
});
