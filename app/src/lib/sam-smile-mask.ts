import type { SamWorkerRequest, SamWorkerResponse } from './sam-smile-protocol';

/** Coordinates refer to the full, oriented photo, normalized to 0..1. */
export interface SamSmilePoint { x: number; y: number; label: 0 | 1 }
export interface SamSmileRoi { x: number; y: number; width: number; height: number }
export interface SamSmileMask {
  mask: Blob; center: { x: number; y: number }; width: number; height: number;
  /** SAM's predicted-IoU ranking score, not calibrated dental confidence. */
  score: number | null;
}
export interface SmileSegmenter {
  segment(points: SamSmilePoint[], signal?: AbortSignal): Promise<SamSmileMask>;
  dispose(): Promise<void>;
}
export class SamSmileError extends Error {
  constructor(public code: 'model_unavailable' | 'invalid_input' | 'uncertain' | 'busy' | 'disposed') {
    super(code); this.name = 'SamSmileError';
  }
}

let owner: symbol | null = null;
function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new SamSmileError('model_unavailable')), 'image/png'));
}

/** One worker/image, cached embedding, local files only. Discarding a photo
 * terminates native inference and its WASM memory instead of blocking the UI.
 */
export async function createSmileSegmenter(photo: Blob, roi: SamSmileRoi, signal?: AbortSignal): Promise<SmileSegmenter> {
  signal?.throwIfAborted();
  if (!(photo instanceof Blob) || !photo.size || photo.size > 25 * 1024 * 1024 ||
      ![roi.x, roi.y, roi.width, roi.height].every(Number.isFinite) || roi.x < 0 || roi.y < 0 || roi.width <= 0 || roi.height <= 0 ||
      roi.x + roi.width > 1.000001 || roi.y + roi.height > 1.000001) throw new SamSmileError('invalid_input');
  if (owner) throw new SamSmileError('busy');
  const token = Symbol('smile-worker'); owner = token;
  let worker: Worker | undefined, bitmap: ImageBitmap | undefined, disposed = false, counter = 0;
  let operation: Promise<SamSmileMask> | undefined;
  const pending = new Map<number, { resolve: (response: SamWorkerResponse) => void; reject: (error: unknown) => void; timer: ReturnType<typeof setTimeout> }>();
  const dispose = async () => {
    if (disposed) return;
    disposed = true; worker?.terminate(); worker = undefined;
    signal?.removeEventListener('abort', abort);
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new SamSmileError('disposed')); }
    pending.clear();
    if (owner === token) owner = null;
  };
  const abort = () => { void dispose(); };
  const check = (requestSignal?: AbortSignal) => {
    signal?.throwIfAborted(); requestSignal?.throwIfAborted();
    if (disposed) throw new SamSmileError('disposed');
  };
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const request = (message: SamWorkerRequest, transfer: Transferable[] = []) => new Promise<SamWorkerResponse>((resolve, reject) => {
    if (!worker || disposed) { reject(new SamSmileError('disposed')); return; }
    const timer = setTimeout(() => { reject(new SamSmileError('model_unavailable')); void dispose(); }, message.action === 'prepare' ? 90_000 : 30_000);
    pending.set(message.id, { resolve, reject, timer });
    try { worker.postMessage(message, transfer); }
    catch { clearTimeout(timer); pending.delete(message.id); reject(new SamSmileError('model_unavailable')); }
  });
  try {
    bitmap = await createImageBitmap(photo); check();
    const width = bitmap.width, height = bitmap.height;
    if (width < 32 || height < 32 || width * height > 16_000_000 || Math.max(width, height) > 8192) throw new SamSmileError('invalid_input');
    const left = Math.floor(roi.x * width), top = Math.floor(roi.y * height);
    const right = Math.min(width, Math.ceil((roi.x + roi.width) * width)), bottom = Math.min(height, Math.ceil((roi.y + roi.height) * height));
    const sourceWidth = right - left, sourceHeight = bottom - top;
    if (sourceWidth < 16 || sourceHeight < 16) throw new SamSmileError('invalid_input');
    const scale = Math.min(1, 2048 / Math.max(sourceWidth, sourceHeight));
    const cropWidth = Math.round(sourceWidth * scale), cropHeight = Math.round(sourceHeight * scale);
    const crop = document.createElement('canvas'); crop.width = cropWidth; crop.height = cropHeight;
    const context = crop.getContext('2d', { willReadFrequently: true });
    if (!context) throw new SamSmileError('model_unavailable');
    context.drawImage(bitmap, left, top, sourceWidth, sourceHeight, 0, 0, cropWidth, cropHeight);
    bitmap.close(); bitmap = undefined;
    const pixels = context.getImageData(0, 0, cropWidth, cropHeight).data.buffer as ArrayBuffer;
    crop.width = crop.height = 1;
    const assets = new URL(`${import.meta.env.BASE_URL}models/mobilesam/`, window.location.href);
    if (assets.origin !== window.location.origin) throw new SamSmileError('model_unavailable');
    check();
    worker = new Worker(new URL('./sam-smile-worker.ts', import.meta.url), { type: 'module', name: 'smile-mask' });
    worker.onmessage = (event: MessageEvent<SamWorkerResponse>) => {
      const response = event.data, waiting = pending.get(response.id);
      if (!waiting) return;
      clearTimeout(waiting.timer); pending.delete(response.id);
      if (response.ok) waiting.resolve(response); else waiting.reject(new SamSmileError(response.code));
    };
    worker.onerror = () => { void dispose(); };
    worker.onmessageerror = () => { void dispose(); };
    await request({ id: ++counter, action: 'prepare', assets: assets.href, width: cropWidth, height: cropHeight, pixels }, [pixels]);
    check();

    const segment = async (points: SamSmilePoint[], requestSignal?: AbortSignal): Promise<SamSmileMask> => {
      check(requestSignal);
      if (!Array.isArray(points) || !points.length || points.length > 32 || !points.some((p) => p.label === 1)) throw new SamSmileError('invalid_input');
      const local = points.map((p) => {
        if (![p.x, p.y].every(Number.isFinite) || ![0, 1].includes(p.label) || p.x < 0 || p.y < 0 || p.x > 1 || p.y > 1 ||
            p.x * width < left || p.x * width > right || p.y * height < top || p.y * height > bottom) throw new SamSmileError('invalid_input');
        return { x: Math.min(cropWidth - 1, (p.x * width - left) * cropWidth / sourceWidth),
          y: Math.min(cropHeight - 1, (p.y * height - top) * cropHeight / sourceHeight), label: p.label };
      });
      const response = await request({ id: ++counter, action: 'segment', points: local });
      check(requestSignal);
      if (!response.ok || response.action !== 'segment' || response.pixels.byteLength !== cropWidth * cropHeight) throw new SamSmileError('model_unavailable');
      const selected = new Uint8Array(response.pixels);
      const small = document.createElement('canvas'); small.width = cropWidth; small.height = cropHeight;
      const smallContext = small.getContext('2d');
      const full = document.createElement('canvas'); full.width = width; full.height = height;
      const fullContext = full.getContext('2d');
      if (!smallContext || !fullContext) throw new SamSmileError('model_unavailable');
      const rgba = smallContext.createImageData(cropWidth, cropHeight);
      for (let p = 0; p < selected.length; p++) {
        rgba.data[p * 4] = rgba.data[p * 4 + 1] = rgba.data[p * 4 + 2] = selected[p] ? 255 : 0; rgba.data[p * 4 + 3] = 255;
      }
      smallContext.putImageData(rgba, 0, 0);
      fullContext.fillStyle = '#000'; fullContext.fillRect(0, 0, width, height);
      fullContext.imageSmoothingEnabled = false; fullContext.drawImage(small, left, top, sourceWidth, sourceHeight);
      const mask = await canvasBlob(full);
      full.width = full.height = small.width = small.height = 1;
      check(requestSignal);
      return { mask, width, height, score: response.score,
        center: { x: (left + response.center.x * sourceWidth) / width, y: (top + response.center.y * sourceHeight) / height } };
    };
    return {
      segment(points, requestSignal) {
        check(requestSignal);
        if (operation) return Promise.reject(new SamSmileError('busy'));
        operation = segment(points, requestSignal).finally(() => { operation = undefined; });
        return operation;
      },
      dispose,
    };
  } catch (error) {
    await dispose(); signal?.throwIfAborted();
    if (error instanceof SamSmileError) throw error;
    throw new SamSmileError('model_unavailable');
  } finally { bitmap?.close(); }
}
