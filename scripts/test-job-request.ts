import { assertEquals, assertNotEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { clearPendingRequest, pendingRequestKey } from '../app/src/lib/job-request.ts';
const makeStorage = () => {
  const items = new Map<string, string>();
  return {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => {
      items.set(k, v);
    },
    removeItem: (k: string) => {
      items.delete(k);
    },
  };
};
Deno.test('an unacknowledged request survives retries and different accounts stay separate', () => {
  const store = makeStorage();
  const body = { photoPath: '1/test.png', style: 'clean' };
  const first = pendingRequestKey(store, 1, body);
  assertEquals(pendingRequestKey(store, 1, body), first);
  assertNotEquals(pendingRequestKey(store, 2, body), first);
  assertNotEquals(pendingRequestKey(store, 1, { ...body, style: 'dark' }), first);
});
Deno.test('a new request key is issued only after a terminal acknowledgment', () => {
  const store = makeStorage();
  const first = pendingRequestKey(store, 1, {});
  clearPendingRequest(store, 1);
  assertNotEquals(pendingRequestKey(store, 1, {}), first);
});
Deno.test('blocked browser storage still keeps the same key in memory', () => {
  const blocked = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
    removeItem: () => {},
  };
  const first = pendingRequestKey(blocked, 9, { photo: 'fixture' });
  assertEquals(pendingRequestKey(blocked, 9, { photo: 'fixture' }), first);
  clearPendingRequest(blocked, 9);
  assertNotEquals(pendingRequestKey(blocked, 9, { photo: 'fixture' }), first);
});
