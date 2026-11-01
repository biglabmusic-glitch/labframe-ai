// Real handler and Telegram signature checks; all database/provider data is local fixture data.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const token = '123456:admin-stats-local-fixture';
const origin = 'https://admin-stats-fixture.invalid';
async function initData(id: number) {
  const data = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id }) });
  const encoder = new TextEncoder();
  const hmac = async (key: BufferSource, text: string) => {
    const imported = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return new Uint8Array(await crypto.subtle.sign('HMAC', imported, encoder.encode(text)));
  };
  const secret = await hmac(encoder.encode('WebAppData'), token);
  const digest = await hmac(secret, [...data].map(([key, value]) => `${key}=${value}`).sort().join('\n'));
  data.set('hash', [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join(''));
  return data.toString();
}

Deno.test('admin statistics load independently of provider availability and retain access checks', async (test) => {
  const originalFetch = globalThis.fetch, originalServe = Deno.serve;
  const environment = { SUPABASE_URL: origin, SUPABASE_ANON_KEY: 'fixture-anon', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service', BOT_TOKEN: token, ADMIN_IDS: '101', POLZA_API_KEY: 'fixture-polza' };
  const previous = new Map(Object.keys(environment).map((key) => [key, Deno.env.get(key)]));
  for (const [key, value] of Object.entries(environment)) Deno.env.set(key, value);
  let handler: ((req: Request) => Promise<Response>) | undefined;
  let providerCalls = 0, writes = 0, providerFails = false, banned = false;
  Deno.serve = ((callback: unknown) => { handler = callback as typeof handler; return {}; }) as typeof Deno.serve;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init), url = new URL(request.url), params = url.searchParams;
    const table = url.pathname.split('/').pop(), select = params.get('select');
    if (url.origin !== origin) {
      if (url.hostname !== 'api.polza.ai' || url.pathname !== '/api/v1/balance') throw new Error('Unexpected external request');
      providerCalls++;
      if (providerFails) throw new TypeError('provider offline');
      return Response.json({ available: 350, amount: 450, reservedAmount: 100, spentAmount: 150, currency: 'RUB' });
    }
    if (request.method === 'HEAD') {
      let count = 0;
      if (table === 'users') count = params.has('credits') ? 3 : params.has('referred_by') ? 2 : params.has('created_at') ? 4 : 1500;
      if (table === 'jobs') count = params.has('user_id') ? 900 : params.has('created_at') ? (params.get('status') === 'eq.done' ? 8 : 10) : params.get('status') === 'eq.done' ? 1200 : 0;
      return new Response(null, { headers: { 'content-range': `0-0/${count}` } });
    }
    if (request.method !== 'GET') {
      assertEquals(table, 'provider_balance'); assertEquals(request.method, 'POST');
      writes++; return Response.json(null, { status: 201 });
    }
    if (table === 'users' && select === 'is_admin,banned') return Response.json({ is_admin: params.get('id') === 'eq.101', banned });
    if (table === 'provider_balance') {
      if (select === 'balance') return Response.json([{ balance: 300 }]);
      return Response.json([
        { balance: 400, amount: 500, reserved: 100, spent_total: 0, currency: 'RUB', at: new Date(Date.now() - 86400_000).toISOString() },
        { balance: 300, amount: 400, reserved: 100, spent_total: 100, currency: 'RUB', at: new Date().toISOString() },
      ]);
    }
    if (table === 'payments' && !params.has('user_id')) return Response.json([{ user_id: 1, amount_rub: 700, credits: 20, created_at: new Date().toISOString(), raw: { commission_sum: '14' } }]);
    if (table === 'jobs' && select === 'id,user_id') {
      const offset = Number(params.get('offset') ?? 0);
      return Response.json(offset === 0 ? Array.from({ length: 1000 }, (_, index) => ({ id: `j${index}`, user_id: index + 1 })) : [{ id: 'last', user_id: 1001 }]);
    }
    return Response.json([]);
  };
  try {
    await import('./index.ts'); assert(handler);
    const call = async (action: string, id = 101, signed = true) => handler!(new Request(`${origin}/admin`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(signed ? { 'x-telegram-initdata': await initData(id) } : {}) }, body: JSON.stringify({ action }),
    }));
    await test.step('dashboard reads stored finance and counts jobs beyond the first 1000', async () => {
      const response = await call('stats'); assertEquals(response.status, 200);
      const stats = await response.json();
      assertEquals(stats.totalUsers, 1500); assertEquals(stats.activated, 1001); assertEquals(stats.neverGenerated, 499);
      assertEquals(stats.providerBalance, 300); assertEquals(stats.providerSpentTotal, 100);
      assertEquals(stats.revenueTotal, 700); assertEquals(stats.netTotal, 558); assertEquals(stats.freeDone, 900);
      assertEquals(providerCalls, 0); assertEquals(writes, 0);
      assert(response.headers.get('Server-Timing')?.startsWith('stats;dur='));
    });
    await test.step('live balance is only fetched by its explicit admin action', async () => {
      assertEquals((await call('refresh-provider-balance')).status, 200);
      assertEquals(providerCalls, 1); assertEquals(writes, 1);
      providerFails = true;
      assertEquals((await call('refresh-provider-balance')).status, 503);
      assertEquals((await call('stats')).status, 200);
      assertEquals(providerCalls, 2); assertEquals(writes, 1);
    });
    await test.step('anonymous, ordinary and banned users cannot read or refresh admin data', async () => {
      for (const action of ['stats', 'refresh-provider-balance']) {
        assertEquals((await call(action, 101, false)).status, 401);
        assertEquals((await call(action, 102)).status, 403);
      }
      banned = true;
      assertEquals((await call('stats')).status, 403);
      assertEquals((await call('refresh-provider-balance')).status, 403);
      assertEquals(providerCalls, 2);
    });
  } finally {
    globalThis.fetch = originalFetch; Deno.serve = originalServe;
    for (const [key, value] of previous) { if (value === undefined) Deno.env.delete(key); else Deno.env.set(key, value); }
  }
});
