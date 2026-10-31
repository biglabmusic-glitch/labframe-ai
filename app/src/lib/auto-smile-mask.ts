import { AutoMaskError, proposeToothPixels, type MaskPoint } from './tooth-mask';
import { smilePointRegion, smileRegion, smileSeeds, type SmileRegion } from './smile-mask-region';
import { createSmileSegmenter, type SamSmilePoint, type SmileSegmenter } from './sam-smile-mask';
export { AutoMaskError } from './tooth-mask';

const UPPER_LIP = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308];
const LOWER_LIP = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308];
const ASSETS = '/models/face-landmarker';

let landmarker: Promise<import('@mediapipe/tasks-vision').FaceLandmarker> | undefined;
async function faceModel() {
  if (!landmarker) landmarker = (async () => {
    const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks(ASSETS);
    return await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${ASSETS}/face_landmarker.task`, delegate: 'CPU' },
      runningMode: 'IMAGE', numFaces: 2, minFaceDetectionConfidence: 0.6,
      minFacePresenceConfidence: 0.6, outputFaceBlendshapes: false,
    });
  })().catch((error) => { landmarker = undefined; throw error; });
  return await landmarker;
}

export interface SmileMaskSession {
  initial: { mask: Blob; center: MaskPoint } | null;
  points: SamSmilePoint[];
  center: MaskPoint;
  refine(points: SamSmilePoint[], signal?: AbortSignal): Promise<{ mask: Blob; center: MaskPoint }>;
  dispose(): void;
}

// Lip landmarks locate the crop only. MobileSAM predicts the actual contour.
export async function prepareSmileMask(photo: { blob: Blob; width: number; height: number }, signal?: AbortSignal): Promise<SmileMaskSession> {
  signal?.throwIfAborted();
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(photo.blob); }
  catch { throw new AutoMaskError('model_unavailable'); }
  try {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 800 / Math.max(photo.width, photo.height));
    canvas.width = Math.round(photo.width * scale); canvas.height = Math.round(photo.height * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new AutoMaskError('model_unavailable');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let roi: SmileRegion = { x: 0, y: 0, width: 1, height: 1 };
    let located = false;
    let prompts: SamSmilePoint[] = [];
    try {
      const model = await faceModel();
      signal?.throwIfAborted();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const result = model.detect(canvas);
      if (result.faceLandmarks.length !== 1) throw new AutoMaskError('no_face');
      const landmarks = result.faceLandmarks[0];
      const mouth = { upper: UPPER_LIP.map((i) => landmarks[i]), lower: LOWER_LIP.map((i) => landmarks[i]) };
      roi = smileRegion(mouth);
      located = true;
      // Analyse the native mouth crop, not teeth reduced with the entire portrait.
      const region = document.createElement('canvas');
      const analysisScale = Math.min(1, 1000 / Math.max(photo.width * roi.width, photo.height * roi.height));
      region.width = Math.max(1, Math.round(photo.width * roi.width * analysisScale));
      region.height = Math.max(1, Math.round(photo.height * roi.height * analysisScale));
      const regionContext = region.getContext('2d', { willReadFrequently: true });
      if (!regionContext) throw new AutoMaskError('model_unavailable');
      regionContext.drawImage(bitmap, roi.x * photo.width, roi.y * photo.height, roi.width * photo.width, roi.height * photo.height, 0, 0, region.width, region.height);
      const local = (points: typeof mouth.upper) => points.map((p) => ({ x: (p.x - roi.x) / roi.width * region.width, y: (p.y - roi.y) / roi.height * region.height }));
      try {
        const candidates = proposeToothPixels(regionContext.getImageData(0, 0, region.width, region.height).data, region.width, region.height,
          { upper: local(mouth.upper), lower: local(mouth.lower) });
        prompts = smileSeeds(candidates.mask, region.width, region.height, roi);
        if (prompts.length >= 2) {
          for (const i of [2, 5, 8]) {
            const upper = mouth.upper[i], lower = mouth.lower[i];
            prompts.push({ x: upper.x, y: Math.max(roi.y, upper.y - roi.height * 0.08), label: 0 });
            prompts.push({ x: lower.x, y: Math.min(roi.y + roi.height, lower.y - (lower.y - upper.y) * 0.06), label: 0 });
          }
        } else prompts = [];
      } catch { prompts = []; } // Missing auto prompts still permits point correction.
    } catch {
      // Close-up intraoral photographs may have no complete face. User points work on them too.
      signal?.throwIfAborted();
    }
    signal?.throwIfAborted();
    let segmenter: SmileSegmenter | undefined;
    const lifetime = new AbortController();
    const abort = () => lifetime.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    let disposed = false;
    const session: SmileMaskSession = {
      initial: null, points: [], center: { x: roi.x + roi.width / 2, y: roi.y + roi.height / 2 },
      refine: async (points, refineSignal) => {
        if (disposed) throw new AutoMaskError('model_unavailable');
        refineSignal?.throwIfAborted(); lifetime.signal.throwIfAborted();
        const contains = (region: SmileRegion, p: SamSmilePoint) => p.x >= region.x && p.x <= region.x + region.width && p.y >= region.y && p.y <= region.y + region.height;
        if (points.some((p) => p.label === 1 && !contains(roi, p))) located = false;
        if (!located) {
          const next = smilePointRegion(points, photo.width, photo.height);
          if (!segmenter || points.some((p) => p.label === 1 && !contains(roi, p)) ||
              Math.abs(next.x + next.width / 2 - roi.x - roi.width / 2) > roi.width * 0.15 ||
              Math.abs(next.y + next.height / 2 - roi.y - roi.height / 2) > roi.height * 0.15) {
            await segmenter?.dispose(); segmenter = undefined; roi = next;
          }
        }
        // Initialization belongs to the image lifetime, not an individual tap.
        // Aborting an obsolete tap must not discard a useful cached embedding.
        if (!segmenter) segmenter = await createSmileSegmenter(photo.blob, roi, lifetime.signal);
        refineSignal?.throwIfAborted(); lifetime.signal.throwIfAborted();
        // Negative points outside the crop already refer to protected black pixels.
        return await segmenter.segment(points.filter((p) => p.label === 1 || contains(roi, p)), refineSignal);
      },
      dispose: () => {
        if (!disposed) { disposed = true; signal?.removeEventListener('abort', abort); lifetime.abort(); void segmenter?.dispose().catch(() => {}); }
      },
    };
    try {
      if (located) segmenter = await createSmileSegmenter(photo.blob, roi, lifetime.signal);
      if (prompts.length) {
        try {
          const proposal = await session.refine(prompts, signal);
          session.initial = { mask: proposal.mask, center: proposal.center }; session.points = prompts; session.center = proposal.center;
        } catch { signal?.throwIfAborted(); }
      }
      signal?.throwIfAborted();
      return session;
    } catch (error) { session.dispose(); throw error; }
  } catch (error) {
    if (signal?.aborted || error instanceof AutoMaskError) throw error;
    throw new AutoMaskError('model_unavailable');
  } finally { bitmap.close(); }
}
