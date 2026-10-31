// npm run build --prefix app
// node scripts/test-mobile-sam-worker.mjs public-test-photo.jpg cases.json [output-dir]
// Runs the actual compiled app worker in Node worker_threads, NOT a browser.
// Only local public QA photos; every model fetch is restricted to local files.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function bootstrap() {
  const assets = resolve(root, 'app/public/models/mobilesam') + sep;
  globalThis.self = { location: { origin: 'null' }, onmessage: null,
    postMessage: (message, transfer) => parentPort.postMessage(message, transfer) };
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    if (url.protocol !== 'file:') throw new Error('Network forbidden during worker QA');
    const path = fileURLToPath(url);
    if (!path.startsWith(assets)) throw new Error('Forbidden file fetch');
    parentPort.postMessage({ qaRequest: path.slice(assets.length) });
    return new Response(await readFile(path));
  };
  await import(pathToFileURL(workerData.entry).href);
  parentPort.on('message', (message) => self.onmessage?.({ data: message }));
  parentPort.postMessage({ qaReady: true });
}

async function main() {
  if (!process.argv[2] || !process.argv[3]) throw new Error('Pass a local public photo and cases.json');
  const sharp = createRequire(resolve(root, 'app/package.json'))('sharp');
  const photoPath = resolve(root, process.argv[2]);
  const config = JSON.parse(await readFile(resolve(root, process.argv[3]), 'utf8'));
  const out = process.argv[4] ? resolve(root, process.argv[4]) : null;
  if (out) await mkdir(out, { recursive: true });
  const assets = resolve(root, 'app/dist/assets');
  const files = (await readdir(assets)).filter((f) => /^sam-smile-worker-.*\.js$/.test(f));
  if (files.length !== 1) throw new Error('Build app first; expected exactly one model worker');
  const raw = await sharp(photoPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = config.crop;
  const cropped = await sharp(photoPath).extract({ left: b.x, top: b.y, width: b.width, height: b.height }).ensureAlpha().raw().toBuffer();
  const worker = new Worker(new URL(import.meta.url), { workerData: { entry: resolve(assets, files[0]) } });
  let id = 0, ticks = 0, ready;
  const pending = new Map(), requests = [];
  const readyPromise = new Promise((resolve) => { ready = resolve; });
  worker.on('message', (message) => {
    if (message.qaReady) { ready(); return; }
    if (message.qaRequest) { requests.push(message.qaRequest); return; }
    const waiting = pending.get(message.id); if (!waiting) return;
    pending.delete(message.id); clearTimeout(waiting.timer);
    message.ok ? waiting.resolve(message) : waiting.reject(new Error(message.code));
  });
  worker.on('error', (error) => { for (const p of pending.values()) { clearTimeout(p.timer); p.reject(error); } pending.clear(); });
  const send = (message, transfer = []) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(message.id); reject(new Error('worker timeout')); }, 90000);
    pending.set(message.id, { resolve, reject, timer }); worker.postMessage(message, transfer);
  });
  const interval = setInterval(() => ticks++, 25);
  const report = { status: 'running', backend: 'compiled app Worker + CPU WASM in Node (browser UI not verified)', source: config.source,
    photo: { width: raw.info.width, height: raw.info.height }, crop: b, requests, timings: {}, cases: [], failures: [] };
  try {
    await Promise.race([readyPromise, new Promise((_, reject) => setTimeout(() => reject(new Error('bootstrap timeout')), 15000).unref())]);
    const pixels = cropped.buffer.slice(cropped.byteOffset, cropped.byteOffset + cropped.byteLength);
    let start = performance.now(), before = ticks;
    await send({ id: ++id, action: 'prepare', assets: pathToFileURL(resolve(root, 'app/public/models/mobilesam') + sep).href,
      width: b.width, height: b.height, pixels }, [pixels]);
    report.timings.prepareMs = Math.round(performance.now() - start); report.mainThreadTicksDuringPrepare = ticks - before;
    if (ticks - before < 2) throw new Error('The main event loop did not remain responsive');
    for (const test of config.cases) {
      start = performance.now();
      let message;
      try { message = await send({ id: ++id, action: 'segment', points: test.points.filter((p) => p.label === 1 ||
        (p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height))
        .map((p) => ({ x: p.x - b.x, y: p.y - b.y, label: p.label })) }); }
      catch (error) {
        const expected = test.expectUncertain && error.message === 'uncertain';
        if (!expected) report.failures.push(`${test.name}: ${String(error)}`);
        report.cases.push({ name: test.name, accepted: false, expectedRefusal: Boolean(expected) }); continue;
      }
      if (test.expectUncertain) report.failures.push(`Expected a safe refusal: ${test.name}`);
      const selected = new Uint8Array(message.pixels);
      if (selected.length !== b.width * b.height || selected.some((n) => n !== 0 && n !== 1)) throw new Error('Invalid mask dimensions/values');
      const result = { name: test.name, ms: Math.round(performance.now() - start), score: message.score,
        foreground: selected.reduce((a, b) => a + b, 0), checks: [] };
      for (const check of test.checks ?? []) {
        let count = 0;
        for (let y = check.y; y < check.y + check.height; y++) for (let x = check.x; x < check.x + check.width; x++) {
          if (x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height) count += selected[(y - b.y) * b.width + x - b.x];
        }
        const fraction = count / (check.width * check.height), passed = fraction <= (check.maxFraction ?? 1) && fraction >= (check.minFraction ?? 0);
        result.checks.push({ name: check.name, fraction, passed });
        if (!passed) report.failures.push(`Unexpected foreground: ${test.name}/${check.name}`);
      }
      if (out) {
        if (!/^[a-z0-9-]{1,40}$/.test(test.name)) throw new Error('Invalid case name');
        const overlay = Buffer.from(raw.data), mask = Buffer.alloc(raw.data.length);
        for (let y = 0; y < raw.info.height; y++) for (let x = 0; x < raw.info.width; x++) {
          const p = (y * raw.info.width + x) * 4; mask[p + 3] = 255;
          if (x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height && selected[(y - b.y) * b.width + x - b.x]) {
            mask[p] = mask[p + 1] = mask[p + 2] = 255; overlay[p] *= 0.5; overlay[p + 1] = overlay[p + 1] * 0.5 + 127.5; overlay[p + 2] = overlay[p + 2] * 0.5 + 80;
          }
        }
        const options = { raw: { width: raw.info.width, height: raw.info.height, channels: 4 } };
        await sharp(mask, options).png().toFile(resolve(out, test.name + '-mask.png'));
        await sharp(overlay, options).png().toFile(resolve(out, test.name + '-overlay.png'));
      }
      report.cases.push(result);
    }
    report.status = report.failures.length ? 'failed' : 'passed';
    if (report.failures.length) process.exitCode = 1;
  } catch (error) { report.status = 'failed'; report.error = String(error); process.exitCode = 1; }
  finally {
    clearInterval(interval); for (const p of pending.values()) clearTimeout(p.timer);
    await worker.terminate(); report.peakProcessRss = process.resourceUsage().maxRSS * 1024;
    if (out) await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  }
}

if (isMainThread) await main(); else await bootstrap();
