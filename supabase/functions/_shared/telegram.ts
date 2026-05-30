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

export async function sendMessage(chatId: number, text: string) {
  const res = await fetch(`${API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: escapeHtml(text), parse_mode: 'HTML' }),
  });
  if (!res.ok) throw new Error(`telegram sendMessage ${res.status}: ${await res.text()}`);
  return res.json();
}
