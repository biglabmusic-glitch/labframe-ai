// Минимальный клиент Telegram Bot API для пуша результата в чат.
import { env } from './env.ts';

const API = `https://api.telegram.org/bot${env.BOT_TOKEN}`;

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
      caption: caption ?? '',
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
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  if (!res.ok) throw new Error(`telegram sendMessage ${res.status}: ${await res.text()}`);
  return res.json();
}
