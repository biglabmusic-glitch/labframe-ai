import * as ort from 'onnxruntime-web/wasm';
import { selectSamMask } from './sam-mask-selection';
import { samEncoderImage, samPromptPoints } from './sam-image';
import type { SamWorkerRequest, SamWorkerResponse } from './sam-smile-protocol';
import type { LocalSamPoint } from './sam-mask-selection';

// One worker per image keeps native inference off the UI thread. Termination
// releases the entire WASM arena, including memory retained by its allocator.
const worker = self as unknown as {
  location: Location;
  onmessage: ((event: MessageEvent<SamWorkerRequest>) => void) | null;
  postMessage(message: SamWorkerResponse, transfer?: Transferable[]): void;
};
const MODELS = {
  encoder: { path: 'onnx/encoder.onnx', bytes: 11018056, sha: 'e4220ae166e841ebc6159a69b5b762b635af95ed758c86663a978bef80bcea62' },
  decoder: { path: 'onnx/decoder.onnx', bytes: 16496559, sha: '8976b90a87ba50a6a72217a5ff994f7d25ce16f2229fcc1ed259e1294c622ffe' },
};
let decoder: ort.InferenceSession, embeddings: ort.Tensor;
let sourcePixels: Uint8ClampedArray;
let width = 0, height = 0, scaleX = 1, scaleY = 1, busy = false;

async function modelBytes(assets: URL, model: typeof MODELS.encoder): Promise<Uint8Array> {
  const url = new URL(model.path, assets);
  let cache: Cache | undefined;
  try { cache = await caches.open('labframe-mobilesam-v1'); } catch { /* Private browsing may disable CacheStorage. */ }
  const valid = async (response: Response) => {
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== model.bytes) return null;
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((n) => n.toString(16).padStart(2, '0')).join('');
    return hash === model.sha ? new Uint8Array(bytes) : null;
  };
  const cached = await cache?.match(url.href).catch(() => undefined);
  if (cached) { const bytes = await valid(cached); if (bytes) return bytes; await cache?.delete(url.href); }
  const response = await fetch(url, { credentials: 'omit', redirect: 'error', cache: 'no-cache' });
  if (!response.ok) throw new Error('model_unavailable');
  const bytes = await valid(response);
  if (!bytes) throw new Error('model_unavailable');
  // Only these two public model buffers enter CacheStorage; no photo or embedding.
  await cache?.put(url.href, new Response(bytes as Uint8Array<ArrayBuffer>, { headers: { 'Content-Type': 'application/octet-stream' } })).catch(() => {});
  return bytes;
}

async function prepare(message: Extract<SamWorkerRequest, { action: 'prepare' }>) {
  if (embeddings) throw new Error('invalid_input');
  const assets = new URL(message.assets);
  if (assets.origin !== worker.location.origin || !assets.pathname.endsWith('/models/mobilesam/') ||
      !Number.isInteger(message.width) || !Number.isInteger(message.height) || message.width < 16 || message.height < 16 ||
      message.width * message.height > 4_194_304 || message.pixels.byteLength !== message.width * message.height * 4) throw new Error('invalid_input');
  ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = { mjs: new URL('wasm/ort-wasm-simd-threaded.mjs', assets).href,
    wasm: new URL('wasm/ort-wasm-simd-threaded.wasm', assets).href };
  const [encoderBytes, decoderBytes] = await Promise.all([modelBytes(assets, MODELS.encoder), modelBytes(assets, MODELS.decoder)]);
  const encoder = await ort.InferenceSession.create(encoderBytes, { executionProviders: ['wasm'] });
  try {
    decoder = await ort.InferenceSession.create(decoderBytes, { executionProviders: ['wasm'] });
    width = message.width; height = message.height;
    sourcePixels = new Uint8ClampedArray(message.pixels);
    const input = samEncoderImage(sourcePixels, width, height);
    scaleX = input.scaleX; scaleY = input.scaleY;
    const tensor = new ort.Tensor('float32', input.data, [input.height, input.width, 3]);
    try { embeddings = (await encoder.run({ input_image: tensor })).image_embeddings; }
    finally { tensor.dispose(); }
  } finally { await encoder.release(); }
}

