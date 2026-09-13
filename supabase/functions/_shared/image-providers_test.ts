import { assertEquals, assertRejects, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';

// image-providers читает секреты при импорте — задаём заглушки до него.
for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'REPLICATE_API_TOKEN', 'POLZA_API_KEY', 'BOT_TOKEN']) {
  Deno.env.set(name, 'test');
}
Deno.env.set('IMAGE_PROVIDER', 'polza');

const { generateImage } = await import('./image-providers.ts');

const INPUT = { photoUrl: 'https://x/photo.jpg', style: 'clean', format: '4x5', prompt: 'p' } as const;

type Reply = () => Response;
const json = (status: number, body: unknown): Reply => () =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const POLZA_OK = json(200, { data: [{ url: 'https://polza/result.jpg' }] });
const POLZA_503 = json(503, { error: { message: 'The model is overloaded' } });
const POLZA_400 = json(400, { error: { message: 'bad prompt' } });
const REPLICATE_402 = json(402, { title: 'Insufficient credit' });
const REPLICATE_OK = json(201, { output: 'https://replicate/result.jpg' });

/** Подменяет fetch: отвечает по очереди для каждого хоста и записывает вызовы. */
async function withFetch(
  replies: { polza?: Reply[]; replicate?: Reply[] },
  fn: () => Promise<void>,
): Promise<string[]> {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((url: string | URL) => {
    const host = String(url).includes('replicate') ? 'replicate' : 'polza';
    calls.push(host);
    const next = replies[host]?.shift();
    if (!next) throw new Error(`лишний вызов ${host}`);
    return Promise.resolve(next());
  }) as typeof fetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = original;
  }
  return calls;
}

Deno.test('основной ответил — запасной не трогаем', async () => {
  const calls = await withFetch({ polza: [POLZA_OK] }, async () => {
    const out = await generateImage({ ...INPUT });
    assertEquals(out.imageUrl, 'https://polza/result.jpg');
  });
  assertEquals(calls, ['polza']);
});

Deno.test('основной перегружен — отвечает запасной', async () => {
  const calls = await withFetch({ polza: [POLZA_503], replicate: [REPLICATE_OK] }, async () => {
    const out = await generateImage({ ...INPUT });
    assertEquals(out.provider, 'flux-kontext-pro');
  });
  assertEquals(calls, ['polza', 'replicate']);
});

Deno.test('на запасном нет денег — повторяем основной', async () => {
  const calls = await withFetch(
    { polza: [POLZA_503, POLZA_OK], replicate: [REPLICATE_402] },
    async () => {
      const out = await generateImage({ ...INPUT });
      assertEquals(out.imageUrl, 'https://polza/result.jpg');
    },
  );
  assertEquals(calls, ['polza', 'replicate', 'polza']);
});

Deno.test('всё отказало — в ошибке первой стоит настоящая причина', async () => {
  await withFetch(
    { polza: [POLZA_503, POLZA_503], replicate: [REPLICATE_402] },
    async () => {
      const err = await assertRejects(() => generateImage({ ...INPUT }));
      const msg = (err as Error).message;
      assertEquals(msg.startsWith('polza 503'), true);
      assertStringIncludes(msg, 'первая попытка: polza 503');
      assertStringIncludes(msg, 'запасной flux-kontext недоступен: flux-kontext 402');
    },
  );
});

Deno.test('постоянный отказ основного не повторяем', async () => {
  const calls = await withFetch({ polza: [POLZA_400] }, async () => {
    await assertRejects(() => generateImage({ ...INPUT }), Error, 'polza 400');
  });
  assertEquals(calls, ['polza']);
});
