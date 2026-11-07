/// <reference lib="dom" />
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  deleteSmileLocalSource, isSmileCropJob, loadSmileLocalSource, markSmileCropJob, saveSmileLocalSource,
  type SmileLocalSource,
} from '../app/src/lib/smile-local-source.ts';

const job = (n: number) => `12345678-1234-4123-8123-${String(n).padStart(12, '0')}`;
const png = (text: string) => new Blob([text], { type: 'image/png' });
const fixture = (): SmileLocalSource => ({
  photo: { blob: png('local original'), width: 600, height: 400 },
  crop: { photo: png('mouth only'), mask: png('mouth mask'), sourceWidth: 600, sourceHeight: 400,
    width: 300, height: 210, region: { x: 165, y: 115, width: 300, height: 210 }, offsetX: 0, offsetY: 0,
    polygon: [{ x: 30, y: 40 }, { x: 260, y: 40 }, { x: 250, y: 170 }, { x: 40, y: 170 }] },
});

// Fake only the browser persistence boundary. Requests and transaction completion
// are asynchronous; the application's validation, expiry, queuing and cleanup run unchanged.
function browserStore() {
  const records = new Map<string, any>();
  const session = new Map<string, string>();
  const state = { opens: 0, closes: 0, failPuts: false, blocked: false, stalledOpen: false, transactions: 0 };
  function transaction() {
    state.transactions++;
    let active = true, pending = 0, completeQueued = false;
    const tx: any = { oncomplete: null, onerror: null, onabort: null };
    function maybeComplete() {
      if (!active || pending || completeQueued) return;
      completeQueued = true;
      queueMicrotask(() => {
        completeQueued = false;
        if (active && !pending) { active = false; tx.oncomplete?.(); }
      });
    }
    tx.abort = () => {
      if (!active) throw new DOMException('inactive', 'InvalidStateError');
      active = false; queueMicrotask(() => tx.onabort?.());
    };
    function request(run: () => any) {
      const req: any = { result: undefined, onsuccess: null, onerror: null };
      pending++;
      queueMicrotask(() => {
        if (!active) return;
        try { req.result = run(); req.onsuccess?.(); }
        catch { req.onerror?.(); tx.onerror?.(); if (active) tx.abort(); }
        pending--; maybeComplete();
      });
      return req;
    }
    const store: any = {
      put(value: any) { return request(() => {
        if (state.failPuts) throw new DOMException('quota', 'QuotaExceededError');
        records.set(value.jobId, structuredClone(value)); return value.jobId;
      }); },
      get(key: string) { return request(() => structuredClone(records.get(key))); },
      delete(key: string) { return request(() => records.delete(key)); },
      openCursor() {
        const req: any = { result: undefined, onsuccess: null, onerror: null };
        const keys = [...records.keys()]; let index = 0;
        const next = () => {
          pending++;
          queueMicrotask(() => {
            if (!active) return;
            const key = keys[index++];
            req.result = key === undefined ? null : { value: records.get(key),
              delete: () => store.delete(key), continue: next };
            req.onsuccess?.(); pending--; maybeComplete();
          });
        };
        next(); return req;
      },
    };
    tx.objectStore = () => store;
    maybeComplete(); return tx;
  }
  const idb = { open() {
    state.opens++;
    const req: any = { onupgradeneeded: null, onblocked: null, onerror: null, onsuccess: null, result: undefined };
    const db: any = { objectStoreNames: { contains: () => true }, createObjectStore() {},
      transaction, close() { state.closes++; }, onversionchange: null };
    queueMicrotask(() => {
      if (state.stalledOpen) return;
      if (state.blocked) {
        req.onblocked?.();
        // A blocked open can eventually succeed; its late connection must close.
        queueMicrotask(() => { req.result = db; req.onsuccess?.(); });
      } else { req.result = db; req.onsuccess?.(); }
    });
    return req;
  } };
  const storage = { getItem: (key: string) => session.get(key) ?? null,
    setItem: (key: string, value: string) => session.set(key, value), removeItem: (key: string) => session.delete(key) };
  return { idb, storage, records, session, state };
}

async function withBrowser(run: (browser: ReturnType<typeof browserStore>) => Promise<void>) {
  const previous = new Map(['indexedDB', 'sessionStorage', 'fetch'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const browser = browserStore();
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: browser.idb });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: browser.storage });
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: () => { throw new Error('Network must never be used for local originals'); } });
  try { await run(browser); }
  finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as any)[key];
    }
  }
}

