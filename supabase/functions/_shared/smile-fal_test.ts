import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createFalSmileTask, smileProviderConfig } from './smile-fal.ts';
import { SmileError } from './smile-preview.ts';
const settings = {
  teeth: [11],
  shades: { '11': 'A1' },
  shape: 'original',
  zenithMode: 'preserve',
  translucency: 'natural',
} as const;
const input = {
  photoData: 'data:image/png;base64,AA==',
  maskData: 'data:image/png;base64,AQ==',
  settings: { ...settings, teeth: [11] },
  signal: AbortSignal.timeout(5000),
};
Deno.test('alternative smile processor needs an explicit approval and matching key', async () => {
  Deno.env.set('SMILE_PROVIDER', 'fal');
  Deno.env.delete('SMILE_EXTERNAL_PROVIDER_APPROVED');
  assertEquals(
    (await assertRejects(() => createFalSmileTask(input), SmileError)).code,
    'not_configured',
  );
  Deno.env.set('SMILE_EXTERNAL_PROVIDER_APPROVED', 'fal');
  Deno.env.set('FAL_KEY', 'fixture');
  assertEquals(smileProviderConfig().providerName, 'fal');
  assertEquals(
    (await assertRejects(
      () => createFalSmileTask({ ...input, photoData: 'https://private.example/portrait.png' }),
      SmileError,
    )).code,
    'provider_response',
  );
});
Deno.test('fal receives only the supplied crop and mask and submits once', async () => {
  Deno.env.set('SMILE_EXTERNAL_PROVIDER_APPROVED', 'fal');
  Deno.env.set('FAL_KEY', 'fixture');
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async (url, init) => {
      calls++;
      assertEquals(String(url), 'https://queue.fal.run/fal-ai/nano-banana/edit');
      const body = JSON.parse(String(init?.body));
      assertEquals(body.image_urls, [input.photoData, input.maskData]);
      return Response.json({ request_id: 'smile-fixture' });
    };
    assertEquals(await createFalSmileTask(input), { status: 'processing', id: 'smile-fixture' });
    assertEquals(calls, 1);
  } finally {
    globalThis.fetch = original;
    Deno.env.delete('SMILE_PROVIDER');
    Deno.env.delete('SMILE_EXTERNAL_PROVIDER_APPROVED');
  }
});