async function toothMask(points: LocalSamPoint[], maxAreaFraction = 0.25) {
  const coords = new Float32Array((points.length + 1) * 2), labels = new Float32Array(points.length + 1);
  for (let i = 0; i < points.length; i++) {
    coords[i * 2] = points[i].x * scaleX; coords[i * 2 + 1] = points[i].y * scaleY; labels[i] = points[i].label;
  }
  // SAM's point-only export expects one padding point with label -1 (no box).
  labels[points.length] = -1;
  const inputs = {
    image_embeddings: embeddings,
    point_coords: new ort.Tensor('float32', coords, [1, points.length + 1, 2]),
    point_labels: new ort.Tensor('float32', labels, [1, points.length + 1]),
    mask_input: new ort.Tensor('float32', new Float32Array(256 * 256), [1, 1, 256, 256]),
    has_mask_input: new ort.Tensor('float32', new Float32Array([0]), [1]),
    orig_im_size: new ort.Tensor('float32', new Float32Array([height, width]), [2]),
  };
  let output: ort.InferenceSession.OnnxValueMapType | undefined;
  try {
    output = await decoder.run(inputs);
    const binary = Uint8Array.from(output.masks.data as Float32Array, (n) => n > 0 ? 1 : 0);
    // A point describes one object. Treating all teeth as one object can select
    // the whole mouth. Resolve individual tooth proposals, then union them.
    const selected = selectSamMask(width, height, binary, output.iou_predictions.data as Float32Array, points, maxAreaFraction);
    if (!selected) throw new Error('uncertain');
    return selected;
  } finally {
    for (const [name, tensor] of Object.entries(inputs)) if (name !== 'image_embeddings') tensor.dispose();
    for (const tensor of Object.values(output ?? {})) tensor.dispose();
  }
}

async function segment(message: Extract<SamWorkerRequest, { action: 'segment' }>) {
  if (!embeddings || !Array.isArray(message.points) || !message.points.length || message.points.length > 32 ||
      message.points.some((p) => !Number.isFinite(p.x + p.y) || p.x < 0 || p.y < 0 || p.x >= width || p.y >= height || ![0, 1].includes(p.label))) throw new Error('invalid_input');
  const points = samPromptPoints(sourcePixels, width, height, message.points);
  const positives = points.filter((p) => p.label === 1), negatives = points.filter((p) => p.label === 0);
  if (!positives.length) throw new Error('invalid_input');
  // A tiny native mouth crop cannot resolve individual crowns reliably; use a
  // compact arch proposal with all prompts instead of inventing tooth instances.
  if (width < 96 || height < 40) {
    const proposal = await toothMask(points, 0.35);
    worker.postMessage({ id: message.id, ok: true, action: 'segment', pixels: proposal.pixels.buffer as ArrayBuffer,
      score: proposal.score, center: proposal.center }, [proposal.pixels.buffer as ArrayBuffer]);
    return;
  }
  const union = new Uint8Array(width * height); let score = 1;
  for (const point of positives) {
    if (union[Math.min(height - 1, Math.round(point.y)) * width + Math.min(width - 1, Math.round(point.x))]) continue;
    const proposal = await toothMask([point, ...negatives]);
    score = Math.min(score, proposal.score);
    for (let p = 0; p < union.length; p++) if (proposal.pixels[p]) union[p] = 1;
  }
  let count = 0, x = 0, y = 0;
  for (let p = 0; p < union.length; p++) if (union[p]) { count++; x += p % width; y += Math.floor(p / width); }
  if (!count) throw new Error('uncertain');
  worker.postMessage({ id: message.id, ok: true, action: 'segment', pixels: union.buffer,
    score, center: { x: (x / count + 0.5) / width, y: (y / count + 0.5) / height } }, [union.buffer]);
}

worker.onmessage = (event) => {
  const message = event.data;
  if (busy) { worker.postMessage({ id: message.id, ok: false, code: 'busy' }); return; }
  busy = true;
  void (async () => {
    try {
      if (message.action === 'prepare') { await prepare(message); worker.postMessage({ id: message.id, ok: true, action: 'prepare' }); }
      else await segment(message);
    } catch (error) {
      const code = error instanceof Error && ['uncertain', 'invalid_input'].includes(error.message) ? error.message as 'uncertain' | 'invalid_input' : 'model_unavailable';
      worker.postMessage({ id: message.id, ok: false, code });
    } finally { busy = false; }
  })();
};
