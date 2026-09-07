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
import {
  answerCallbackQuery,
  sendMessage,
  type KeyboardButton,
  type Markup,
} from '../_shared/telegram.ts';

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

/**
 * Верхняя строка — запуск мини-аппа. Адрес берём из env, а не хардкодим:
 * приложение может переехать, а перекатывать ради этого функцию не хочется.
 * Не задан — строку просто не показываем, кнопка меню чата никуда не делась.
 */
function appRow(): KeyboardButton[][] {
  const url = Deno.env.get('WEBAPP_URL') ?? '';
  return url ? [[{ text: 'Открыть LabFrame AI', webAppUrl: url }]] : [];
}

/** Обычное состояние: приложение и кнопка оплаты. */
function baseKeyboard(): Markup {
  return { keyboard: [...appRow(), [PAY_BUTTON]] };
}

/** После нажатия «Оплатить» — то же самое плюс строка пакетов. */
function buyKeyboard(): Markup {
  return { keyboard: [...appRow(), [PAY_BUTTON], PACKAGES.map(packageLabel)] };
}

interface TgFrom {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
}

interface Update {
  message?: { text?: string; chat?: { id: number }; from?: TgFrom };
  callback_query?: { id: string; data?: string; from?: TgFrom; message?: { chat?: { id: number } } };
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
  if (!from || !text || !chatId) return;

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
  if (!MENU_COMMANDS.includes(cmd)) return;

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
    await sendMessage(chatId, referralReply(res), baseKeyboard());
    return;
  }

  if (await blocked(from, chatId)) return;

  // /start просто знакомит с кнопками. Команду покупки набирают те, кто уже
  // решился, — им сразу раскрываем пакеты.
  await sendMessage(
    chatId,
    cmd === '/start' ? 'Здесь можно докупить генерации — кнопки ниже.' : PICK_TEXT,
    cmd === '/start' ? baseKeyboard() : buyKeyboard(),
  );
}

async function onCallback(cq: NonNullable<Update['callback_query']>) {
  const from = cq.from;
  const chatId = cq.message?.chat?.id;
  const data = cq.data ?? '';

  await answerCallbackQuery(cq.id);
  if (!from || !chatId || !data.startsWith(CALLBACK_PREFIX)) return;
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
