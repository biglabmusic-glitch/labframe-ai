import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
for (
  const name of [
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'BOT_TOKEN',
    'POLZA_API_KEY',
    'REPLICATE_API_TOKEN',
  ]
) Deno.env.set(name, 'test');
Deno.env.set('SUPABASE_URL', 'http://localhost');
Deno.env.set('IMAGE_PROVIDER', 'polza');
Deno.env.delete('IMAGE_BACKUP_PROVIDER');
let attempts: Record<string, unknown>[] = [];
let provider: (url: string, init?: RequestInit) => Promise<Response>;
let saveFails = false;
const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (url, init) => {
  const target = String(url);
  if (!target.startsWith('http://localhost')) return provider(target, init);
  if (target.includes('/rpc/record_ai_provider_result')) return json(null);
  if (target.includes('/ai_provider_health')) return json([]);
  if (target.includes('/rpc/begin_image_attempt')) {
    const body = JSON.parse(String(init?.body));
    const attempt = {
      id: `a${attempts.length + 1}`,
      attempt_no: attempts.length + 1,
      provider: body.p_provider,
      model: body.p_model,
      status: 'starting',
      provider_task_id: null,
      result_url: null,
    };
    attempts.push(attempt);
    return json([attempt]);
  }
  if (target.includes('/ai_image_attempts')) {
    if (init?.method === 'PATCH') {
      if (saveFails) return json({ code: 'TEST', message: 'temporary write failure' }, 503);
      const id = new URL(target).searchParams.get('id')?.replace('eq.', '');
      Object.assign(attempts.find((a) => a.id === id)!, JSON.parse(String(init.body)));
      return json(null);
    }
    return json(attempts.length ? [attempts[attempts.length - 1]] : []);
  }
  throw new Error('unexpected database request');
};
const { advanceJobImage } = await import('./job-images.ts');
const input = {
  photoUrl: 'https://example.com/input.png',
  prompt: 'test',
  style: 'clean',
  format: '4x5',
} as const;
function reset() {
  attempts = [];
  saveFails = false;
}

Deno.test('worker restart polls the persisted id and reuses an already completed image', async () => {
  reset();
  let posts = 0;
  let gets = 0;
  provider = async (_url, init) => {
    if (init?.method === 'POST') {
      posts++;
      return json({ id: 'same-task', status: 'pending' });
    }
    gets++;
    return json({
      id: 'same-task',
      status: 'completed',
      data: { url: 'https://storage.polza.ai/result.png' },
    });
  };
  assertEquals((await advanceJobImage('job', 'token', input)).status, 'pending');
  assertEquals((await advanceJobImage('job', 'new-token', input)).status, 'done');
  assertEquals((await advanceJobImage('job', 'third-token', input)).status, 'done');
  assertEquals({ posts, gets }, { posts: 1, gets: 1 });
  assertEquals(attempts[0].provider_task_id, 'same-task');
});
Deno.test('an ambiguous submit is never sent again, including to a backup', async () => {
  reset();
  let calls = 0;
  provider = () => {
    calls++;
    return Promise.reject(new Error('connection lost'));
  };
  assertEquals((await advanceJobImage('job', 'token', input)).status, 'pending');
  assertEquals(attempts[0].status, 'unknown');
  await advanceJobImage('job', 'new-token', input);
  assertEquals(calls, 1);
  assertEquals(attempts.length, 1);
});
Deno.test('losing the task-id write does not make a restart submit again', async () => {
  reset();
  let posts = 0;
  provider = () => {
    posts++;
    return Promise.resolve(json({ id: 'accepted-task', status: 'pending' }));
  };
  saveFails = true;
  await assertRejects(
    () => advanceJobImage('job', 'token', input),
    Error,
    'attempt_save_unavailable',
  );
  saveFails = false;
  await advanceJobImage('job', 'new-token', input);
  assertEquals(posts, 1);
  assertEquals(attempts[0].status, 'unknown');
});
Deno.test('a transient poll failure retains its task instead of starting a backup', async () => {
  reset();
  attempts = [{
    id: 'a1',
    attempt_no: 1,
    provider: 'polza',
    model: 'test',
    status: 'pending',
    provider_task_id: 'paid-task',
    result_url: null,
  }];
  let posts = 0;
  provider = async (_url, init) => {
    if (init?.method === 'POST') posts++;
    return json({}, 503);
  };
  assertEquals((await advanceJobImage('job', 'token', input)).status, 'pending');
  assertEquals(attempts[0].status, 'pending');
  assertEquals(posts, 0);
});
Deno.test('a definitive account rejection allows exactly one recorded fallback attempt', async () => {
  reset();
  let posts = 0;
  provider = async (url, init) => {
    if (init?.method === 'POST') posts++;
    if (url.includes('polza')) return json({}, 402);
    return json({ id: 'rep-task', status: 'starting', output: null }, 201);
  };
  await advanceJobImage('job', 'token', input);
  assertEquals(attempts[0].status, 'failed');
  await advanceJobImage('job', 'new-token', input);
  assertEquals(attempts.length, 2);
  assertEquals(attempts[1].provider, 'replicate-flux');
  assertEquals(posts, 2);
});
