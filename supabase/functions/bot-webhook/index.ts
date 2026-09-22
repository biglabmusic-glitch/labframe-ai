// POST /bot-webhook — обработчик апдейтов Telegram. Нужен ровно для одного:
// продать пакет генераций прямо в чате, не трогая мини-апп.
//
// Зачем в обход аппа: внутри мини-аппа кнопка покупки — заглушка «Скоро»,
// а исходник фронта живёт отдельно от этого репозитория. Бот же целиком наш,
// поэтому канал продаж поднимается здесь и работает независимо от фронта.
//
// Покупка идёт БЕЗ ввода команд. Пакеты живут в постоянной клавиатуре над полем
// ввода: она не исчезает после нажатия, поэтому человек один раз её получает и
// дальше всегда покупает в одно касание. Команды (/kupit и синонимы) оставлены
// как запасной вход — например, если пользователь клавиатуру свернул.
//
// Telegram считает апдейт доставленным по коду 2xx и повторяет при ошибке,
// поэтому наружу почти всегда отдаём 200: повтор всё равно не починит ни
// незаданный секрет, ни отвалившийся sendMessage, а очередь засорит.
import { db } from '../_shared/db.ts';
import { PACKAGES, type CreditPackage } from '../_shared/packages.ts';
import { PaymentLinkError, buildPaymentLink } from '../_shared/payment-link.ts';
import { applyReferral, parseStartParam } from '../_shared/referral.ts';
import { CALLBACK_PACKAGES, CALLBACK_STOP, communityLinks } from '../_shared/funnel.ts';
import { answerCallbackQuery, sendMessage, type InlineButton, type Markup } from '../_shared/telegram.ts';

/** Кнопка под сообщением, открывающая мини-апп с авторизацией. */
function openAppButton(text = 'Открыть LabFrame'): InlineButton {
  return { text, web_app: { url: Deno.env.get('WEBAPP_URL') ?? 'https://labframe-ai.vercel.app/' } };
}

const WELCOME_BODY =
  'LabFrame превращает фото зубной работы в готовый пост для соцсетей: ' +
  'чистый фон, логотип лаборатории и подпись с хэштегами. На всё уходит минута.\n\n' +
  'Первые генерации — бесплатно. Нажмите кнопку ниже и загрузите работу 👇';

const WELCOME_TEXT = `Здравствуйте! ${WELCOME_BODY}`;

// Старые сообщения с inline-кнопками остаются в чатах у тех, кто уже жал их
// до перехода на постоянную клавиатуру. Обработчик колбэков держим ради них.
const CALLBACK_PREFIX = 'buy:';

// Команды-синонимы. В меню BotFather регистрируется только латиница, поэтому
// основная — /kupit, с описанием «Купить генерации» по-русски.
const MENU_COMMANDS = ['/start', '/kupit', '/купить', '/buy'];

/**
 * Подпись кнопки пакета. Одна функция и для сборки клавиатуры, и для разбора
 * нажатия — иначе подпись и разбор разъедутся при первой же правке текста.
 */
function packageLabel(p: CreditPackage): string {
  return `${p.credits} за ${p.priceRub} ₽`;
}

/** Пробелы и регистр Telegram не меняет, но пользователь может переслать текст. */
function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function packageByLabel(text: string): CreditPackage | undefined {
  const t = normalize(text);
  return PACKAGES.find((p) => normalize(packageLabel(p)) === t);
}

// Кнопка, раскрывающая пакеты. Отдельной строкой над ними: пока человек не
// собрался покупать, три цены в клавиатуре только занимают экран.
const PAY_BUTTON = '💳 Оплатить генерации';

const PICK_TEXT =
  'Выберите пакет — кнопки ниже.\n\n' +
  'Генерации не сгорают. Обычная работа стоит 1, с декором — 3.';