Deno.test('local original round-trips only bounded PNG blobs and geometry, never URLs or extra component state', async () => {
  await withBrowser(async (browser) => {
    const source = fixture();
    source.photo.blob = new File([source.photo.blob], 'private-owner-name.png', { type: 'image/png' });
    Object.assign(source.photo, { url: 'blob:private-preview', filename: 'person.png' });
    Object.assign(source.crop, { url: 'https://never-persist.invalid/image', privateState: 'extra' });
    Object.assign(source.crop.region, { url: 'blob:extra-region' });
    assertEquals(await saveSmileLocalSource(job(1), source), true);
    const loaded = await loadSmileLocalSource(job(1));
    assert(loaded);
    assertEquals(await loaded.photo.blob.text(), 'local original');
    assertEquals(loaded.photo.blob instanceof File, false);
    assertEquals(await loaded.crop.photo.text(), 'mouth only');
    assertEquals(await loaded.crop.mask.text(), 'mouth mask');
    assertEquals(Object.keys(loaded.photo).sort(), ['blob', 'height', 'width']);
    assertEquals('url' in loaded.crop, false);
    assertEquals('privateState' in loaded.crop, false);
    assertEquals('url' in loaded.crop.region, false);
    assertEquals(browser.state.opens, browser.state.closes);
    assertEquals(browser.session.size, 0);
  });
});

Deno.test('the session marker stores only the opaque job ID and deletion prevents late saves', async () => {
  await withBrowser(async (browser) => {
    markSmileCropJob(job(2));
    assertEquals(isSmileCropJob(job(2)), true);
    assertEquals([...browser.session.values()], [job(2)]);
    const writing = saveSmileLocalSource(job(2), fixture());
    const deleting = deleteSmileLocalSource(job(2));
    await writing; await deleting;
    assertEquals(isSmileCropJob(job(2)), false);
    assertEquals(browser.records.has(job(2)), false);
    assertEquals(await saveSmileLocalSource(job(2), fixture()), false);
    assertEquals(await loadSmileLocalSource(job(2)), null);
  });
});

Deno.test('expired originals are purged on the next operation and cannot be recovered', async () => {
  await withBrowser(async (browser) => {
    assertEquals(await saveSmileLocalSource(job(3), fixture()), true);
    const stored = browser.records.get(job(3));
    const ttl = stored.expiresAt - stored.createdAt;
    assertEquals(ttl, 24 * 60 * 60_000);
    stored.createdAt = Date.now() - ttl - 1;
    stored.expiresAt = Date.now() - 1;
    assertEquals(await loadSmileLocalSource(job(3)), null);
    assertEquals(browser.records.has(job(3)), false);
    assertEquals(browser.state.opens, browser.state.closes);
  });
});

Deno.test('invalid IDs, unsafe blob types and mismatched geometry never reach browser persistence', async () => {
  await withBrowser(async (browser) => {
    for (const id of ['', '../private', 'https://example.invalid/person.png']) {
      assertEquals(await saveSmileLocalSource(id, fixture()), false);
      assertEquals(await loadSmileLocalSource(id), null);
      markSmileCropJob(id); await deleteSmileLocalSource(id);
    }
    const badPhoto = fixture(); badPhoto.photo.blob = new Blob(['jpeg'], { type: 'image/jpeg' });
    const badGeometry = fixture(); badGeometry.crop.sourceWidth = 601;
    assertEquals(await saveSmileLocalSource(job(4), badPhoto), false);
    assertEquals(await saveSmileLocalSource(job(5), badGeometry), false);
    assertEquals(browser.state.opens, 0);
    assertEquals(browser.session.size, 0);
  });
});

Deno.test('quota failures and blocked opens gracefully return false/null and close late connections', async () => {
  await withBrowser(async (browser) => {
    browser.state.failPuts = true;
    assertEquals(await saveSmileLocalSource(job(6), fixture()), false);
    assertEquals(await loadSmileLocalSource(job(6)), null);
    browser.state.blocked = true;
    assertEquals(await saveSmileLocalSource(job(7), fixture()), false);
    assertEquals(await loadSmileLocalSource(job(7)), null);
    await Promise.resolve();
    assertEquals(browser.state.opens, browser.state.closes);
  });
});

Deno.test('unavailable private-browser storage does not block saving, status recovery or deletion', async () => {
  await withBrowser(async () => {
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined });
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true,
      get() { throw new DOMException('unavailable', 'SecurityError'); } });
    assertEquals(await saveSmileLocalSource(job(8), fixture()), false);
    assertEquals(await loadSmileLocalSource(job(8)), null);
    markSmileCropJob(job(8));
    assertEquals(isSmileCropJob(job(8)), false);
    await deleteSmileLocalSource(job(8));
  });
});

Deno.test('a stalled IndexedDB connection stops waiting within the bounded browser operation', async () => {
  await withBrowser(async (browser) => {
    browser.state.stalledOpen = true;
    const started = performance.now();
    assertEquals(await saveSmileLocalSource(job(9), fixture()), false);
    assert(performance.now() - started < 5000);
  });
});
