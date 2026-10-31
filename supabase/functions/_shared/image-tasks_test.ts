import {
  assertEquals,
  assertRejects,
  assertThrows,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  imageRoutes,
  ImageTaskError,
  pollImageTask,
  providerImageUrl,
  submitImageTask,
} from './image-tasks.ts';
for (const key of ['POLZA_API_KEY', 'REPLICATE_API_TOKEN', 'FAL_KEY']) Deno.env.set(key, 'test');
Deno.env.set('IMAGE_PROVIDER', 'polza');
Deno.env.delete('IMAGE_BACKUP_PROVIDER');
const polza = { provider: 'polza', model: 'test' } as const;
const rep = { provider: 'replicate-flux', model: 'black-forest-labs/flux-kontext-pro' } as const;
const input = {
  photoUrl: 'https://example.com/input.png',
  prompt: 'test',
  style: 'clean',
  format: '4x5',
} as const;
function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

Deno.test('Polza submission is async and both documented URL shapes work', async () => {
  const fetcher: typeof fetch = async (_url, init) => {
    assertEquals(JSON.parse(String(init?.body)).async, true);
    return response({ id: 'task1', status: 'pending' });
  };
  assertEquals(await submitImageTask(polza, input, fetcher), { status: 'pending', id: 'task1' });
  for (
    const data of [{ url: 'https://storage.polza.ai/result.png' }, [{
      url: 'https://storage.polza.ai/result.png',
    }]]
  ) {
    const out = await pollImageTask(polza, 'task1', async (_url, init) => {
      assertEquals(init?.method, 'GET');
      return response({ id: 'task1', status: 'completed', data });
    });
    assertEquals(out.status, 'done');
  }
});
Deno.test('Replicate returns a durable pending task when output is not ready', async () => {
  const out = await submitImageTask(rep, input, async (_url, init) => {
    assertEquals(new Headers(init?.headers).has('Prefer'), false);
    return response({ id: 'prediction1', status: 'starting', output: null }, 201);
  });
  assertEquals(out, { status: 'pending', id: 'prediction1' });
  assertEquals(
    (await pollImageTask(rep, 'prediction1', async (url, init) => {
      assertEquals(String(url).endsWith('/predictions/prediction1'), true);
      assertEquals(init?.method, 'GET');
      return response({
        id: 'prediction1',
        status: 'succeeded',
        output: ['https://replicate.delivery/result.png'],
      });
    })).status,
    'done',
  );
});
Deno.test('network ambiguity cannot trigger a second submission inside an adapter', async () => {
  let calls = 0;
  const error = await assertRejects(() =>
    submitImageTask(polza, input, () => {
      calls++;
      return Promise.reject(new Error('network'));
    }), ImageTaskError);
  assertEquals(error.definitive, false);
  assertEquals(calls, 1);
});
Deno.test('account rejection is distinguished from an ambiguous server failure', async () => {
  for (const status of [402, 503]) {
    const error = await assertRejects(
      () =>
        submitImageTask(
          polza,
          input,
          () => Promise.resolve(response({ error: 'secret detail' }, status)),
        ),
      ImageTaskError,
    );
    assertEquals(error.definitive, status === 402);
    assertEquals(error.canFallback, status === 402);
    assertEquals(error.message.includes('secret detail'), false);
  }
});
Deno.test('fal polling uses owner/app path and opts out of payload history', async () => {
  const fal = { provider: 'fal', model: 'fal-ai/nano-banana/edit' } as const;
  const pending = await submitImageTask(fal, input, async (_url, init) => {
    const headers = new Headers(init?.headers);
    assertEquals(headers.get('X-Fal-Store-IO'), '0');
    assertEquals(
      JSON.parse(headers.get('X-Fal-Object-Lifecycle-Preference')!).expiration_duration_seconds,
      3600,
    );
    return response({ request_id: 'fal-task' });
  });
  assertEquals(pending, { status: 'pending', id: 'fal-task' });
  const calls: string[] = [];
  const done = await pollImageTask(fal, 'fal-task', async (url) => {
    calls.push(String(url));
    return response(
      String(url).endsWith('/status')
        ? { status: 'COMPLETED' }
        : { images: [{ url: 'https://v3.fal.media/result.png' }] },
    );
  });
  assertEquals(done.status, 'done');
  assertEquals(calls, [
    'https://queue.fal.run/fal-ai/nano-banana/requests/fal-task/status',
    'https://queue.fal.run/fal-ai/nano-banana/requests/fal-task',
  ]);
});
Deno.test('fal is not silently added to the default fallback chain', () => {
  assertEquals(imageRoutes().map((r) => r.provider), ['polza', 'replicate-flux']);
  Deno.env.set('IMAGE_BACKUP_PROVIDER', 'fal');
  assertEquals(imageRoutes().map((r) => r.provider), ['polza', 'fal']);
  Deno.env.delete('IMAGE_BACKUP_PROVIDER');
});
Deno.test('result URL guard rejects SSRF locations and credentials', () => {
  for (
    const url of [
      'http://storage.polza.ai/x',
      'https://127.0.0.1/x',
      'https://169.254.169.254/x',
      'https://evil.polza.ai.example/x',
      'https://user:pass@storage.polza.ai/x',
    ]
  ) assertThrows(() => providerImageUrl(url), ImageTaskError);
});
