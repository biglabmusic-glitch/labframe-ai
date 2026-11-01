import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createAdminRequestCache } from '../app/src/lib/admin-request-cache.ts';

Deno.test('admin tab switches share an in-flight request and a short-lived result', async () => {
  let calls = 0, time = 0;
  const cache = createAdminRequestCache(async () => ++calls, 15_000, () => time);
  const first = cache.load(); const second = cache.load();
  assertEquals(first, second);
  assertEquals(await first, 1);
  assertEquals(await cache.load(), 1);
  time = 15_000;
  assertEquals(await cache.load(), 2);
  assertEquals(await cache.load(true), 3);
  assertEquals(cache.peek(), 3);
});

Deno.test('failed loads can retry and a new admin screen does not inherit private data', async () => {
  let fail = true;
  const cache = createAdminRequestCache(async () => { if (fail) throw new Error('offline'); return 7; });
  await assertRejects(() => cache.load(), Error, 'offline');
  fail = false;
  assertEquals(await cache.load(), 7);
  const anotherScreen = createAdminRequestCache(async () => 8);
  assertEquals(anotherScreen.peek(), null);
  assertEquals(await anotherScreen.load(), 8);
});

Deno.test('an explicit refresh waits for an older load and then fetches fresh state', async () => {
  let finish: ((value: number) => void) | undefined, calls = 0;
  const cache = createAdminRequestCache(() => ++calls === 1 ? new Promise<number>((resolve) => { finish = resolve; }) : Promise.resolve(2));
  const old = cache.load();
  await Promise.resolve();
  const refresh = cache.load(true);
  finish!(1);
  assertEquals(await old, 1);
  assertEquals(await refresh, 2);
  assertEquals(cache.peek(), 2);
});
