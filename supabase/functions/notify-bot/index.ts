// POST /notify-bot — отправить произвольное сообщение пользователю.
// Используется ботом и другими функциями для пушей.
import { corsPreflight, jsonResponse } from '../_shared/auth.ts';
import { sendMessage, sendPhoto } from '../_shared/telegram.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight();
  const secret = req.headers.get('x-internal-secret');
  if (secret !== Deno.env.get('INTERNAL_SECRET')) {
    return jsonResponse({ error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json() as {
    chatId: number;
    text?: string;
    photoUrl?: string;
    caption?: string;
  };

  try {
    if (body.photoUrl) {
      await sendPhoto(body.chatId, body.photoUrl, body.caption);
    } else if (body.text) {
      await sendMessage(body.chatId, body.text);
    } else {
      return jsonResponse({ error: 'missing text or photoUrl' }, { status: 400 });
    }
    return jsonResponse({ ok: true });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
});
