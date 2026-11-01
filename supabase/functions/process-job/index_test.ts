// This suite captures Deno.serve and uses only local fixtures, including the CDN.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { Image } from 'https://deno.land/x/imagescript@1.2.17/mod.ts';

Deno.test('a paid image download timeout resumes the same result and completes without another generation', async () => {
  const origin = 'https://job-worker-fixture.invalid';
  const id = '00000000-0000-4000-8000-000000000001';
  const resultUrl = 'https://storage.polza.ai/paid-result.png';
  const environment = {
    SUPABASE_URL: origin,
    SUPABASE_ANON_KEY: 'fixture-anon',
    SUPABASE_SERVICE_ROLE_KEY: 'fixture-service',
    BOT_TOKEN: 'fixture-bot',
    INTERNAL_SECRET: 'fixture-internal',
    AGENT_DISABLED: 'true',
    TEXT_AI_DISABLED: 'true',
  };
  const previous = new Map(Object.keys(environment).map((key) => [key, Deno.env.get(key)]));
  for (const [key, value] of Object.entries(environment)) Deno.env.set(key, value);
  const originalFetch = globalThis.fetch;
  const originalServe = Deno.serve;
  let handler: ((request: Request) => Promise<Response>) | undefined;
  Deno.serve = ((candidate: unknown) => {
    handler = candidate as typeof handler;
    return {};
  }) as typeof Deno.serve;
  const job: Record<string, unknown> = {
    id, user_id: 101, worker_token: 'fixture-lease',
    photo_path: `101/input.jpg`, style: 'clean', format: '4x5',
    branding: 'none', text_type: 'short', work_type: 'crown',
    prompt_used: 'fixture preserved prompt', result_path: null,
    model_used: null, is_test: true, status: 'processing',
  };
  const attempt = {
    id: 'fixture-attempt', attempt_no: 1, provider: 'polza', model: 'fixture-model',
    status: 'succeeded', provider_task_id: 'paid-task', result_url: resultUrl,
  };
  const image = await new Image(8, 8).fill(0xaabbccff).encodeJPEG();
  let downloads = 0;
  let newGenerations = 0;
  const terminalStates: unknown[] = [];
  const stored: string[] = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.href === resultUrl) {
      downloads++;
      if (downloads === 1) throw new DOMException('fixture CDN timeout', 'TimeoutError');
      return new Response(new Uint8Array(image).buffer);
    }
    if (url.pathname.endsWith('/balance')) return Response.json({}, { status: 503 });
    if (url.origin === origin && url.pathname === '/rest/v1/rpc/claim_job') {
      job.worker_token = `lease-${downloads}`;
      return Response.json([job]);
    }
    if (url.origin === origin && url.pathname === '/rest/v1/jobs' && request.method === 'PATCH') {
      const patch = await request.json();
      // Cleanup targets stale rows; our fixture is a current leased job.
      if (url.searchParams.has('started_at') || url.searchParams.has('created_at')) return Response.json([]);
      if (patch.status) terminalStates.push(patch.status);
      Object.assign(job, patch);
      return Response.json(url.searchParams.has('select') ? [{ id }] : null);
    }
    if (url.origin === origin && url.pathname === '/rest/v1/brand') return Response.json([]);
    if (url.origin === origin && url.pathname === '/rest/v1/ai_image_attempts') return Response.json([attempt]);
    if (url.origin === origin && url.pathname === '/rest/v1/ai_calls') return Response.json(null);
    if (url.origin === origin && url.pathname.startsWith('/storage/v1/object/sign/photos/')) {
      return Response.json({ signedURL: '/object/sign/photos/101/input.jpg?token=fixture' });
    }
    if (url.origin === origin && url.pathname.startsWith('/storage/v1/object/results/')) {
      stored.push(url.pathname);
      return Response.json({ Key: url.pathname, Id: 'fixture-object' });
    }
    newGenerations++;
    throw new Error(`Unexpected fixture request: ${request.method} ${url.origin}${url.pathname}`);
  };
  try {
    await import('./index.ts');
    assert(handler);
    const call = () => handler!(new Request(`${origin}/functions/v1/process-job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': environment.INTERNAL_SECRET },
      body: JSON.stringify({ jobId: id }),
    }));
    const first = await call();
    assertEquals(first.status, 503);
    assertEquals(job.status, 'processing');
    assertEquals(job.worker_lease_until, null);
    assertEquals(typeof job.next_poll_at, 'string');
    assertEquals(terminalStates, []);
    assertEquals(attempt.status, 'succeeded');
    const second = await call();
    assertEquals(second.status, 200);
    assertEquals((await second.json()).status, 'done');
    assertEquals(terminalStates, ['done']);
    assertEquals(job.result_path, `101/${id}.jpg`);
    assertEquals(job.caption_source, 'template');
    assertEquals(downloads, 2);
    assertEquals(newGenerations, 0);
    assert(stored.some((path) => path.endsWith(`${id}.jpg`)));
  } finally {
    globalThis.fetch = originalFetch;
    Deno.serve = originalServe;
    for (const [key, value] of previous) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
});
