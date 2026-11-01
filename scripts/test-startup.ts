import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { isReturningAccount, startupFailure, syncStartup } from '../app/src/state/startup.ts';

Deno.test('returning accounts recover after scoped cache loss using verified server state', () => {
  assertEquals(isReturningAccount({ user: {}, brand: { masterName: 'Test' } }, 0), true);
  assertEquals(isReturningAccount({ user: {}, brand: null }, 1), true);
  assertEquals(isReturningAccount({ user: { isAdmin: true }, brand: null }, 0), true);
  assertEquals(isReturningAccount({ user: { canSmilePreview: true }, brand: null }, 0), true);
  assertEquals(isReturningAccount({ user: { consentAt: '2026-10-31T12:00:00Z' }, brand: null }, 0), true);
  assertEquals(isReturningAccount({ user: {}, brand: null }, 0), false);
  assertEquals(isReturningAccount({ user: null, brand: { masterName: 'Unverified' } }, 1), false);
});

Deno.test('verified profile unlocks startup while optional history is still pending', async () => {
  let finishHistory: (value: string[]) => void = () => {};
  const history = new Promise<string[]>((resolve) => { finishHistory = resolve; });
  let profileApplied = false;
  let shownHistory = ['cached'];
  await syncStartup(
    async () => ({ user: { consentAt: '2026-10-31T12:00:00Z' }, brand: null }),
    () => history,
    (profile) => { profileApplied = isReturningAccount(profile, 0); },
    (items) => { shownHistory = items; },
  );
  assertEquals(profileApplied, true);
  assertEquals(shownHistory, ['cached']);
  finishHistory(['fresh']);
  await Promise.resolve();
  await Promise.resolve();
  assertEquals(shownHistory, ['fresh']);
});

Deno.test('history failure preserves the cached list and cannot reject verified startup', async () => {
  let shownHistory = ['cached'];
  let profileApplied = false;
  await syncStartup(
    async () => ({ user: { consentAt: '2026-10-31T12:00:00Z' }, brand: null }),
    async (): Promise<string[]> => { throw new Error('history_unavailable'); },
    () => { profileApplied = true; },
    (items) => { shownHistory = items; },
  );
  assertEquals(profileApplied, true);
  assertEquals(shownHistory, ['cached']);
});

Deno.test('successful history cannot turn a failed identity check into verified startup', async () => {
  let profileApplied = false;
  await assertRejects(() => syncStartup(
    async () => { throw new Error('401 /me'); },
    async () => ['job'],
    () => { profileApplied = true; },
    () => {},
  ), Error, '401 /me');
  assertEquals(profileApplied, false);
});
Deno.test('failed authentication and network errors are distinct from a new account', () => {
  assertEquals(startupFailure(new Error('401 /me: unauthorized/bad_signature')), 'session');
  assertEquals(startupFailure(new Error('503 /me: user_unavailable')), 'connection');
  assertEquals(startupFailure(new TypeError('Load failed')), 'connection');
});
