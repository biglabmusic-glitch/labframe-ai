// Минимальный клиент Telegram Bot API для пуша результата в чат.
import { env } from './env.ts';

const API = `https://api.telegram.org/bot${env.BOT_TOKEN}`;

// Текст (подписи/сообщения) формируется из AI-вывода и пользовательских данных.
// Отправляем с parse_mode=HTML, поэтому любой '<', '>', '&' нужно экранировать —
// иначе Telegram отклонит сообщение (400) или исказит его. Сейчас разметку
// (жирный/ссылки) мы не используем, так что экранируем весь текст целиком.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function sendPhoto(
  chatId: number,
  photoUrl: string,
  caption?: string,
) {
  const res = await fetch(`${API}/sendPhoto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      photo: photoUrl,
      caption: escapeHtml(caption ?? ''),
      parse_mode: 'HTML',
    }),
  });
  if (!res.ok) throw new Error(`telegram sendPhoto ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Кнопка inline-клавиатуры: либо callback_data, либо url. */
export interface InlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

/**
 * Разметка сообщения. Два принципиально разных вида:
 *   inline   — кнопки под конкретным сообщением, уезжают вверх вместе с ним;
 *   keyboard — постоянная клавиатура над полем ввода, висит всегда и не требует
 *              от человека набирать команды.
 * Телеграм разрешает только одну разметку на сообщение, поэтому это union.
 */
export type Markup =
  | { inline: InlineButton[][] }
  | { keyboard: KeyboardButton[][] };

/**
 * Кнопка постоянной клавиатуры. Строка — обычная кнопка, она просто отправляет
 * свой текст сообщением. Объект с webAppUrl — кнопка запуска мини-аппа.
 * Кнопки с web_app работают только в личных чатах, нам этого достаточно.
 */
export type KeyboardButton = string | { text: string; webAppUrl: string };

function toKeyboardButton(b: KeyboardButton): Record<string, unknown> {
  return typeof b === 'string' ? { text: b } : { text: b.text, web_app: { url: b.webAppUrl } };
}

function toReplyMarkup(m: Markup): Record<string, unknown> {
  if ('inline' in m) return { inline_keyboard: m.inline };
  return {
    keyboard: m.keyboard.map((row) => row.map(toKeyboardButton)),
    resize_keyboard: true,   // не растягивать на пол-экрана
    is_persistent: true,     // не прятать после нажатия
  };
}

export async function sendMessage(
  chatId: number,
  text: string,
  markup?: Markup,
) {
  const res = await fetch(`${API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: escapeHtml(text),
      parse_mode: 'HTML',
      ...(markup ? { reply_markup: toReplyMarkup(markup) } : {}),
    }),
  });
  if (!res.ok) throw new Error(`telegram sendMessage ${res.status}: ${await res.text()}`);
  return res.json();
}

/**
 * Гасит «часики» на нажатой inline-кнопке. Telegram ждёт ответа несколько
 * секунд, иначе кнопка у пользователя так и висит в загрузке.
 */
export async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  const res = await fetch(`${API}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
  // Не критично: не успели — пользователь просто увидел часики.
  if (!res.ok) console.error(`telegram answerCallbackQuery ${res.status}: ${await res.text()}`);
}
