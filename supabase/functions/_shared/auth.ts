// Проверка Telegram initData — единственный способ доказать, что запрос
// действительно идёт из мини-аппа конкретного юзера.
// Алгоритм: https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app
import { env } from './env.ts';

export interface TgUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
  language_code?: string;
}

export class AuthError extends Error {
  constructor(public code: string) { super(code); }
}

export async function verifyInitData(initData: string): Promise<TgUser> {
  if (!initData) throw new AuthError('empty_initdata');

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw new AuthError('no_hash');
  params.delete('hash');
  // `signature` — ed25519-подпись Telegram для third-party валидации (с конца 2024).
  // Для bot-валидации через HMAC её нужно исключать из data_check_string,
  // иначе наш хеш не совпадёт с тем, что прислал Telegram.
  params.delete('signature');

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');

  // secret_key = HMAC_SHA256(key=bot_token, data="WebAppData")
  // KEY is bot_token, DATA is the literal string "WebAppData" — порядок важен.
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(env.BOT_TOKEN),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const secretKey = await crypto.subtle.sign('HMAC', keyMaterial, enc.encode('WebAppData'));

  // hash = HMAC_SHA256(data_check_string, secret_key)
  const finalKey = await crypto.subtle.importKey(
    'raw',
    secretKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', finalKey, enc.encode(dataCheckString));
  const sigHex = [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  if (sigHex !== hash) {
    // DEBUG: краткая инфа для ответа клиенту (без секретов)
    const err = new AuthError('bad_signature');
    (err as { debug?: unknown }).debug = {
      tg_hash_8: hash.slice(0, 8),
      our_hash_8: sigHex.slice(0, 8),
      keys: [...params.keys()].sort().join(','),
      dcs_len: dataCheckString.length,
      bot_id: env.BOT_TOKEN.split(':')[0],
    };
    console.error('initdata hash mismatch', (err as { debug?: unknown }).debug);
    throw err;
  }

  const userRaw = params.get('user');
  if (!userRaw) throw new AuthError('no_user');
  try {
    return JSON.parse(userRaw) as TgUser;
  } catch {
    throw new AuthError('user_parse_failed');
  }
}

/**
 * Безопасный wrapper, который возвращает либо TgUser, либо jsonResponse 401 с кодом ошибки.
 */
export async function authorize(req: Request): Promise<{ user: TgUser } | { response: Response }> {
  try {
    const user = await verifyInitData(req.headers.get('x-telegram-initdata') ?? '');
    return { user };
  } catch (e) {
    const code = e instanceof AuthError ? e.code : 'unknown';
    const debug = (e as { debug?: unknown }).debug;
    console.error('auth failed', code, debug);
    return {
      response: jsonResponse(
        { error: 'unauthorized', code, debug },
        { status: 401 },
      ),
    };
  }
}

const ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type, x-telegram-initdata, x-internal-secret';

export function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': ALLOWED_HEADERS,
      ...init?.headers,
    },
  });
}

export function corsPreflight() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': ALLOWED_HEADERS,
      'Access-Control-Max-Age': '86400',
    },
  });
}
