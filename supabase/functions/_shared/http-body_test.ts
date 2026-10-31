import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { BodyError, readJsonBody, readTextBody } from './http-body.ts';

Deno.test('body limit counts streamed bytes without trusting Content-Length', async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new Uint8Array(7));
      c.enqueue(new Uint8Array(7));
      c.close();
    },
  });
  const req = new Request('https://test', {
    method: 'POST',
    body: stream,
    headers: { 'Content-Length': '1' },
  });
  const error = await assertRejects(() => readTextBody(req, 10), BodyError);
  assertEquals(error.status, 413);
});

Deno.test('body read times out even if the sender never produces bytes', async () => {
  const stream = new ReadableStream<Uint8Array>({ start() {} });
  const req = new Request('https://test', { method: 'POST', body: stream });
  const error = await assertRejects(() => readTextBody(req, 10, 5), BodyError);
  assertEquals(error.status, 408);
});

Deno.test('JSON body accepts an object and rejects scalars or malformed UTF-8', async () => {
  assertEquals(
    await readJsonBody(new Request('https://test', { method: 'POST', body: '{"ok":true}' })),
    { ok: true },
  );
  for (const body of ['[]', 'null', '"x"', '{']) {
    await assertRejects(
      () => readJsonBody(new Request('https://test', { method: 'POST', body })),
      BodyError,
    );
  }
  await assertRejects(
    () =>
      readTextBody(
        new Request('https://test', { method: 'POST', body: new Uint8Array([255]) }),
        10,
      ),
    BodyError,
  );
});