// Кнопки запуска мини-аппа в этой клавиатуре БЫТЬ НЕ ДОЛЖНО.
//
// Мини-апп, открытый кнопкой обычной клавиатуры, работает по другому протоколу:
// он не получает подписанных данных о пользователе и не может доказать, кто его
// открыл. Авторизация падает, баланс приходит нулём, и человек видит «генерации
// закончились» при полном счёте.
//
// Приложение открывается синей кнопкой меню чата — она рядом с полем ввода,
// видна всегда и запускается правильным способом. Дублировать её здесь незачем.
// Под сообщениями — другое дело: inline-кнопка web_app авторизацию передаёт.

/** Клавиатура оплаты: кнопка «Оплатить» и строка пакетов. */
function buyKeyboard(): Markup {
  return { keyboard: [[PAY_BUTTON], PACKAGES.map(packageLabel)] };
}

interface TgFrom {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
}

interface Update {
  message?: {
    text?: string;
    chat?: { id: number; type?: string };
    from?: TgFrom;
    photo?: unknown[];
    document?: unknown;
  };
  callback_query?: { id: string; data?: string; from?: TgFrom; message?: { chat?: { id: number } } };
  /** Человек заблокировал бота (kicked) или разблокировал (member). */
  my_chat_member?: {
    chat?: { id: number; type?: string };
    new_chat_member?: { status?: string };
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 });

  // Единственная защита эндпоинта: секрет, который Telegram шлёт в заголовке.
  // Без него любой желающий слал бы сюда поддельные апдейты и заставлял бота
  // писать в произвольные чаты. Не задан — отказываемся работать совсем.
  const expected = Deno.env.get('TG_WEBHOOK_SECRET') ?? '';
  if (!expected) {
    console.error('TG_WEBHOOK_SECRET не задан — апдейты не принимаем');
    return new Response('not_configured', { status: 500 });
  }
  if (req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== expected) {
    console.error('чужой запрос на bot-webhook: секрет не совпал');
    return new Response('forbidden', { status: 403 });
  }

  let update: Update;
  try {
    update = await req.json();
  } catch {
    return new Response('bad_json', { status: 400 });
  }

  try {
    if (update.callback_query) await onCallback(update.callback_query);
    else if (update.message) await onMessage(update.message);
    else if (update.my_chat_member) await onChatMember(update.my_chat_member);
  } catch (e) {
    // Логируем и всё равно подтверждаем: Telegram не должен долбить повторами.
    console.error('bot-webhook упал:', e instanceof Error ? e.message : e);
  }

  return new Response('ok');
});

