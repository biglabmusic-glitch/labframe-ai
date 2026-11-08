// Run in its own Deno process: this suite replaces fetch and captures Deno.serve.
// Authentication is real Telegram HMAC over a fixture token, never a production bypass.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { Image } from 'https://deno.land/x/imagescript@1.2.17/mod.ts';
import { decryptSmileImage, encryptSmileImage } from '../../../app/src/lib/smile-crypto.ts';

const fixtureToken = '123456:local-smile-api-fixture';
const origin = 'https://smile-api-fixture.invalid';

async function signedInitData(id: number): Promise<string> {
  const pairs: [string, string][] = [
    ['auth_date', String(Math.floor(Date.now() / 1000))],
    ['user', JSON.stringify({ id, first_name: 'Fixture' })],
  ];
  const encoder = new TextEncoder();
  const secret = await crypto.subtle.importKey('raw', encoder.encode('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const secretBytes = await crypto.subtle.sign('HMAC', secret, encoder.encode(fixtureToken));
  const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const hashBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(pairs.map(([name, value]) => `${name}=${value}`).sort().join('\n')));
  const hash = [...new Uint8Array(hashBytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return new URLSearchParams([...pairs, ['hash', hash]]).toString();
}

function asBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

function copiedBuffer(bytes: Uint8Array): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

Deno.test('smile API: real auth, closed access, encrypted upload → crop → encrypted result, ownership and delete', async (test) => {
  const originalFetch = globalThis.fetch;
  const originalServe = Deno.serve;
  const environment = {
    SUPABASE_URL: origin, SUPABASE_ANON_KEY: 'fixture-anon', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service',
    REPLICATE_API_TOKEN: 'fixture-replicate', POLZA_API_KEY: 'fixture-polza', BOT_TOKEN: fixtureToken,
    ADMIN_IDS: '101', SMILE_ENCRYPTION_KEY: btoa('m'.repeat(32)), POLZA_MEDIA_BASE_URL: 'https://polza.ai/api/v1',
  };
  const previous = new Map(Object.keys(environment).map((name) => [name, Deno.env.get(name)]));
  for (const [name, value] of Object.entries(environment)) Deno.env.set(name, value);
  const objects = new Map<string, Uint8Array>();
  let handler: ((request: Request) => Promise<Response>) | undefined;
  let permissionsFail = false, bucketPublic = false, providerCalls = 0;
  let providerReady = false, providerReadFail = false;
  let providerSubmissionMode: 'pending' | 'inline' | 'rejected' | 'unknown' = 'pending';
  let providerOutput = '';
  const providerRequests: { input: { images: { type: string; data: string }[]; prompt: string } }[] = [];
  let beforeObjectInsert: ((path: string, bytes: Uint8Array) => Promise<void>) | undefined;
  const work: Promise<unknown>[] = [];
  const runtime = globalThis as unknown as { EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void } };
  const previousRuntime = runtime.EdgeRuntime;
  runtime.EdgeRuntime = { waitUntil: (promise) => { work.push(promise); } };
  Deno.serve = ((candidate: unknown) => {
    handler = candidate as typeof handler;
    return {};
  }) as typeof Deno.serve;

  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.origin === origin && url.pathname === '/rest/v1/users') {
      if (permissionsFail) return Response.json({ message: 'fixture database unavailable' }, { status: 503 });
      const id = Number(url.searchParams.get('id')?.replace('eq.', ''));
      return Response.json(id === 105 ? [] : [{ is_admin: id === 101, smile_tester: id === 102 || id === 104, banned: id === 104,consent_at:new Date().toISOString(),consent_version:2 }]);
    }
    if (url.origin === origin && url.pathname === '/rest/v1/rpc/hit_rate_limit') return Response.json(true);
    if (url.origin === origin && url.pathname === '/storage/v1/bucket/photos') return Response.json({ id: 'photos', name: 'photos', public: bucketPublic });
    if (url.origin === origin && url.pathname === '/storage/v1/object/list/photos') {
      const { prefix } = await request.json();
      return Response.json([...objects.keys()].filter((path) => path.startsWith(`${prefix}/`)).map((path) => ({ name: path.slice(prefix.length + 1) })));
    }
    if (url.origin === origin && url.pathname === '/storage/v1/object/photos' && request.method === 'DELETE') {
      const { prefixes } = await request.json();
      for (const path of prefixes) objects.delete(path);
      return Response.json([]);
    }
    if (url.origin === origin && url.pathname.startsWith('/storage/v1/object/upload/sign/photos/')) {
      return Response.json({ url: url.pathname.replace('/storage/v1', '') + '?token=fixture', token: 'fixture' });
    }
    if (url.origin === origin && url.pathname.startsWith('/storage/v1/object/sign/photos/') && request.method === 'POST') {
      return Response.json({ signedURL: url.pathname.replace('/storage/v1', '') + '?token=fixture' });
    }
    const storagePrefix = '/storage/v1/object/photos/';
    const readPrefix = '/storage/v1/object/authenticated/photos/';
    const signedPrefix = '/storage/v1/object/sign/photos/';
    if (url.origin === origin && request.method === 'GET' && (url.pathname.startsWith(readPrefix) || url.pathname.startsWith(signedPrefix) || url.pathname.startsWith(storagePrefix))) {
      const prefix = url.pathname.startsWith(readPrefix) ? readPrefix : url.pathname.startsWith(signedPrefix) ? signedPrefix : storagePrefix;
      const path = decodeURIComponent(url.pathname.slice(prefix.length));
      return objects.has(path) ? new Response(copiedBuffer(objects.get(path)!)) : Response.json({ message: 'not found' }, { status: 404 });
    }
    if (url.origin === origin && url.pathname.startsWith(storagePrefix) && request.method === 'POST') {
      const path = decodeURIComponent(url.pathname.slice(storagePrefix.length));
      const bytes = new Uint8Array(await request.arrayBuffer());
      await beforeObjectInsert?.(path, bytes);
      if (objects.has(path) && request.headers.get('x-upsert') !== 'true') return Response.json({ message: 'exists' }, { status: 409 });
      objects.set(path, bytes);
      return Response.json({ Key: `photos/${path}`, Id: 'fixture' });
    }
    if (url.hostname === 'polza.ai' && url.pathname === '/api/v1/media') {
      providerCalls++;
      if (providerSubmissionMode === 'rejected') return new Response(null, { status: 422 });
      if (providerSubmissionMode === 'unknown') throw new TypeError('fixture lost submission response');
      const payload = await request.json();
      providerRequests.push(payload);
      assertEquals(payload.async, true);
      assert(!JSON.stringify(payload).includes(origin));
      assert(!JSON.stringify(payload).includes(environment.SMILE_ENCRYPTION_KEY));
      const image = await Image.decode(Uint8Array.from(atob(payload.input.images[0].data.split(',')[1]), (char) => char.charCodeAt(0)));
      assert(image.width < 64 && image.height < 64, 'the provider receives only the selected crop');
      image.fill(0x112233ff);
      providerOutput = `data:image/png;base64,${asBase64(await image.encode())}`;
      return Response.json(providerSubmissionMode === 'inline'
        ? { id: 'aig_fixture', status: 'completed', data: { url: 'https://polza.ai/fixture-result.png' } }
        : { id: 'aig_fixture', status: 'pending' });
    }
    if (url.hostname === 'polza.ai' && url.pathname === '/fixture-result.png') return new Response(null, { status: 503 });
    if (url.hostname === 'polza.ai' && url.pathname === '/api/v1/media/aig_fixture') {
      if (providerReadFail) return Response.json({ error: 'unavailable' }, { status: 503 });
      return Response.json(providerReady ? { status: 'completed', data: { url: providerOutput } }
        : { id: 'aig_fixture', status: 'processing' });
    }
    throw new Error(`Unexpected fixture request: ${request.method} ${url.origin}${url.pathname}`);
  };

  try {
    await import('./index.ts');
    assert(handler);
    const call = async (id: number, body: unknown, authenticated = true) => handler!(new Request(`${origin}/functions/v1/smile-preview`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(authenticated ? { 'x-telegram-initdata': await signedInitData(id) } : {}) },
      body: JSON.stringify(body),
    }));
    await test.step('authentication and permission failures deny access', async () => {
      assertEquals((await call(101, { action: 'prepare', consent: true }, false)).status, 401);
      for (const id of [103, 104, 105]) assertEquals((await call(id, { action: 'prepare', consent: true })).status, 403);
      permissionsFail = true;
      assertEquals((await call(101, { action: 'prepare', consent: true })).status, 503);
      permissionsFail = false;
      bucketPublic = true;
      assertEquals((await call(101, { action: 'prepare', consent: true })).status, 503);
      bucketPublic = false;
      assertEquals(providerCalls, 0);
      assertEquals(objects.size, 0);
    });
    let prepared: { jobId: string; photo: { path: string }; mask: { path: string }; rehabilitationModes: string[]; encryption: { algorithm: 'AES-GCM'; key: string } };
    await test.step('an invited tester prepares an encrypted private job', async () => {
      const response = await call(102, { action: 'prepare', consent: true });
      assertEquals(response.status, 200);
      assertEquals(response.headers.get('cache-control'), 'no-store');
      prepared = await response.json();
      assertEquals(prepared.rehabilitationModes, ['total', 'front']);
      assert(prepared.photo.path.endsWith('/source.enc'));
      assert(prepared.mask.path.endsWith('/mask.enc'));
      assertEquals(atob(prepared.encryption.key).length, 32);
      assert(prepared.encryption.key !== environment.SMILE_ENCRYPTION_KEY);
      const photo = new Image(64, 64).fill(0xaabbccff);
      const mask = new Image(64, 64).fill(0x000000ff);
      for (let y = 40; y < 46; y++) for (let x = 20; x < 32; x++) mask.setPixelAt(x + 1, y + 1, 0xffffffff);
      for (const [kind, image, path] of [['photo', photo, prepared.photo.path], ['mask', mask, prepared.mask.path]] as const) {
        const blob = await encryptSmileImage(new Blob([copiedBuffer(await image.encode())]), prepared.encryption, prepared.jobId, kind);
        objects.set(path, new Uint8Array(await blob.arrayBuffer()));
      }
    });
    await test.step('another participant cannot read or delete this job', async () => {
      assertEquals((await call(101, { action: 'status', jobId: prepared.jobId })).status, 404);
      const count = objects.size;
      assertEquals((await call(101, { action: 'delete', jobId: prepared.jobId })).status, 200);
      assertEquals(objects.size, count);
    });
    await test.step('generation preserves protected pixels and stores only encrypted output', async () => {
      const response = await call(102, {
        action: 'generate', jobId: prepared.jobId,
        settings: { teeth: [11], shades: { '11': 'BL1' }, shape: 'original', zenithMode: 'preserve', translucency: 'natural' },
      });
      assertEquals(response.status, 200);
      await Promise.all(work);
      const manifestPath = prepared.photo.path.replace('source.enc', 'manifest.json');
      const manifest = JSON.parse(new TextDecoder().decode(objects.get(manifestPath)));
      assertEquals(manifest.providerId, 'aig_fixture');
      // Survive the old 100-second worker timeout / 150-second stale cutoff.
      manifest.startedAt = Date.now() - 180_000;
      objects.set(manifestPath, new TextEncoder().encode(JSON.stringify(manifest)));
      assertEquals((await (await call(102, { action: 'status', jobId: prepared.jobId })).json()).status, 'processing');
      providerReadFail = true;
      assertEquals((await (await call(102, { action: 'status', jobId: prepared.jobId })).json()).status, 'processing');
      providerReadFail = false;
      providerReady = true;
      const statusResponse = await call(102, { action: 'status', jobId: prepared.jobId });
      const status = await statusResponse.json();
      assertEquals(status.status, 'done');
      assertEquals(providerCalls, 1);
      assertEquals(providerRequests[0].input.images.length, 2, 'legacy jobs retain their photo and mask contract');
      assert(providerRequests[0].input.prompt.includes('Leave the lower teeth'));
      const resultPath = `${prepared.photo.path.slice(0, -'source.enc'.length)}result.enc`;
      const cipher = objects.get(resultPath);
      assert(cipher);
      assertEquals(cipher[0], 1);
      const plain = await decryptSmileImage(new Blob([copiedBuffer(cipher)]), status.encryption, prepared.jobId, 'result');
      const image = await Image.decode(new Uint8Array(await plain.arrayBuffer()));
      assertEquals(image.getPixelAt(1, 1), 0xaabbccff);
      assertEquals(image.getPixelAt(22, 42), 0x112233ff);
      const repeated = await call(102, { action: 'generate', jobId: prepared.jobId });
      assertEquals((await repeated.json()).status, 'done');
      assertEquals(providerCalls, 1);
    });
    await test.step('deletion removes source, mask, result and metadata', async () => {
      assertEquals((await call(102, { action: 'delete', jobId: prepared.jobId })).status, 200);
      const remaining = [...objects.keys()].filter((path) => path.startsWith(`102/smile-pilot/${prepared.jobId}/`));
      assert(remaining.every((path) => path.endsWith('/running.json')), 'only a non-image deletion lock may remain');
      assertEquals((await call(102, { action: 'status', jobId: prepared.jobId })).status, 404);
    });
    await test.step('delete wins an atomic race against a delayed generation lock', async () => {
      const preparedResponse = await call(102, { action: 'prepare', consent: true });
      assertEquals(preparedResponse.status, 200);
      const job = await preparedResponse.json();
      let reached!: () => void, release!: () => void;
      const lockReached = new Promise<void>((resolve) => { reached = resolve; });
      const lockReleased = new Promise<void>((resolve) => { release = resolve; });
      beforeObjectInsert = async (path, bytes) => {
        if (path === `102/smile-pilot/${job.jobId}/running.json` && !JSON.parse(new TextDecoder().decode(bytes)).deleted) {
          reached();
          await lockReleased;
        }
      };
      const pending = call(102, {
        action: 'generate', jobId: job.jobId,
        settings: { teeth: [11], shades: { '11': 'BL1' }, shape: 'original', zenithMode: 'preserve', translucency: 'natural' },
      });
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([lockReached, new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new Error('generation did not reach the fixture lock')), 2000);
        })]);
        clearTimeout(timeout);
        assertEquals((await call(102, { action: 'delete', jobId: job.jobId })).status, 200);
      } finally {
        clearTimeout(timeout);
        release();
        beforeObjectInsert = undefined;
      }
      assertEquals((await pending).status, 404);
      assertEquals(providerCalls, 1);
      const remaining = [...objects.keys()].filter((path) => path.startsWith(`102/smile-pilot/${job.jobId}/`));
      assertEquals(remaining, [`102/smile-pilot/${job.jobId}/running.json`]);
    });
    await test.step('deletion cannot be undone by a status check finishing at the same time', async () => {
      const job = await (await call(102, { action: 'prepare', consent: true })).json();
      const photo = new Image(64, 64).fill(0xaabbccff), mask = new Image(64, 64).fill(0x000000ff);
      for (let y = 40; y < 46; y++) for (let x = 20; x < 32; x++) mask.setPixelAt(x + 1, y + 1, 0xffffffff);
      for (const [kind, image, path] of [['photo', photo, job.photo.path], ['mask', mask, job.mask.path]] as const) {
        const encrypted = await encryptSmileImage(new Blob([copiedBuffer(await image.encode())]), job.encryption, job.jobId, kind);
        objects.set(path, new Uint8Array(await encrypted.arrayBuffer()));
      }
      await call(102, { action: 'generate', jobId: job.jobId, settings: {
        teeth: [11], shades: { '11': 'BL1' }, shape: 'original', zenithMode: 'preserve', translucency: 'natural',
      } });
      await Promise.all(work);
      let reached!: () => void, release!: () => void;
      const reachedPromise = new Promise<void>((resolve) => { reached = resolve; });
      const releasedPromise = new Promise<void>((resolve) => { release = resolve; });
      let paused = false;
      beforeObjectInsert = async (path, bytes) => {
        if (!paused && path === `102/smile-pilot/${job.jobId}/manifest.json` && JSON.parse(new TextDecoder().decode(bytes)).status === 'done') {
          paused = true; reached(); await releasedPromise;
        }
      };
      const finishing = call(102, { action: 'status', jobId: job.jobId });
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([reachedPromise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('finish lock not reached')), 2000); })]);
        assertEquals((await call(102, { action: 'delete', jobId: job.jobId })).status, 200);
      } finally { clearTimeout(timer); release(); beforeObjectInsert = undefined; }
      assertEquals((await finishing).status, 404);
      assertEquals((await call(102, { action: 'status', jobId: job.jobId })).status, 404);
      const remaining = [...objects.keys()].filter((path) => path.startsWith(`102/smile-pilot/${job.jobId}/`));
      assertEquals(remaining, [`102/smile-pilot/${job.jobId}/running.json`]);
      assertEquals(providerCalls, 2);
    });
    await test.step('crop modes advertise support and process both arches with one provider photo', async () => {
      for (const rehabilitationMode of ['total', 'front'] as const) {
        const response = await call(102, { action: 'prepare', consent: true });
        assertEquals(response.status, 200);
        const job = await response.json();
        assertEquals(job.rehabilitationModes, ['total', 'front']);
        const source = new Image(64, 64).fill(0xaabbccff);
        const mask = new Image(64, 64).fill(0x000000ff);
        for (let y = 36; y < 40; y++) for (let x = 22; x < 34; x++) mask.setPixelAt(x + 1, y + 1, 0xffffffff);
        for (let y = 44; y < 48; y++) for (let x = 23; x < 33; x++) mask.setPixelAt(x + 1, y + 1, 0xffffffff);
        for (const [kind, image, path] of [['photo', source, job.photo.path], ['mask', mask, job.mask.path]] as const) {
          const encrypted = await encryptSmileImage(new Blob([copiedBuffer(await image.encode())]), job.encryption, job.jobId, kind);
          objects.set(path, new Uint8Array(await encrypted.arrayBuffer()));
        }
        const callsBefore = providerCalls;
        const baseSettings = { rehabilitationMode, shape: 'rounded', zenithMode: 'preserve', translucency: 'natural' };
        const invalid = await call(102, { action: 'generate', jobId: job.jobId, settings: baseSettings });
        assertEquals(invalid.status, 400, 'a missing shared shade must fail before a paid request');
        assertEquals(providerCalls, callsBefore);
        const generated = await call(102, { action: 'generate', jobId: job.jobId, settings: { ...baseSettings, shade: 'A1' } });
        assertEquals(generated.status, 200);
        await Promise.all(work);
        assertEquals(providerCalls, callsBefore + 1);
        const request = providerRequests.at(-1)!;
        assertEquals(request.input.images.length, 1);
        assertEquals(request.input.images[0].type, 'base64');
        assert(request.input.prompt.includes('BOTH the UPPER and LOWER jaws'));
        assert(request.input.prompt.includes('COMMON SHADE: A1'));
        assert(!request.input.prompt.includes('Leave the lower teeth'));
        assert(!request.input.prompt.includes('SECOND image'));
        if (rehabilitationMode === 'front') {
          assert(request.input.prompt.includes('from canine to canine inclusive'));
          assert(request.input.prompt.includes('ALL premolars and molars on BOTH sides of BOTH jaws'));
        } else assert(request.input.prompt.includes('change ALL already visible teeth'));
        const status = await (await call(102, { action: 'status', jobId: job.jobId })).json();
        assertEquals(status.status, 'done');
        const resultPath = `${job.photo.path.slice(0, -'source.enc'.length)}result.enc`;
        const encryptedResult = objects.get(resultPath);
        assert(encryptedResult);
        const plain = await decryptSmileImage(new Blob([copiedBuffer(encryptedResult)]), status.encryption, job.jobId, 'result');
        const result = await Image.decode(new Uint8Array(await plain.arrayBuffer()));
        assertEquals(result.getPixelAt(28, 39), 0x112233ff, 'upper interior uses generated pixels');
        assertEquals(result.getPixelAt(28, 47), 0x112233ff, 'lower interior uses generated pixels');
        assertEquals(result.getPixelAt(1, 1), source.getPixelAt(1, 1));
        assertEquals((await (await call(102, { action: 'generate', jobId: job.jobId })).json()).status, 'done');
        assertEquals(providerCalls, callsBefore + 1, 'status and repeat clicks cannot generate twice');
        assertEquals((await call(102, { action: 'delete', jobId: job.jobId })).status, 200);
        assertEquals((await call(102, { action: 'status', jobId: job.jobId })).status, 404);
      }
    });
    await test.step('download recovery retains provider ID; rejected and unacknowledged submissions remain distinct', async () => {
      for (const submissionMode of ['inline', 'rejected', 'unknown'] as const) {
        providerSubmissionMode = submissionMode;
        const job = await (await call(102, { action: 'prepare', consent: true })).json();
        const photo = new Image(64, 64).fill(0xaabbccff), mask = new Image(64, 64).fill(0x000000ff);
        for (let y = 40; y < 46; y++) for (let x = 20; x < 32; x++) mask.setPixelAt(x + 1, y + 1, 0xffffffff);
        for (const [kind, image, path] of [['photo', photo, job.photo.path], ['mask', mask, job.mask.path]] as const) {
          const cipher = await encryptSmileImage(new Blob([copiedBuffer(await image.encode())]), job.encryption, job.jobId, kind);
          objects.set(path, new Uint8Array(await cipher.arrayBuffer()));
        }
        const callsBefore = providerCalls;
        await call(102, { action: 'generate', jobId: job.jobId, settings: {
          teeth: [11], shades: { '11': 'BL1' }, shape: 'original', zenithMode: 'preserve', translucency: 'natural',
        } });
        await Promise.all(work);
        const path = job.photo.path.replace('source.enc', 'manifest.json');
        const manifest = JSON.parse(new TextDecoder().decode(objects.get(path)));
        if (submissionMode === 'inline') {
          assertEquals(manifest.providerId, 'aig_fixture'); assertEquals(manifest.status, 'processing');
          providerReady = true;
          assertEquals((await (await call(102, { action: 'status', jobId: job.jobId })).json()).status, 'done');
        } else if (submissionMode === 'rejected') {
          assertEquals(manifest.status, 'failed'); assertEquals(manifest.errorCode, 'provider_rejected');
        } else {
          assertEquals(manifest.status, 'processing'); assertEquals(manifest.providerId, undefined);
          manifest.startedAt = Date.now() - 120_000;
          objects.set(path, new TextEncoder().encode(JSON.stringify(manifest)));
          objects.set(job.photo.path.replace('source.enc', 'running.json'), new TextEncoder().encode(JSON.stringify({ startedAt: manifest.startedAt })));
          const status = await (await call(102, { action: 'status', jobId: job.jobId })).json();
          assertEquals(status.status, 'processing'); assertEquals(status.stage, 'confirmation_pending');
        }
        assertEquals(providerCalls, callsBefore + 1, 'recovery never creates a second generation');
      }
      providerSubmissionMode = 'pending';
    });
  } finally {
    globalThis.fetch = originalFetch;
    Deno.serve = originalServe;
    runtime.EdgeRuntime = previousRuntime;
    for (const [name, value] of previous) value === undefined ? Deno.env.delete(name) : Deno.env.set(name, value);
  }
});
