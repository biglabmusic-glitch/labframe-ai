/** Only a verified server response can restore a returning account after cache loss. */
export function isReturningAccount(profile: {
  brand: unknown;
  user: { isAdmin?: boolean; canSmilePreview?: boolean; consentAt?: string | null } | null;
}, historyCount: number): boolean {
  // Prior consent proves a previous visit even when the optional history is
  // unavailable. Prefer home with its brand prompt over repeating onboarding.
  return Boolean(profile.user && (profile.brand || historyCount > 0 || profile.user.isAdmin || profile.user.canSmilePreview || profile.user.consentAt));
}

/** A history outage must never delay or reject a successfully verified profile. */
export function syncStartup<TProfile, THistory>(
  readProfile: () => Promise<TProfile>,
  readHistory: () => Promise<THistory>,
  applyProfile: (profile: TProfile) => void,
  applyHistory: (history: THistory) => void,
): Promise<void> {
  void Promise.resolve().then(readHistory).then(applyHistory).catch(() => {
    // Keep the existing history; an unavailable list is not an empty list.
  });
  return Promise.resolve().then(readProfile).then(applyProfile);
}

export function startupFailure(error: unknown): 'session' | 'connection' {
  return error instanceof Error && /^401\b/.test(error.message) ? 'session' : 'connection';
}
