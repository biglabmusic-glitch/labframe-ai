import {
  compositeSmileCropPixels, locateManualSmileCrop, locateSmileCrop, smileCropMask, SmileCropError,
  type SmileCropGeometry, type SmileCropPoint,
} from './smile-crop-geometry';
export { SmileCropError } from './smile-crop-geometry';
export type { SmileCropGeometry } from './smile-crop-geometry';

export interface SmileCropPhoto { blob: Blob; width: number; height: number }
export interface PreparedSmileCrop extends SmileCropGeometry {
  /** Only this mouth-only PNG and its mask are sent to the encrypted API. */
  photo: Blob;
  mask: Blob;
}

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
function canvas(width: number, height: number) {
  const image = document.createElement('canvas'); image.width = width; image.height = height;
  const context = image.getContext('2d', { willReadFrequently: true });
  if (!context) throw new SmileCropError('crop_unavailable');
  return { image, context };
}
async function png(image: HTMLCanvasElement, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const blob = await new Promise<Blob | null>((resolve) => image.toBlob(resolve, 'image/png'));
  signal?.throwIfAborted();
  if (!blob || blob.size > 20 * 1024 * 1024) throw new SmileCropError('crop_unavailable');
  return blob;
}

async function rasterizeCrop(bitmap: ImageBitmap, geometry: SmileCropGeometry, signal?: AbortSignal): Promise<PreparedSmileCrop> {
  const binary = smileCropMask(geometry), { width, height, region, offsetX, offsetY } = geometry;
  const crop = canvas(width, height); crop.context.fillStyle = '#000'; crop.context.fillRect(0, 0, width, height);
  crop.context.drawImage(bitmap, region.x, region.y, region.width, region.height, offsetX, offsetY, region.width, region.height);
  const mask = canvas(width, height), rgba = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < binary.length; p++) {
    rgba[p * 4] = rgba[p * 4 + 1] = rgba[p * 4 + 2] = binary[p]; rgba[p * 4 + 3] = 255;
  }
  mask.context.putImageData(new ImageData(rgba, width, height), 0, 0);
  const [photoBlob, maskBlob] = await Promise.all([png(crop.image, signal), png(mask.image, signal)]);
  signal?.throwIfAborted();
  return { ...geometry, photo: photoBlob, mask: maskBlob };
}

/** The cropped-smile path never loads MediaPipe and never requires eyes/nose. */
export async function prepareManualSmileCrop(photo: SmileCropPhoto, boundary: readonly SmileCropPoint[],
  signal?: AbortSignal): Promise<PreparedSmileCrop> {
  signal?.throwIfAborted();
  let bitmap: ImageBitmap | undefined;
  try {
    const geometry = locateManualSmileCrop(photo.width, photo.height, boundary);
    bitmap = await createImageBitmap(photo.blob); signal?.throwIfAborted();
    if (bitmap.width !== photo.width || bitmap.height !== photo.height) throw new SmileCropError('crop_unavailable');
    return await rasterizeCrop(bitmap, geometry, signal);
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof SmileCropError) throw error;
    throw new SmileCropError('crop_unavailable');
  } finally { bitmap?.close(); }
}

/** Local face landmarks locate the mouth. No SAM, tooth numbering or external
 * analysis service is loaded. A failed detection never releases the original. */
export async function prepareSmileCrop(photo: SmileCropPhoto, signal?: AbortSignal): Promise<PreparedSmileCrop> {
  signal?.throwIfAborted();
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(photo.blob);
    signal?.throwIfAborted();
    if (bitmap.width !== photo.width || bitmap.height !== photo.height) throw new SmileCropError('crop_unavailable');
    const scale = Math.min(1, 800 / Math.max(photo.width, photo.height));
    const analysis = canvas(Math.max(1, Math.round(photo.width * scale)), Math.max(1, Math.round(photo.height * scale)));
    analysis.context.drawImage(bitmap, 0, 0, analysis.image.width, analysis.image.height);
    const model = await faceModel(); signal?.throwIfAborted();
    await new Promise<void>((resolve) => setTimeout(resolve, 0)); signal?.throwIfAborted();
    const result = model.detect(analysis.image); signal?.throwIfAborted();
    const geometry = locateSmileCrop(photo.width, photo.height, result.faceLandmarks);
    return await rasterizeCrop(bitmap, geometry, signal);
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof SmileCropError) throw error;
    throw new SmileCropError('crop_unavailable');
  } finally { bitmap?.close(); }
}

/** Reconstruct the full result locally; the full original is never an upload. */
export async function compositeSmileCrop(original: SmileCropPhoto, generated: Blob,
  prepared: SmileCropGeometry, signal?: AbortSignal): Promise<Blob> {
  signal?.throwIfAborted();
  const bitmaps: ImageBitmap[] = [];
  try {
    const source = await createImageBitmap(original.blob); bitmaps.push(source);
    signal?.throwIfAborted();
    const edited = await createImageBitmap(generated); bitmaps.push(edited);
    signal?.throwIfAborted();
    if (source.width !== original.width || source.height !== original.height ||
      source.width !== prepared.sourceWidth || source.height !== prepared.sourceHeight ||
      edited.width !== prepared.width || edited.height !== prepared.height) throw new SmileCropError('output_dimensions');
    const full = canvas(source.width, source.height), patch = canvas(edited.width, edited.height);
    full.context.drawImage(source, 0, 0); patch.context.drawImage(edited, 0, 0);
    const result = compositeSmileCropPixels(
      full.context.getImageData(0, 0, source.width, source.height).data,
      patch.context.getImageData(0, 0, edited.width, edited.height).data, prepared,
    );
    signal?.throwIfAborted();
    full.context.putImageData(new ImageData(result, source.width, source.height), 0, 0);
    return await png(full.image, signal);
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof SmileCropError) throw error;
    throw new SmileCropError('crop_unavailable');
  } finally { for (const bitmap of bitmaps) bitmap.close(); }
}
