import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';

for (const name of ['SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'BOT_TOKEN']) {
  Deno.env.set(name, 'test');
}
Deno.env.set('SUPABASE_URL', 'http://localhost');
const { fetchBytes } = await import('./storage.ts');
const resultUrl = 'https://storage.polza.ai/result.png';

async function withFetch<T>(fetcher: typeof fetch, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = fetcher;
  try { return await run(); }
  finally { globalThis.fetch = original; }
}

Deno.test('paid result download timeout stays retryable and its URL is not leaked', async () => {
  let requests = 0;
  await withFetch((_url, init) => {
    requests++;
    assertEquals(init?.redirect, 'error');
    assertEquals(init?.signal instanceof AbortSignal, true);
    return Promise.reject(new DOMException(`Timed out downloading ${resultUrl}`, 'TimeoutError'));
  }, async () => {
    const error = await assertRejects(() => fetchBytes(resultUrl), Error);
    assertEquals(error.message, 'fetchBytes timeout');
    // The worker catch recognizes this prefix and defers the persisted image.
    assertEquals(/^(signUrl|uploadBytes|fetchBytes)/.test(error.message), true);
  });
  assertEquals(requests, 1);
  await withFetch(() => Promise.resolve(new Response(new Uint8Array([1, 2, 3]))), async () => {
    assertEquals(await fetchBytes(resultUrl), new Uint8Array([1, 2, 3]));
  });
});

Deno.test('network failures and late CDN responses preserve a safe retry category', async () => {
  for (const failure of [new TypeError('Connection failed with secret query'), new DOMException('aborted', 'AbortError')]) {
    await withFetch(() => Promise.reject(failure), async () => {
      const error = await assertRejects(() => fetchBytes(resultUrl), Error);
      assertEquals(error.message, failure.name === 'AbortError' ? 'fetchBytes timeout' : 'fetchBytes network');
    });
  }
  await withFetch(() => Promise.resolve(new Response('not ready', { status: 503 })), async () => {
    const error = await assertRejects(() => fetchBytes(resultUrl), Error);
    assertEquals(error.message, 'fetchBytes http_503');
  });
});

Deno.test('an interrupted result body and oversized result are classified without leaking source details', async () => {
  await withFetch(() => Promise.resolve(new Response(new ReadableStream<Uint8Array>({
    start(controller) { controller.error(new TypeError('private source details')); },
  }))), async () => {
    const error = await assertRejects(() => fetchBytes(resultUrl), Error);
    assertEquals(error.message, 'fetchBytes body_unavailable');
  });
  await withFetch(() => Promise.resolve(new Response(null, {
    headers: { 'Content-Length': String(20 * 1024 * 1024 + 1) },
  })), async () => {
    const error = await assertRejects(() => fetchBytes(resultUrl), Error);
    assertEquals(error.message, 'fetchBytes body_too_large');
  });
});

Deno.test('result retries still reject untrusted locations before calling fetch', async () => {
  let calls = 0;
  await withFetch(() => {
    calls++;
    return Promise.resolve(new Response());
  }, async () => {
    for (const url of ['not a URL', 'http://storage.polza.ai/x', 'https://evil.example/result', 'https://user:pass@storage.polza.ai/x']) {
      const error = await assertRejects(() => fetchBytes(url), Error);
      assertEquals(error.message, 'fetchBytes invalid_location');
    }
  });
  assertEquals(calls, 0);
});

Deno.test('only the Polza S3 file host uses HTTP/1 and its client closes after the body or a timeout', async () => {
  const originalCreateClient = Deno.createHttpClient;
  let created = 0;
  let closed = 0;
  const client = { close: () => { closed++; } } as unknown as Deno.HttpClient;
  Deno.createHttpClient = ((options: Deno.CreateHttpClientOptions) => {
    assertEquals(options.http1, true);
    assertEquals(options.http2, false);
    created++;
    return client;
  }) as typeof Deno.createHttpClient;
  try {
    await withFetch((_url, init) => {
      assertEquals((init as RequestInit & { client?: unknown }).client, client);
      return Promise.resolve(new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          assertEquals(closed, 0);
          controller.enqueue(new Uint8Array([7]));
          controller.close();
        },
      })));
    }, async () => {
      assertEquals(await fetchBytes('https://s3.polza.ai/result.png'), new Uint8Array([7]));
      assertEquals(closed, 1);
    });
    await withFetch(() => Promise.reject(new DOMException('timeout', 'TimeoutError')), async () => {
      await assertRejects(() => fetchBytes('https://s3.polza.ai/result.png'), Error, 'fetchBytes timeout');
      assertEquals(closed, 2);
    });
    await withFetch((_url, init) => {
      assertEquals((init as RequestInit & { client?: unknown }).client, undefined);
      return Promise.resolve(new Response(new Uint8Array([8])));
    }, async () => {
      await fetchBytes('https://storage.polza.ai/result.png');
      await fetchBytes('https://replicate.delivery/result.png');
    });
    assertEquals(created, 2);
  } finally {
    Deno.createHttpClient = originalCreateClient;
  }
});
