import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
for (
  const name of ['SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'BOT_TOKEN', 'POLZA_API_KEY']
) Deno.env.set(name, 'test');
Deno.env.set('SUPABASE_URL', 'http://localhost');
const { generateText } = await import('./polza.ts');
const input = { workType: 'veneer', textType: 'short', brandHashtags: ['#lab'] } as const;

Deno.test('caption failure preserves a neutral local caption and existing brand tags', async () => {
  const original = globalThis.fetch;
  try {
    for (
      const response of [
        new Response('unavailable', { status: 503 }),
        new Response('{"choices":[]}'),
        new Response(JSON.stringify({ choices: [{ message: { content: '{"main":42}' } }] })),
      ]
    ) {
      globalThis.fetch = (() => Promise.resolve(response)) as typeof fetch;
      const out = await generateText({ ...input, brandHashtags: [...input.brandHashtags] });
      assertEquals(out.source, 'template');
      assertEquals(out.main, 'Виниры. Детали работы на фото.');
      assertEquals(out.hashtags, ['#lab']);
    }
    globalThis.fetch = (() => Promise.reject(new Error('timeout'))) as typeof fetch;
    assertEquals((await generateText({ textType: 'short' })).source, 'template');
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test('valid AI caption and disabled text retain their distinct source', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"main":"Работа.","hashtags":["#lab"]}' } }],
          }),
        ),
      )) as typeof fetch;
    assertEquals((await generateText({ textType: 'short' })).source, 'ai');
    globalThis.fetch = (() => {
      throw new Error('must not call');
    }) as typeof fetch;
    assertEquals((await generateText({ textType: 'none' })).source, 'none');
  } finally {
    globalThis.fetch = original;
  }
});