async function onMessage(msg: NonNullable<Update['message']>) {
  const text = (msg.text ?? '').trim();
  const from = msg.from;
  const chatId = msg.chat?.id;
  if (!from || !chatId) return;

  // Отвечаем только в личке: если бота добавят в группу, он не должен
  // откликаться на каждое сообщение участников.
  const privateChat = !msg.chat?.type || msg.chat.type === 'private';

  // Прислали фото работы прямо в чат — частая ошибка новичка. Молчание здесь
  // выглядит как поломка, поэтому показываем, куда его загружать.
  if (!text) {
    if (!privateChat || !(msg.photo || msg.document)) return;
    if (await blocked(from, chatId)) return;
    await sendMessage(
      chatId,
      'Фото работ загружаются в приложении — там же выбирается фон, формат и подпись. ' +
      'Нажмите кнопку ниже 👇',
      { inline: [[openAppButton('Загрузить работу')]] },
    );
    return;
  }

  // Нажатие кнопки пакета — обычное текстовое сообщение с подписью кнопки.
  const pkg = packageByLabel(text);
  if (pkg) {
    if (await blocked(from, chatId)) return;
    await sendPaymentLink(from, chatId, pkg.id);
    return;
  }

  // Нажали «Оплатить» — раскрываем пакеты прямо в клавиатуре.
  if (normalize(text) === normalize(PAY_BUTTON)) {
    if (await blocked(from, chatId)) return;
    await sendMessage(chatId, PICK_TEXT, buyKeyboard());
    return;
  }

  // /kupit@labframe_bot тоже считается: в группах Telegram дописывает имя бота.
  const cmd = normalize(text).split(/[\s@]/)[0];
  if (!MENU_COMMANDS.includes(cmd)) {
    if (privateChat) await replyToFreeText(from, chatId);
    return;
  }

  // Переход из мини-аппа с уже выбранным пакетом: t.me/<bot>?start=buy_p50.
  // Там кнопка покупки не открывает платёжную страницу сама — Telegram разрешает
  // продавать цифровые товары внутри мини-аппов только за Stars, — поэтому апп
  // передаёт выбор боту, а ссылку на оплату выдаём уже здесь.
  const payload = text.trim().split(/\s+/)[1] ?? '';
  if (cmd === '/start' && payload.startsWith('buy_')) {
    if (await blocked(from, chatId)) return;
    await sendPaymentLink(from, chatId, payload.slice('buy_'.length).toLowerCase());
    return;
  }

  // Переход по пригласительной ссылке t.me/<bot>?start=ref_ZUB-XXXX.
  //
  // Мини-апп свои ссылки шлёт через startapp и разбирает сам, но код гуляет и
  // по чатам обычной ссылкой на бота — раньше её было некому прочитать, и
  // приглашение просто терялось. Теперь /start наш, и терять больше нечего.
  if (cmd === '/start' && payload.startsWith('ref_')) {
    if (await blocked(from, chatId)) return;
    const res = await applyReferral(from.id, parseStartParam(payload));
    // По приглашению приходят новички — им нужен не только ответ про бонус,
    // но и объяснение, что это за бот, и кнопка входа.
    await sendMessage(chatId, `${referralReply(res)}\n\n${WELCOME_BODY}`, {
      inline: [[openAppButton()]],
    });
    return;
  }

  if (await blocked(from, chatId)) return;

  // /start — первое, что видит новичок. Раньше здесь было «можно докупить
  // генерации»: человеку, который ещё ничего не пробовал, продавали пакеты.
  // Теперь объясняем, что делает бот, и ведём одной кнопкой в приложение.
  // Клавиатура оплаты появится, когда он сам пойдёт покупать.
  if (cmd === '/start') {
    await sendMessage(chatId, WELCOME_TEXT, { inline: [[openAppButton()]] });
    return;
  }

  // Команду покупки набирают те, кто уже решился, — им сразу раскрываем пакеты.
  await sendMessage(chatId, PICK_TEXT, buyKeyboard());
}

/**
 * Ответ на произвольный текст. Сообщения боту никто не читает, и молчание
 * выглядит как поломка — говорим об этом прямо и показываем, куда идти.
 */
async function replyToFreeText(from: TgFrom, chatId: number) {
  if (await blocked(from, chatId)) return;
  // Спрашивать людям лучше там, где им ответят: в чате, если он отдельный,
  // иначе в канале с обсуждением под постами.
  const ask = communityLinks({
    webAppUrl: '',
    channelUrl: Deno.env.get('CHANNEL_URL') || undefined,
    chatUrl: Deno.env.get('CHAT_URL') || undefined,
  }).at(-1);

  const buttons: InlineButton[] = [openAppButton()];
  if (ask) buttons.push({ text: ask.label, url: ask.url });

  await sendMessage(
    chatId,
    'Я бот и сообщения не читаю 🙂\n\n' +
    (ask
      ? `Работы загружаются в приложении, а вопрос можно задать ${ask.where} — там ответят.`
      : 'Работы загружаются в приложении — кнопка ниже.'),
    { inline: [buttons] },
  );
}

/** Заблокировал бота — не пишем ему. Разблокировал — снова можно. */
async function onChatMember(m: NonNullable<Update['my_chat_member']>) {
  const chatId = m.chat?.id;
  const status = m.new_chat_member?.status;
  if (!chatId || m.chat?.type !== 'private') return;

  if (status === 'kicked') {
    await db.from('users').update({ bot_blocked_at: new Date().toISOString() }).eq('id', chatId);
  } else if (status === 'member') {
    await db.from('users').update({ bot_blocked_at: null }).eq('id', chatId);
  }
}

