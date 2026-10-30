import { db } from './db.ts';

export type SmileInviteRedeemStatus = 'accepted' | 'already' | 'invalid' | 'expired' | 'used' | 'revoked' | 'unavailable';
export type SmileInviteStatus = 'active' | 'used' | 'revoked' | 'expired';
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REDEEM_STATUSES = new Set<SmileInviteRedeemStatus>(['accepted', 'already', 'invalid', 'expired', 'used', 'revoked']);

export class SmileInviteError extends Error {
  constructor(public code: string, public status = 503) { super(code); }
}

/** URL token has 256 bits of entropy; only its hash may be persisted or sent to SQL. */
export function newSmileInviteToken(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function hashSmileInviteToken(token: string): Promise<string> {
  if (!TOKEN.test(token)) throw new SmileInviteError('bad_invite', 400);
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function smileInviteToken(startParam: string | undefined): string | null {
  if (typeof startParam !== 'string' || !startParam.startsWith('smile_')) return null;
  const token = startParam.slice(6);
  return TOKEN.test(token) ? token : null;
}

export function normalizeSmileInviteLabel(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.trim().length > 80 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new SmileInviteError('bad_invite_label', 400);
  }
  return value.trim() || null;
}

export async function redeemSmileInvite(startParam: string | undefined, userId: number): Promise<{ status: SmileInviteRedeemStatus }> {
  const token = smileInviteToken(startParam);
  if (!token || !Number.isSafeInteger(userId) || userId <= 0) return { status: 'invalid' };
  try {
    const tokenHash = await hashSmileInviteToken(token);
    const { data, error } = await db.rpc('redeem_smile_invite', { p_token_hash: tokenHash, p_user_id: userId });
    return { status: !error && REDEEM_STATUSES.has(data) ? data as SmileInviteRedeemStatus : 'unavailable' };
  } catch { return { status: 'unavailable' }; }
}

export async function createSmileInvite(createdBy: number, label: unknown) {
  if (!Number.isSafeInteger(createdBy) || createdBy <= 0) throw new SmileInviteError('bad_input', 400);
  const normalized = normalizeSmileInviteLabel(label);
  const { data: permitted, error: rateError } = await db.rpc('hit_rate_limit', {
    p_user_id: createdBy, p_action: 'smile-invite-create', p_limit: 30, p_window_sec: 3600,
  });
  if (rateError || typeof permitted !== 'boolean') throw new SmileInviteError('invite_unavailable');
  if (!permitted) throw new SmileInviteError('invite_rate_limited', 429);
  const token = newSmileInviteToken();
  const { data, error } = await db.from('smile_invites').insert({
    token_hash: await hashSmileInviteToken(token), created_by: createdBy, label: normalized,
  }).select('id, label, expires_at').single();
  if (error || !data) throw new SmileInviteError('invite_create_failed');
  return {
    id: data.id, label: data.label ?? null, expiresAt: data.expires_at,
    url: `https://t.me/labframe_ai_bot/app?startapp=smile_${token}`,
  };
}

export async function listSmileInvites() {
  const { data, error } = await db.from('smile_invites')
    .select('id, label, created_at, expires_at, revoked_at, used_at, used_by')
    .order('created_at', { ascending: false }).limit(50);
  if (error) throw new SmileInviteError('invite_list_failed');
  const now = Date.now();
  return { items: (data ?? []).map((invite) => ({
    id: invite.id, label: invite.label ?? null, createdAt: invite.created_at, expiresAt: invite.expires_at,
    revokedAt: invite.revoked_at, usedAt: invite.used_at, usedBy: invite.used_by,
    status: (invite.used_at ? 'used' : invite.revoked_at ? 'revoked' : Date.parse(invite.expires_at) <= now ? 'expired' : 'active') as SmileInviteStatus,
  })) };
}

export async function revokeSmileInvite(inviteId: unknown): Promise<{ ok: true }> {
  if (typeof inviteId !== 'string' || !UUID.test(inviteId)) throw new SmileInviteError('bad_invite_id', 400);
  const { data, error } = await db.from('smile_invites')
    .update({ revoked_at: new Date().toISOString() }).eq('id', inviteId).select('id').maybeSingle();
  if (error) throw new SmileInviteError('invite_revoke_failed');
  if (!data) throw new SmileInviteError('invite_not_found', 404);
  return { ok: true };
}
