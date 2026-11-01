import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { isReturningAccount, startupFailure } from '../app/src/state/startup.ts';

Deno.test('returning accounts recover after scoped cache loss using verified server state', () => {
  assertEquals(isReturningAccount({ user: {}, brand: { masterName: 'Test' } }, 0), true);
  assertEquals(isReturningAccount({ user: {}, brand: null }, 1), true);
  assertEquals(isReturningAccount({ user: { isAdmin: true }, brand: null }, 0), true);
  assertEquals(isReturningAccount({ user: { canSmilePreview: true }, brand: null }, 0), true);
  assertEquals(isReturningAccount({ user: {}, brand: null }, 0), false);
  assertEquals(isReturningAccount({ user: null, brand: { masterName: 'Unverified' } }, 1), false);
});
Deno.test('failed authentication and network errors are distinct from a new account', () => {
  assertEquals(startupFailure(new Error('401 /me: unauthorized/bad_signature')), 'session');
  assertEquals(startupFailure(new Error('503 /me: user_unavailable')), 'connection');
  assertEquals(startupFailure(new TypeError('Load failed')), 'connection');
});
