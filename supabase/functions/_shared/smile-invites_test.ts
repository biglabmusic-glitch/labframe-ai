// Standalone process: fixture environment and fetch cannot reach production.
import { assert, assertEquals, assertRejects, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';

Deno.test('smile invitations: hash-only persistence, strict input, safe status and revocation', async (test) => {
  const originalFetch = globalThis.fetch;
  const environment = {
    SUPABASE_URL: 'https://smile-invites-fixture.invalid', SUPABASE_ANON_KEY: 'fixture', SUPABASE_SERVICE_ROLE_KEY: 'fixture',
    REPLICATE_API_TOKEN: 'fixture', POLZA_API_KEY: 'fixture', BOT_TOKEN: '123:fixture',
  };
  const previous = new Map(Object.keys(environment).map((name) => [name, Deno.env.get(name)]));
  for (const [name, value] of Object.entries(environment)) Deno.env.set(name, value);
  const id = 'da5da9b9-60d9-4b93-92df-92b542409f7c';
  const inserted: Record<string, unknown>[] = [];
  const rpcBodies: Record<string, unknown>[] = [];
  const changes: Record<string, unknown>[] = [];
  let redeemResponse: unknown = 'accepted', redeemFail = false, permitted = true;
  let listed: Record<string, unknown>[] = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    assertEquals(url.origin, environment.SUPABASE_URL);
    if (url.pathname === '/rest/v1/rpc/hit_rate_limit') return Response.json(permitted);
    if (url.pathname === '/rest/v1/rpc/redeem_smile_invite') {
      rpcBodies.push(await request.json());
      return redeemFail ? Response.json({ message: 'fixture failure' }, { status: 503 }) : Response.json(redeemResponse);
    }
    if (url.pathname === '/rest/v1/smile_invites' && request.method === 'POST') {
      inserted.push(await request.json());
      return Response.json({ id, label: inserted.at(-1)!.label, expires_at: '2026-11-06T12:00:00.000Z' });
    }
    if (url.pathname === '/rest/v1/smile_invites' && request.method === 'GET') {
      assert(!url.searchParams.get('select')?.includes('token_hash'));
      return Response.json(listed);
    }
    if (url.pathname === '/rest/v1/smile_invites' && request.method === 'PATCH') {
      changes.push(await request.json());
      assertEquals(url.searchParams.get('id'), `eq.${id}`);
      return Response.json([{ id }]);
    }
    throw new Error(`Unexpected fixture request: ${request.method} ${url.pathname}`);
  };
  try {
    const helper = await import('./smile-invites.ts');
    await test.step('tokens are URL safe and malformed links never reach RPC', async () => {
      const tokens = new Set(Array.from({ length: 64 }, () => helper.newSmileInviteToken()));
      assertEquals(tokens.size, 64);
      for (const token of tokens) assert(/^[A-Za-z0-9_-]{43}$/.test(token));
      assertEquals(await helper.hashSmileInviteToken('A'.repeat(43)), '0f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1a');
      for (const start of [undefined, '', 'ref_ABCD', 'smile_short', `smile_${'A'.repeat(42)}!`]) {
        assertEquals(await helper.redeemSmileInvite(start, 102), { status: 'invalid' });
      }
      assertEquals(await helper.redeemSmileInvite(`smile_${'A'.repeat(43)}`, 0), { status: 'invalid' });
      assertEquals(rpcBodies.length, 0);
      assertThrows(() => helper.normalizeSmileInviteLabel('x'.repeat(81)));
      assertThrows(() => helper.normalizeSmileInviteLabel('name\nsecret'));
      assertEquals(helper.normalizeSmileInviteLabel('  Врач  '), 'Врач');
    });
    await test.step('only create exposes a one-time URL; SQL receives its hash', async () => {
      const created = await helper.createSmileInvite(101, '  Тест врача ');
      const start = new URL(created.url).searchParams.get('startapp')!;
      const token = helper.smileInviteToken(start)!;
      assertEquals(created.id, id);
      assertEquals(created.label, 'Тест врача');
      assertEquals(new URL(created.url).pathname, '/labframe_ai_bot/app');
      assertEquals(inserted, [{ token_hash: await helper.hashSmileInviteToken(token), created_by: 101, label: 'Тест врача' }]);
      assert(!JSON.stringify(inserted).includes(token));
      permitted = false;
      await assertRejects(() => helper.createSmileInvite(101, null), helper.SmileInviteError, 'invite_rate_limited');
      assertEquals(inserted.length, 1);
      permitted = true;
    });
    await test.step('redeem forwards only the hash and preserves every safe RPC outcome', async () => {
      for (const status of ['accepted', 'already', 'invalid', 'expired', 'used', 'revoked']) {
        redeemResponse = status;
        assertEquals(await helper.redeemSmileInvite(`smile_${'A'.repeat(43)}`, 102), { status });
      }
      assert(rpcBodies.every((body) => Object.keys(body).sort().join(',') === 'p_token_hash,p_user_id'));
      assert(!JSON.stringify(rpcBodies).includes('A'.repeat(43)));
      redeemResponse = 'unexpected';
      assertEquals(await helper.redeemSmileInvite(`smile_${'A'.repeat(43)}`, 102), { status: 'unavailable' });
      redeemFail = true;
      assertEquals(await helper.redeemSmileInvite(`smile_${'A'.repeat(43)}`, 102), { status: 'unavailable' });
      redeemFail = false;
    });
    await test.step('listing never selects hashes, and revocation never changes users', async () => {
      const base = { id, label: null, created_at: '2026-10-30T12:00:00Z', expires_at: '2999-01-01T00:00:00Z', revoked_at: null, used_at: null, used_by: null };
      listed = [base, { ...base, expires_at: '2000-01-01T00:00:00Z' }, { ...base, revoked_at: '2026-10-30T13:00:00Z' }, { ...base, used_at: '2026-10-30T13:00:00Z', used_by: 102, revoked_at: '2026-10-30T14:00:00Z' }];
      const response = await helper.listSmileInvites();
      assertEquals(response.items.map((item) => item.status), ['active', 'expired', 'revoked', 'used']);
      assert(!JSON.stringify(response).includes('token_hash'));
      await assertRejects(() => helper.revokeSmileInvite('../users'), helper.SmileInviteError, 'bad_invite_id');
      assertEquals(await helper.revokeSmileInvite(id), { ok: true });
      assertEquals(changes.length, 1);
      assertEquals(Object.keys(changes[0]), ['revoked_at']);
    });
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of previous) value === undefined ? Deno.env.delete(name) : Deno.env.set(name, value);
  }
});
