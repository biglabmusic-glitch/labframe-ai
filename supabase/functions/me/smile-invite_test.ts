// Run in a separate Deno process: this suite captures Deno.serve and replaces fetch.
// Telegram HMAC validation stays real; all identities, tokens and database rows are fixtures.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const fixtureBotToken = '123456:smile-invite-local-fixture';
const fixtureOrigin = 'https://smile-invite-fixture.invalid';
const token = 'A'.repeat(43);
const startParam = `smile_${token}`;

async function signedInitData(id: number, start?: string): Promise<string> {
  const values: [string, string][] = [
    ['auth_date', String(Math.floor(Date.now() / 1000))],
    ['user', JSON.stringify({ id, first_name: 'Fixture' })],
    ...(start ? [['start_param', start] as [string, string]] : []),
  ];
  const encoder = new TextEncoder();
  const secretKey = await crypto.subtle.importKey('raw', encoder.encode('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const secret = await crypto.subtle.sign('HMAC', secretKey, encoder.encode(fixtureBotToken));
  const signingKey = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', signingKey, encoder.encode(values.map(([key, value]) => `${key}=${value}`).sort().join('\n')));
  const hash = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
  return new URLSearchParams([...values, ['hash', hash]]).toString();
}

interface FixtureUser { id: number; banned: boolean; smile_tester: boolean; ref_code: string; [key: string]: unknown }
interface FixtureInvite { status: 'active' | 'expired' | 'revoked'; usedBy?: number }

Deno.test('me smile invites: signed start_param, profile ordering, hash-only RPC, replay and denied access', async (test) => {
  const originalFetch = globalThis.fetch;
  const originalServe = Deno.serve;
  const environment = {
    SUPABASE_URL: fixtureOrigin, SUPABASE_ANON_KEY: 'fixture-anon', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service',
    REPLICATE_API_TOKEN: 'fixture-replicate', POLZA_API_KEY: 'fixture-polza', BOT_TOKEN: fixtureBotToken,
    ADMIN_IDS: '101',
  };
  const previousEnvironment = new Map(Object.keys(environment).map((name) => [name, Deno.env.get(name)]));
  for (const [name, value] of Object.entries(environment)) Deno.env.set(name, value);
  const users = new Map<number, FixtureUser>();
  const expectedHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))]
    .map((value) => value.toString(16).padStart(2, '0')).join('');
  const invites = new Map<string, FixtureInvite>([[expectedHash, { status: 'active' }]]);
  const events: string[] = [];
  let upsertFails = false, redeemFails = false, rpcCalls = 0, upsertCalls = 0;
  let handler: ((request: Request) => Promise<Response>) | undefined;
  Deno.serve = ((callback: unknown) => { handler = callback as typeof handler; return {}; }) as typeof Deno.serve;

  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.origin !== fixtureOrigin) throw new Error(`Unexpected external fixture call: ${url.origin}`);
    if (url.pathname === '/rest/v1/users' && request.method === 'POST') {
      upsertCalls++;
      events.push('upsert');
      if (upsertFails) return Response.json({ message: 'fixture upsert failure' }, { status: 503 });
      const value = await request.json();
      assertEquals(value.smile_tester, undefined, 'profile upsert cannot grant access');
      assertEquals(value.is_admin, undefined, 'profile upsert cannot grant admin rights');
      users.set(value.id, { id: value.id, banned: false, smile_tester: false, ref_code: 'FIXTURE', ...users.get(value.id), ...value });
      return new Response(null, { status: 201 });
    }
    if (url.pathname === '/rest/v1/users' && request.method === 'GET') {
      events.push('profile-read');
      const id = Number(url.searchParams.get('id')?.replace('eq.', ''));
      const user = users.get(id);
      return Response.json(request.headers.get('accept')?.includes('vnd.pgrst.object+json') ? user ?? null : user ? [user] : []);
    }
    if (url.pathname === '/rest/v1/brand') return Response.json([]);
    if (url.pathname === '/rest/v1/referrals' && request.method === 'HEAD') {
      return new Response(null, { status: 200, headers: { 'content-range': '*/0' } });
    }
    if (url.pathname === '/rest/v1/rpc/redeem_smile_invite') {
      rpcCalls++;
      events.push('redeem');
      if (redeemFails) return Response.json({ message: 'fixture RPC unavailable' }, { status: 503 });
      const body = await request.json();
      assertEquals(Object.keys(body).sort(), ['p_token_hash', 'p_user_id']);
      assertEquals(body.p_token_hash, expectedHash);
      assert(!JSON.stringify(body).includes(token), 'database receives a hash, never the raw invitation');
      const user = users.get(body.p_user_id);
      assert(user, 'the profile must exist before redemption');
      const invite = invites.get(body.p_token_hash);
      if (!invite || user.banned) return Response.json('invalid');
      if (invite.usedBy !== undefined) return Response.json(invite.usedBy === user.id ? 'already' : 'used');
      if (invite.status !== 'active') return Response.json(invite.status);
      invite.usedBy = user.id;
      user.smile_tester = true;
      return Response.json('accepted');
    }
    throw new Error(`Unexpected fixture request: ${request.method} ${url.pathname}`);
  };

  try {
    await import('./index.ts');
    assert(handler);
    const call = async (id: number, options: { signedStart?: string; queryStart?: string; bodyStart?: string; tamper?: boolean; noAuth?: boolean } = {}) => {
      let initData = await signedInitData(id, options.signedStart);
      if (options.tamper) initData += `&start_param=${encodeURIComponent(startParam)}`;
      const query = options.queryStart ? `?start_param=${encodeURIComponent(options.queryStart)}` : '';
      return await handler!(new Request(`${fixtureOrigin}/functions/v1/me${query}`, {
        method: options.bodyStart ? 'POST' : 'GET',
        headers: { ...(options.noAuth ? {} : { 'x-telegram-initdata': initData }), ...(options.bodyStart ? { 'Content-Type': 'application/json' } : {}) },
        ...(options.bodyStart ? { body: JSON.stringify({ start_param: options.bodyStart, smile_tester: true }) } : {}),
      }));
    };

    await test.step('unauthenticated and signature-tampered invitations have no database side effects', async () => {
      assertEquals((await call(201, { signedStart: startParam, noAuth: true })).status, 401);
      assertEquals((await call(201, { tamper: true })).status, 401);
      assertEquals(upsertCalls, 0);
      assertEquals(rpcCalls, 0);
    });

    await test.step('URL/body start_param cannot grant access without the signed Telegram field', async () => {
      const response = await call(201, { queryStart: startParam, bodyStart: startParam });
      assertEquals(response.status, 200);
      const profile = await response.json();
      assertEquals(profile.user.canSmilePreview, false);
      assertEquals(profile.user.smileInviteStatus, undefined);
      assertEquals(rpcCalls, 0);
    });

    await test.step('even a signed malformed invitation never reaches the database RPC', async () => {
      for (const malformed of ['smile_short', `smile_${'A'.repeat(42)}!`]) {
        const profile = await (await call(201, { signedStart: malformed })).json();
        assertEquals(profile.user.smileInviteStatus, 'invalid');
        assertEquals(profile.user.canSmilePreview, false);
      }
      assertEquals(rpcCalls, 0);
    });

    await test.step('new participant is upserted before the hash-only RPC, then the granted profile is returned', async () => {
      events.length = 0;
      const response = await call(202, { signedStart: startParam });
      assertEquals(response.status, 200);
      assertEquals(response.headers.get('cache-control'), 'no-store');
      const profile = await response.json();
      assertEquals(profile.user.smileInviteStatus, 'accepted');
      assertEquals(profile.user.canSmilePreview, true);
      assertEquals(profile.user.isAdmin, false);
      assert(events.indexOf('upsert') < events.indexOf('redeem'));
      assert(events.lastIndexOf('profile-read') > events.indexOf('redeem'));
    });

    await test.step('replaying the same link cannot restore access removed manually', async () => {
      users.get(202)!.smile_tester = false;
      const response = await call(202, { signedStart: startParam });
      const profile = await response.json();
      assertEquals(profile.user.smileInviteStatus, 'already');
      assertEquals(profile.user.canSmilePreview, false);
      assertEquals(users.get(202)!.smile_tester, false);
    });

    await test.step('another account cannot redeem a consumed link', async () => {
      const response = await call(203, { signedStart: startParam });
      const profile = await response.json();
      assertEquals(profile.user.smileInviteStatus, 'used');
      assertEquals(profile.user.canSmilePreview, false);
    });

    await test.step('revoked and expired links do not grant access', async () => {
      for (const status of ['revoked', 'expired'] as const) {
        invites.set(expectedHash, { status });
        const profile = await (await call(204, { signedStart: startParam })).json();
        assertEquals(profile.user.smileInviteStatus, status);
        assertEquals(profile.user.canSmilePreview, false);
      }
    });

    await test.step('a banned participant cannot consume a valid invitation', async () => {
      invites.set(expectedHash, { status: 'active' });
      users.set(205, { id: 205, banned: true, smile_tester: false, ref_code: 'FIXTURE' });
      const profile = await (await call(205, { signedStart: startParam })).json();
      assertEquals(profile.user.smileInviteStatus, 'invalid');
      assertEquals(profile.user.canSmilePreview, false);
      assertEquals(invites.get(expectedHash)!.usedBy, undefined);
    });

    await test.step('failed profile upsert stops before consuming a link', async () => {
      upsertFails = true;
      const callsBefore = rpcCalls;
      const response = await call(206, { signedStart: startParam });
      assertEquals(response.status, 503);
      assertEquals(rpcCalls, callsBefore);
      assertEquals(users.has(206), false);
      upsertFails = false;
    });

    await test.step('RPC outage denies the grant while returning an explicit retryable status', async () => {
      redeemFails = true;
      const response = await call(207, { signedStart: startParam });
      assertEquals(response.status, 200);
      const profile = await response.json();
      assertEquals(profile.user.smileInviteStatus, 'unavailable');
      assertEquals(profile.user.canSmilePreview, false);
      assertEquals(invites.get(expectedHash)!.usedBy, undefined);
      redeemFails = false;
    });
  } finally {
    globalThis.fetch = originalFetch;
    Deno.serve = originalServe;
    for (const [name, value] of previousEnvironment) {
      if (value === undefined) Deno.env.delete(name); else Deno.env.set(name, value);
    }
  }
});
