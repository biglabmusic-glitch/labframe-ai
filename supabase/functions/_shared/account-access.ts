import { db } from './db.ts';
import { jsonResponse } from './auth.ts';
export async function requireActiveAccount(userId: number): Promise<Response | null> {
  const { data, error } = await db.from('users').select('banned,consent_at,consent_version').eq(
    'id',
    userId,
  ).maybeSingle();
  if (error) return jsonResponse({ error: 'profile_unavailable' }, { status: 503 });
  if (data?.banned) return jsonResponse({ error: 'banned' }, { status: 403 });
  if (!data?.consent_at || data.consent_version !== 2) {
    return jsonResponse({ error: 'consent_required' }, { status: 403 });
  }
  return null;
}
