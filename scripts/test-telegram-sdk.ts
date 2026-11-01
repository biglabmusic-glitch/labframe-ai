import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { resolveTelegramSdk } from '../app/src/telegram/sdk-interop.ts';

Deno.test('Telegram identity and native methods survive dev and production CommonJS imports', () => {
  let ready = false;
  const sdk = { initData: 'signed-fixture', initDataUnsafe: { user: { id: 101 } }, ready() { ready = true; } };
  for (const imported of [sdk, { __esModule: true, default: sdk }]) {
    const resolved = resolveTelegramSdk<typeof sdk>(imported);
    assertEquals(resolved, sdk);
    assertEquals(resolved.initData, 'signed-fixture');
    assertEquals(resolved.initDataUnsafe.user.id, 101);
    resolved.ready();
  }
  assertEquals(ready, true);
  assertThrows(() => resolveTelegramSdk({ default: {} }), Error, 'Telegram SDK unavailable');
});
