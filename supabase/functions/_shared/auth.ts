import { validate as refValidate } from 'npm:@telegram-apps/init-data-node@2.0.5';
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
  constructor(public code: string) {
    super(code);
  }
}

export async function verifyInitData(initData: string): Promise<TgUser> {
  if (!initData) throw new AuthError('empty_initdata');
  if (initData.length > 16 * 1024) throw new AuthError('bad_signature');
  const params = new URLSearchParams(initData);
  if (!params.get('hash')) throw new AuthError('no_hash');
  if (
    ['hash', 'auth_date', 'user'].some((key) => params.getAll(key).length !== 1) ||
    !/^[a-f0-9]{64}$/i.test(params.get('hash')!)
  ) {
    throw new AuthError('bad_signature');
  }
  const authDate = Number(params.get('auth_date'));
  if (!Number.isSafeInteger(authDate) || authDate <= 0) throw new AuthError('no_auth_date');
  const age = Math.floor(Date.now() / 1000) - authDate;
  if (age > 86400) throw new AuthError('initdata_expired');
  if (age < -60) throw new AuthError('invalid_auth_date');
  // One standard validator. Diagnostic HMAC calculations must never authorize.
  try {
    await refValidate(initData, env.BOT_TOKEN.trim(), { expiresIn: 86400 });
  } catch {
    throw new AuthError('bad_signature');
  }
  try {
    const user = JSON.parse(params.get('user')!);
    if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) throw new Error();
    return user as TgUser;
  } catch {
    throw new AuthError('user_parse_failed');
  }
}

export async function authorize(req: Request): Promise<{ user: TgUser } | { response: Response }> {
  try {
    return { user: await verifyInitData(req.headers.get('x-telegram-initdata') ?? '') };
  } catch (error) {
    const code = error instanceof AuthError ? error.code : 'bad_signature';
    return { response: jsonResponse({ error: 'unauthorized', code }, { status: 401 }) };
  }
}
const ALLOWED_HEADERS =
  'authorization, x-client-info, apikey, content-type, x-telegram-initdata, x-internal-secret';
export function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
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
