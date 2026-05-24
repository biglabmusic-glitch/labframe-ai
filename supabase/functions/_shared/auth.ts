// Проверка Telegram initData — единственный способ доказать, что запрос
// действительно идёт из мини-аппа конкретного юзера.
// Алгоритм: https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app
// Reference-валидатор от ядра telegram-apps — используем его как первый эшелон,
// наш ручной HMAC оставлен как запасной для диагностики.
import { validate as refValidate } from 'https://esm.sh/@telegram-apps/init-data-node@2.0.5';
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

  const token = env.BOT_TOKEN;
  const trimmedToken = token.trim();
  const tokenHasWhitespace = token !== trimmedToken;

  // 1) Эшелон один: reference-валидатор от ядра telegram-apps.
  //    Если он скажет ok — мы точно знаем, что initData валидный.
  let refOk = false;
  let refErr = '';
  try {
    await refValidate(initData, trimmedToken, { expiresIn: 86400 });
    refOk = true;
  } catch (e) {
    refErr = e instanceof Error ? e.message : String(e);
  }

  // Парсим initData в любом случае (нужны user, плюс diagnostics)
  const rawPairs: Array<[string, string]> = [];
  let hash = '';
  for (const pair of initData.split('&')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const key = pair.slice(0, eq);
    const rawValue = pair.slice(eq + 1);
    if (key === 'hash') { hash = rawValue; continue; }
    if (key === 'signature') continue; // ed25519, исключаем из data_check_string
    rawPairs.push([key, rawValue]);
  }
  if (!hash) throw new AuthError('no_hash');

  // 2) Эшелон два: наш ручной HMAC обоими способами (raw vs decoded). Только для диагностики.
  const sortedRaw = [...rawPairs].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const dcsRaw     = sortedRaw.map(([k, v]) => `${k}=${v}`).join('\n');
  const dcsDecoded = sortedRaw.map(([k, v]) => `${k}=${decodeURIComponent(v)}`).join('\n');

  const enc = new TextEncoder();
  const km = await crypto.subtle.importKey('raw', enc.encode(trimmedToken),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const secretKey = await crypto.subtle.sign('HMAC', km, enc.encode('WebAppData'));
  const fk = await crypto.subtle.importKey('raw', secretKey,
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const hexOf = async (s: string): Promise<string> => {
    const sig = await crypto.subtle.sign('HMAC', fk, enc.encode(s));
    return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  };
  const sigRaw     = await hexOf(dcsRaw);
  const sigDecoded = await hexOf(dcsDecoded);
  const ourMatch   = sigRaw === hash ? 'raw' : sigDecoded === hash ? 'decoded' : null;

  if (!refOk && !ourMatch) {
    const err = new AuthError('bad_signature');
    (err as { debug?: unknown }).debug = {
      ref_err: refErr.slice(0, 80),
      tg_hash_8: hash.slice(0, 8),
      raw_hash_8: sigRaw.slice(0, 8),
      dec_hash_8: sigDecoded.slice(0, 8),
      keys: sortedRaw.map(([k]) => k).join(','),
      dcs_raw_len: dcsRaw.length,
      dcs_dec_len: dcsDecoded.length,
      bot_id: trimmedToken.split(':')[0],
      bot_tok_len: trimmedToken.length,           // должно быть ~46 для типичного токена
      bot_tok_ws: tokenHasWhitespace,              // true = в env лишний whitespace
      bot_tok_pref: trimmedToken.slice(0, 13),     // 13 символов хватит для сравнения с BotFather
    };
    console.error('initdata hash mismatch', (err as { debug?: unknown }).debug);
    throw err;
  }
  console.log('initdata validated via', refOk ? 'ref' : ourMatch);

  const userRawPair = rawPairs.find(([k]) => k === 'user');
  if (!userRawPair) throw new AuthError('no_user');
  try {
    return JSON.parse(decodeURIComponent(userRawPair[1])) as TgUser;
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