async function onCallback(cq: NonNullable<Update['callback_query']>) {
  const from = cq.from;
  const chatId = cq.message?.chat?.id;
  const data = cq.data ?? '';

  // «Не присылать советы» под сообщением воронки. Отвечаем всплывашкой,
  // а не новым сообщением: человек как раз просил писать ему поменьше.
  if (data === CALLBACK_STOP) {
    if (from) {
      await db.from('users').update({ funnel_opt_out_at: new Date().toISOString() }).eq('id', from.id);
    }
    await answerCallbackQuery(cq.id, 'Хорошо, больше не пришлю советы');
    return;
  }

  await answerCallbackQuery(cq.id);
  if (!from || !chatId) return;

  // «Выбрать пакет» под сообщением воронки — показываем пакеты и заодно
  // ставим клавиатуру оплаты, чтобы в следующий раз она была под рукой.
  if (data === CALLBACK_PACKAGES) {
    if (await blocked(from, chatId)) return;
    await sendMessage(chatId, PICK_TEXT, buyKeyboard());
    return;
  }

  if (!data.startsWith(CALLBACK_PREFIX)) return;
  if (await blocked(from, chatId)) return;

  await sendPaymentLink(from, chatId, data.slice(CALLBACK_PREFIX.length));
}

/** Человеческий ответ на попытку применить приглашение. */
function referralReply(res: { ok: boolean; already?: boolean; reason?: string }): string {
  if (res.already) return 'Приглашение уже применено. Бонус придёт после первой оплаты.';
  if (res.ok) return 'Приглашение принято. После первой оплаты вам и пригласившему начислим бонусные генерации.';

  switch (res.reason) {
    case 'self':         return 'Нельзя пригласить самого себя.';
    case 'bad_code':     return 'Такого промокода нет — проверьте ссылку.';
    case 'already_paid': return 'Приглашение доступно только до первой оплаты.';
    case 'too_old':      return 'Приглашение доступно только новым пользователям.';
    default:             return 'Не получилось применить приглашение. Попробуйте позже.';
  }
}

/** Собирает ссылку и отправляет её кнопкой «Оплатить». */
async function sendPaymentLink(from: TgFrom, chatId: number, packageId: string) {
  try {
    const link = buildPaymentLink(from.id, packageId, `@${from.username ?? from.id}`);
    console.log(`ссылка через бота: юзер ${from.id}, ${link.orderId}, ${link.priceRub}₽`);

    await sendMessage(
      chatId,
      `Пакет: ${link.credits} генераций за ${link.priceRub} ₽.\n\n` +
      'Нажмите кнопку ниже — откроется страница оплаты. ' +
      'Генерации зачислятся автоматически сразу после оплаты.',
      { inline: [[{ text: `Оплатить ${link.priceRub} ₽`, url: link.url }]] },
    );
  } catch (e) {
    if (e instanceof PaymentLinkError) {
      if (e.code === 'not_configured') {
        console.error('PRODAMUS_FORM_URL не задан — продать не можем');
      }
      await sendMessage(
        chatId,
        e.code === 'unknown_package'
          ? 'Такого пакета нет — выберите кнопкой ниже.'
          : 'Оплата временно недоступна. Напишите нам, мы начислим генерации вручную.',
        buyKeyboard(),
      );
      return;
    }
    throw e;
  }
}

/**
 * Заводит юзера в БД (чтобы было кому начислять, когда придёт оплата)
 * и отсекает забаненных: иначе он оплатит, кредиты начислятся, а потратить
 * их он не сможет — и деньги придётся возвращать.
 */
async function blocked(from: TgFrom, chatId: number): Promise<boolean> {
  await db.from('users').upsert(
    {
      id: from.id,
      username:      from.username      ?? null,
      first_name:    from.first_name    ?? null,
      last_name:     from.last_name     ?? null,
      language_code: from.language_code ?? 'ru',
      last_seen_at:  new Date().toISOString(),
      // Написал сам — значит, снова доступен, даже если раньше блокировал.
      bot_blocked_at: null,
    },
    { onConflict: 'id', ignoreDuplicates: false },
  );

  const { data } = await db.from('users').select('banned').eq('id', from.id).maybeSingle();
  if (data?.banned) {
    await sendMessage(chatId, 'Покупка недоступна для этого аккаунта.');
    return true;
  }
  return false;
}
