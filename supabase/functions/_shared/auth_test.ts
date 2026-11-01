import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
for (const name of ['SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'BOT_TOKEN']) {
  Deno.env.set(name, name === 'BOT_TOKEN' ? '123456:local-fixture' : 'test');
}
Deno.env.set('SUPABASE_URL', 'http://localhost');
const { verifyInitData, AuthError } = await import('./auth.ts');
async function signed(userId = 101, age = 0, reversed = false, withSignature = false) {
  const pairs = [['auth_date', String(Math.floor(Date.now() / 1000) - age)], [
    'user',
    JSON.stringify({ id: userId, first_name: 'Test' }),
  ]];
  if (withSignature) pairs.push(['signature', 'telegram-ed25519-fixture'], ['start_param', 'smile_fixture'], ['query_id', 'fixture']);
  const enc = new TextEncoder();
  const first = await crypto.subtle.importKey(
    'raw',
    enc.encode(reversed ? '123456:local-fixture' : 'WebAppData'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const bytes = await crypto.subtle.sign(
    'HMAC',
    first,
    enc.encode(reversed ? 'WebAppData' : '123456:local-fixture'),
  );
  const key = await crypto.subtle.importKey(
    'raw',
    bytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    enc.encode(pairs.map(([k, v]) => `${k}=${v}`).sort().join('\n')),
  );
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return new URLSearchParams([...pairs, ['hash', hash]]).toString();
}
Deno.test('only the standard Telegram HMAC authenticates', async () => {
  assertEquals((await verifyInitData(await signed())).id, 101);
  assertEquals((await verifyInitData(await signed(101, 0, false, true))).id, 101);
  await assertRejects(
    async () => verifyInitData(await signed(101, 0, true)),
    AuthError,
    'bad_signature',
  );
});
Deno.test('expired, future, duplicate and tampered identities are rejected', async () => {
  for (
    const value of [
      await signed(101, 86401),
      await signed(101, -120),
      await signed(-1),
      (await signed()) + '&user=' + encodeURIComponent('{"id":202}'),
      (await signed()).replace('Test', 'Changed'),
    ]
  ) {
    await assertRejects(() => verifyInitData(value), AuthError);
  }
});
