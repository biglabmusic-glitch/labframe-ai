import { AutoMaskError, proposeToothPixels, type MaskPoint } from './tooth-mask';
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

// Model files are fetched from LabFrame; inference and image analysis are local.
export async function proposeSmileMask(photo: { blob: Blob; width: number; height: number }, signal?: AbortSignal): Promise<{
  mask: Blob; center: MaskPoint;
}> {
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
    const model = await faceModel();
    signal?.throwIfAborted();
    // Allow the progress state to render before synchronous on-device inference.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const result = model.detect(canvas);
    signal?.throwIfAborted();
    if (result.faceLandmarks.length !== 1) throw new AutoMaskError('no_face');
    const points = result.faceLandmarks[0];
    const mouth = (indices: number[]) => indices.map((index) => ({ x: points[index].x * canvas.width, y: points[index].y * canvas.height }));
    const proposal = proposeToothPixels(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height,
      { upper: mouth(UPPER_LIP), lower: mouth(LOWER_LIP) });
    const pixels = ctx.createImageData(canvas.width, canvas.height);
    for (let p = 0; p < proposal.mask.length; p++) {
      const i = p * 4; pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = proposal.mask[p]; pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    const output = document.createElement('canvas'); output.width = photo.width; output.height = photo.height;
    const out = output.getContext('2d');
    if (!out) throw new AutoMaskError('model_unavailable');
    out.imageSmoothingEnabled = false; out.drawImage(canvas, 0, 0, output.width, output.height);
    const mask = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, 'image/png'));
    signal?.throwIfAborted();
    if (!mask) throw new AutoMaskError('model_unavailable');
    return { mask, center: proposal.center };
  } catch (error) {
    if (signal?.aborted || error instanceof AutoMaskError) throw error;
    throw new AutoMaskError('model_unavailable');
  } finally { bitmap.close(); }
}
