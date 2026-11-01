/** Only a verified server response can restore a returning account after cache loss. */
export function isReturningAccount(profile: {
  brand: unknown;
  user: { isAdmin?: boolean; canSmilePreview?: boolean } | null;
}, historyCount: number): boolean {
  return Boolean(profile.user && (profile.brand || historyCount > 0 || profile.user.isAdmin || profile.user.canSmilePreview));
}

export function startupFailure(error: unknown): 'session' | 'connection' {
  return error instanceof Error && /^401\b/.test(error.message) ? 'session' : 'connection';
}
