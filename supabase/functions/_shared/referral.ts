// Реферальные хелперы. Чистые функции (без БД) тестируются в referral_test.ts.
import { db } from './db.ts';

// Безопасный алфавит без похожих символов (0/O, 1/I/L).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Приводим код к каноничному виду: upper-case, только [A-Z0-9-]. */
export function normalizeCode(raw: string): string {
  return (raw ?? '').toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

/** start_param приходит как 'ref_<CODE>'. Возвращаем нормализованный код или ''. */
export function parseStartParam(sp: string | undefined | null): string {
  if (!sp) return '';
  if (!sp.startsWith('ref_')) return '';
  return normalizeCode(sp.slice('ref_'.length));
}

/** Генерим код формата ZUB-XXXX (4 символа из безопасного алфавита). */
export function generateRefCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return `ZUB-${s}`;
}

/** Гарантирует наличие ref_code у юзера. Возвращает код. */
export async function ensureRefCode(userId: number): Promise<string> {
  const { data } = await db.from('users').select('ref_code').eq('id', userId).maybeSingle();
  if (data?.ref_code) return data.ref_code;

  // До 5 попыток на случай коллизии unique-индекса.
  for (let i = 0; i < 5; i++) {
    const code = generateRefCode();
    const { error } = await db.from('users').update({ ref_code: code }).eq('id', userId);
    if (!error) return code;
  }
  throw new Error('ensureRefCode: too many collisions');
}
