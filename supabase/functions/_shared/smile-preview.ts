// Закрытый пилот: чистые проверки, промпт, ограниченная маской сборка и Polza.
// Здесь нет клиента БД, переменных окружения, логирования или второго AI-провайдера.
import { Image } from 'https://deno.land/x/imagescript@1.2.17/mod.ts';

export const SMILE_TEETH = [16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26] as const;
export const SMILE_SHADES = [
  'BL1', 'BL2', 'BL3', 'BL4', 'A1', 'A2', 'A3', 'A3.5', 'A4',
  'B1', 'B2', 'B3', 'B4', 'C1', 'C2', 'C3', 'C4', 'D2', 'D3', 'D4',
] as const;
export const SMILE_MAX_BYTES = 20 * 1024 * 1024;
export const SMILE_TIMEOUT_MS = 60_000;
// Provider generation lives outside an Edge invocation; polling can resume later.
export const SMILE_STALE_MS = 12 * 60_000;
export const SMILE_PREPARED_TTL_MS = 24 * 60 * 60 * 1000;
export const SMILE_CIPHER_OVERHEAD = 29;

export interface SmileSettings {
  teeth: number[];
  shades: Record<string, string>;
  shape: 'original' | 'square' | 'triangular' | 'rounded';
  zenithMode: 'preserve' | 'allow';
  zenithInstruction?: string;
  translucency: 'none' | 'natural';
}

export type SmileStatus = 'prepared' | 'processing' | 'done' | 'failed';
export interface SmileManifest {
  version: 2;
  jobId: string;
  userId: number;
  status: SmileStatus;
  consentAt: number;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  providerId?: string;
  errorCode?: string;
}

const MESSAGES: Record<string, string> = {
  bad_settings: 'Проверьте выбранные зубы, оттенки и параметры примерки.',
  bad_job: 'Некорректный номер примерки.',
  bad_json: 'Не удалось прочитать параметры запроса.',
  permission_required: 'Подтвердите разрешение на обработку фото и передачу внешнему AI.',
  not_admin: 'Примерка доступна только участникам закрытого теста.',
  banned: 'Доступ к примерке закрыт для этого аккаунта.',
  auth_unavailable: 'Не удалось проверить доступ. Попробуйте позже.',
  not_configured: 'Пилот пока не настроен.',
  runtime_unavailable: 'Фоновая обработка временно недоступна.',
  private_storage_required: 'Приватное хранилище пилота недоступно.',
  storage_error: 'Не удалось обратиться к приватному хранилищу. Попробуйте позже.',
  job_not_found: 'Примерка не найдена.',
  missing_upload: 'Загрузите исходное фото и маску перед запуском.',
  invalid_png: 'Фото и маска должны быть обычными PNG-файлами.',
  image_too_large: 'Максимальный размер файла — 20 МиБ.',
  image_dimensions: 'Допустимый размер фото: от 64 до 2000 пикселей по каждой стороне.',
  mask_dimensions: 'Размер маски должен точно совпадать с размером фото.',
  mask_empty: 'Отметьте на маске область выбранных верхних зубов.',
  mask_too_large: 'Маска слишком большая. Ограничьте её выбранными зубами и разрешённым краем десны.',
  output_dimensions: 'Модель изменила размер или пропорции кадра. Создайте новую примерку.',
  rate_limited: 'Слишком много примерок за час. Попробуйте позже.',
  timeout: 'Модель не успела ответить. Для повторной попытки создайте новую примерку.',
  expired: 'Эта заготовка устарела. Создайте новую примерку.',
  provider_failed: 'Модель не смогла выполнить примерку. Создайте новую попытку.',
  provider_unavailable: 'Сервис обработки временно недоступен. Проверьте статус этой же примерки позже.',
  provider_response: 'Модель не вернула подходящее изображение. Создайте новую попытку.',
  result_missing: 'Результат больше недоступен. Создайте новую примерку.',
  processing_failed: 'Не удалось завершить примерку. Создайте новую попытку.',
  processing_active: 'Примерка ещё обрабатывается. Удалите её после завершения.',
  invalid_encryption: 'Не удалось расшифровать фото. Создайте новую примерку.',
};

export class SmileError extends Error {
  constructor(public code: string, public status = 400) {
    super(MESSAGES[code] ?? MESSAGES.processing_failed);
  }
}

/** Никакие тексты внешнего провайдера, URL, инструкции врача и секреты не возвращаем. */
export function safeSmileError(error: unknown): { code: string; message: string } {
  const code = error instanceof SmileError && Object.hasOwn(MESSAGES, error.code)
    ? error.code
    : error instanceof DOMException && ['AbortError', 'TimeoutError'].includes(error.name)
    ? 'timeout'
    : 'processing_failed';
  return { code, message: MESSAGES[code] };
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function smilePilotAllowed(
  userId: number,
  envAdmins: readonly number[],
  row: { is_admin?: boolean | null; banned?: boolean | null; smile_tester?: boolean | null } | null,
): boolean {
  return Number.isSafeInteger(userId) && userId > 0 && row !== null && row.banned === false &&
    (envAdmins.includes(userId) || row.is_admin === true || row.smile_tester === true);
}

export function validateSmileSettings(value: unknown): SmileSettings {
  if (!record(value) || !Array.isArray(value.teeth) || !record(value.shades)) throw new SmileError('bad_settings');
  const teeth = value.teeth;
  const shades = value.shades;
  if (!teeth.length || teeth.length > SMILE_TEETH.length || new Set(teeth).size !== teeth.length ||
    teeth.some((n) => typeof n !== 'number' || !(SMILE_TEETH as readonly number[]).includes(n))) {
    throw new SmileError('bad_settings');
  }
  for (const [tooth, shade] of Object.entries(value.shades)) {
    if (!(SMILE_TEETH as readonly number[]).some((n) => String(n) === tooth) ||
      typeof shade !== 'string' || !(SMILE_SHADES as readonly string[]).includes(shade)) {
      throw new SmileError('bad_settings');
    }
  }
  if (teeth.some((n) => !Object.hasOwn(value.shades as object, String(n)))) throw new SmileError('bad_settings');
  if (!['original', 'square', 'triangular', 'rounded'].includes(String(value.shape)) ||
    !['preserve', 'allow'].includes(String(value.zenithMode)) ||
    !['none', 'natural'].includes(String(value.translucency))) throw new SmileError('bad_settings');
  let zenithInstruction: string | undefined;
  if (value.zenithInstruction !== undefined) {
    if (typeof value.zenithInstruction !== 'string' || value.zenithInstruction.length > 160 ||
      /[\u0000-\u001f\u007f]/.test(value.zenithInstruction)) throw new SmileError('bad_settings');
    if (value.zenithMode === 'allow') zenithInstruction = value.zenithInstruction.trim();
  }
  if (value.zenithMode === 'allow' && !zenithInstruction) throw new SmileError('bad_settings');
  return {
    teeth: SMILE_TEETH.filter((n) => teeth.includes(n)),
    shades: Object.fromEntries(teeth.map((n) => [String(n), shades[String(n)] as string])),
    shape: value.shape as SmileSettings['shape'],
    zenithMode: value.zenithMode as SmileSettings['zenithMode'],
    ...(zenithInstruction ? { zenithInstruction } : {}),
    translucency: value.translucency as SmileSettings['translucency'],
  };
}

export function smilePaths(userId: number, jobId: unknown) {
  if (!Number.isSafeInteger(userId) || userId <= 0 || typeof jobId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(jobId)) {
    throw new SmileError('bad_job');
  }
  const base = `${userId}/smile-pilot/${jobId}`;
  return {
    base,
    photo: `${base}/source.enc`,
    mask: `${base}/mask.enc`,
    result: `${base}/result.enc`,
    manifest: `${base}/manifest.json`,
    running: `${base}/running.json`,
  };
}

export function buildSmilePrompt(settings: SmileSettings): string {
  const shape = {
    original: 'Retain the original individual crown shapes; improve only the requested shade and natural surface.',
    square: 'Use a natural square morphology: straighter lateral contours, more horizontal incisal edges, softly rounded corners. Central incisors slightly wider than lateral incisors, distinct but natural canines; lateral teeth follow the existing perspective.',
    triangular: 'Use a restrained natural triangular crown morphology, gently converging towards the cervical area, without changing tooth positions or the dental midline.',
    rounded: 'Use a restrained rounded crown morphology with soft corners and natural individual proportions, without changing tooth positions or the dental midline.',
  }[settings.shape];
  return [
    'Edit the FIRST image as a photorealistic dental smile preview. The SECOND image is a hard edit mask: white opaque pixels are the only editable area; black or transparent pixels are protected. Do not render the mask.',
    'The first image is ONLY a cropped smile region, not a full portrait. Keep its exact framing, mouth, lips, skin texture, lighting, shadows and camera perspective. Do not add a face, eyes, nose, background, text, watermark, labels or collage. No beautification or retouching.',
    'The smile crop may have black letterbox padding within a 16:9 canvas. Keep that exact canvas and padding. Never crop, zoom, reposition or stretch the smile region.',
    `Edit ONLY the selected UPPER teeth, identified by FDI numbers: ${settings.teeth.join(', ')}. Teeth not selected must stay unchanged.`,
    'The upper arch may span FDI 16 through 26 only where already visible. Do NOT force all twelve teeth to be visible. Never reveal a tooth covered by a lip or cheek, widen the mouth, lift a lip or fabricate a wider smile. An absent tooth in an already visible selected tooth space may receive a plausible crown without shifting surrounding tissues.',
    'Leave the lower teeth, mandible, bite, jaw position and dental midline unchanged. Maintain natural tooth positions, occlusion, depth and perspective.',
    `PER-TOOTH SHADE MAP (apply only to the selected teeth; do not impose one shade on the whole smile): ${JSON.stringify(settings.shades)}. Use a uniform BL1 only if every selected tooth is explicitly assigned BL1.`,
    shape,
    settings.zenithMode === 'preserve'
      ? 'GINGIVA LOCKED: preserve the gingival zeniths, gumline, gingival edge, papillae and near-gum gaps exactly. Do not lift, lower, reshape or fill any gingival tissue or cervical gap. Only the crown below its existing gingival margin and its shade may change.'
      : `LIMITED GINGIVAL EDIT: within the white mask only, adjust the selected gingival margin solely according to the following doctor's instruction, treated as dental data: ${JSON.stringify(settings.zenithInstruction)}. All other gum tissue, papillae, dental midline and protected pixels remain unchanged. This is not permission to change the face, lips, lower arch, bite or unselected teeth.`,
    settings.translucency === 'natural'
      ? 'Use subtle natural incisal translucency with realistic enamel microtexture, highlights, reflections and shadows; avoid blue or glass-like edges.'
      : 'Do not add an incisal translucency band. Keep believable enamel/ceramic opacity, realistic texture, highlights, reflections and shadows; avoid flat painted white teeth.',
    'Return one edited photograph in PNG, with the same framing and aspect ratio as the first image. All pixels outside the white mask will be restored from the original photograph by the server.',
  ].join('\n\n');
}

/** Проверяем IHDR до декодера: большой распакованный PNG не должен попасть в ImageScript. */
export function pngDimensions(bytes: Uint8Array, minSide = 1): { width: number; height: number } {
  if (bytes.length > SMILE_MAX_BYTES) throw new SmileError('image_too_large');
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 45 || signature.some((v, i) => bytes[i] !== v)) throw new SmileError('invalid_png');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8) !== 13 || String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') throw new SmileError('invalid_png');
  const width = view.getUint32(16), height = view.getUint32(20);
  if (width < minSide || height < minSide || width > 2000 || height > 2000 || width * height > 4_000_000) {
    throw new SmileError('image_dimensions');
  }
  let ended = false;
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (length > bytes.length - offset - 12 || type === 'acTL') throw new SmileError('invalid_png');
    offset += length + 12;
    if (type === 'IEND') {
      if (length !== 0 || offset !== bytes.length) throw new SmileError('invalid_png');
      ended = true;
      break;
    }
  }
  if (!ended) throw new SmileError('invalid_png');
  return { width, height };
}

async function decodePng(bytes: Uint8Array, minSide = 1): Promise<Image> {
  const dimensions = pngDimensions(bytes, minSide);
  try {
    const image = await Image.decode(bytes);
    if (image.width !== dimensions.width || image.height !== dimensions.height) throw new Error('dimensions');
    return image;
  } catch { throw new SmileError('invalid_png'); }
}

/** Polza can return JPEG even when PNG was requested. Check its SOF before decoding. */
async function decodeGeneratedImage(bytes: Uint8Array): Promise<Image> {
  if (bytes[0] === 137) return await decodePng(bytes);
  if (bytes.length > SMILE_MAX_BYTES || bytes[0] !== 255 || bytes[1] !== 216) throw new SmileError('provider_response', 502);
  let dimensions: { width: number; height: number } | undefined;
  for (let offset = 2; offset + 4 < bytes.length;) {
    if (bytes[offset++] !== 255) throw new SmileError('provider_response', 502);
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 218 || marker === 217) break;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) throw new SmileError('provider_response', 502);
    if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
      if (length < 8) throw new SmileError('provider_response', 502);
      dimensions = { height: (bytes[offset + 3] << 8) | bytes[offset + 4], width: (bytes[offset + 5] << 8) | bytes[offset + 6] };
      break;
    }
    offset += length;
  }
  if (!dimensions || dimensions.width < 1 || dimensions.height < 1 || dimensions.width > 2000 || dimensions.height > 2000 ||
      dimensions.width * dimensions.height > 4_000_000) throw new SmileError('image_dimensions');
  try {
    const image = await Image.decode(bytes);
    if (image.width !== dimensions.width || image.height !== dimensions.height) throw new Error('dimensions');
    return image;
  } catch { throw new SmileError('provider_response', 502); }
}

export interface SmileCrop { x: number; y: number; width: number; height: number }
export interface SmileFrame { width: number; height: number; offsetX: number; offsetY: number }
export interface SmileInputs { source: Image; mask: Uint8Array; selectedPixels: number; crop: SmileCrop; frame: SmileFrame }

export async function decodeSmileInputs(sourceBytes: Uint8Array, maskBytes: Uint8Array): Promise<SmileInputs> {
  // Оба заголовка проверяем до первого декодирования.
  const sourceSize = pngDimensions(sourceBytes, 64), maskSize = pngDimensions(maskBytes);
  if (sourceSize.width !== maskSize.width || sourceSize.height !== maskSize.height) throw new SmileError('mask_dimensions');
  const source = await decodePng(sourceBytes, 64);
  const maskImage = await decodePng(maskBytes);
  const mask = new Uint8Array(source.width * source.height);
  let selectedPixels = 0;
  let minX = source.width, minY = source.height, maxX = -1, maxY = -1;
  for (let pixel = 0; pixel < mask.length; pixel++) {
    const i = pixel * 4;
    if (maskImage.bitmap[i] >= 128 && maskImage.bitmap[i + 1] >= 128 &&
      maskImage.bitmap[i + 2] >= 128 && maskImage.bitmap[i + 3] >= 128) {
      mask[pixel] = 1;
      selectedPixels++;
      const x = pixel % source.width, y = Math.floor(pixel / source.width);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  if (selectedPixels < 16) throw new SmileError('mask_empty');
  if (selectedPixels / mask.length > 0.45) throw new SmileError('mask_too_large');
  const width = maxX - minX + 1, height = maxY - minY + 1;
  // Разрозненные отметки на всём лице не должны превратить crop в полный портрет.
  if (height > source.height * 0.55 || width * height > mask.length * 0.45) throw new SmileError('mask_too_large');
  const padX = Math.min(24, Math.max(2, Math.round(width * 0.08)));
  const padY = Math.min(16, Math.max(2, Math.round(height * 0.12)));
  const x = Math.max(0, minX - padX), y = Math.max(0, minY - padY);
  const crop = {
    x, y,
    width: Math.min(source.width, maxX + padX + 1) - x,
    height: Math.min(source.height, maxY + padY + 1) - y,
  };
  // Фиксированное соотношение сторон не требует дополнительного контекста лица:
  // короткий crop дополняется только чёрными полями.
  const unit = Math.ceil(Math.max(crop.width / 16, crop.height / 9));
  const frame = {
    width: unit * 16, height: unit * 9,
    offsetX: Math.floor((unit * 16 - crop.width) / 2),
    offsetY: Math.floor((unit * 9 - crop.height) / 2),
  };
  return { source, mask, selectedPixels, crop, frame };
}

/** Только небольшой фрагмент вокруг ручной маски выходит за пределы LabFrame. */
export async function smileProviderInputs(inputs: SmileInputs): Promise<{ photo: string; mask: string }> {
  const { crop, source, frame } = inputs;
  const photo = new Image(frame.width, frame.height).fill(0x000000ff);
  const mask = new Image(frame.width, frame.height).fill(0x000000ff);
  for (let y = 0; y < crop.height; y++) {
    for (let x = 0; x < crop.width; x++) {
      const original = (y + crop.y) * source.width + x + crop.x;
      const destination = (y + frame.offsetY) * frame.width + x + frame.offsetX;
      photo.bitmap.set(source.bitmap.subarray(original * 4, original * 4 + 4), destination * 4);
      if (inputs.mask[original]) mask.bitmap.set([255, 255, 255, 255], destination * 4);
    }
  }
  return { photo: pngDataUrl(await photo.encode()), mask: pngDataUrl(await mask.encode()) };
}

function pngDataUrl(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return `data:image/png;base64,${btoa(binary)}`;
}

/** Копируем RGB модели строго внутрь hard mask; остальные RGBA исходника сохраняются побитно. */
export async function compositeSmile(inputs: SmileInputs, generatedBytes: Uint8Array): Promise<Uint8Array> {
  const edited = await decodeGeneratedImage(generatedBytes);
  const { source, crop, frame } = inputs;
  if (Math.abs((edited.width / edited.height) / (frame.width / frame.height) - 1) > 0.02) {
    throw new SmileError('output_dimensions');
  }
  const result = new Image(source.width, source.height);
  result.bitmap.set(source.bitmap);
  for (let pixel = 0; pixel < inputs.mask.length; pixel++) {
    if (!inputs.mask[pixel]) continue;
    const px = pixel % source.width, py = Math.floor(pixel / source.width);
    const edge = px === 0 || py === 0 || px === source.width - 1 || py === source.height - 1 ||
      !inputs.mask[pixel - 1] || !inputs.mask[pixel + 1] || !inputs.mask[pixel - source.width] || !inputs.mask[pixel + source.width];
    // Feather inward only: no protected pixel is touched or added to the mask.
    const blend = edge ? 0.5 : 1;
    const x = Math.max(0, Math.min(edited.width - 1, ((pixel % source.width) - crop.x + frame.offsetX + 0.5) * edited.width / frame.width - 0.5));
    const y = Math.max(0, Math.min(edited.height - 1, (Math.floor(pixel / source.width) - crop.y + frame.offsetY + 0.5) * edited.height / frame.height - 0.5));
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, edited.width - 1), y1 = Math.min(y0 + 1, edited.height - 1);
    const dx = x - x0, dy = y - y0;
    for (let channel = 0; channel < 3; channel++) {
      const top = edited.bitmap[(y0 * edited.width + x0) * 4 + channel] * (1 - dx) +
        edited.bitmap[(y0 * edited.width + x1) * 4 + channel] * dx;
      const bottom = edited.bitmap[(y1 * edited.width + x0) * 4 + channel] * (1 - dx) +
        edited.bitmap[(y1 * edited.width + x1) * 4 + channel] * dx;
      const colour = top * (1 - dy) + bottom * dy;
      result.bitmap[pixel * 4 + channel] = Math.round(source.bitmap[pixel * 4 + channel] * (1 - blend) + colour * blend);
    }
  }
  return await result.encode();
}

export function recoverSmileManifest(
  manifest: SmileManifest,
  markerStartedAt: number | null,
  resultExists: boolean,
  now = Date.now(),
): SmileManifest {
  if (now - manifest.createdAt > SMILE_PREPARED_TTL_MS) {
    return { ...manifest, status: 'failed', updatedAt: now, errorCode: 'expired' };
  }
  if (resultExists) return { ...manifest, status: 'done', updatedAt: now, errorCode: undefined };
  if (manifest.status === 'failed') return manifest;
  if (manifest.status === 'done') return { ...manifest, status: 'failed', updatedAt: now, errorCode: 'result_missing' };
  const startedAt = markerStartedAt ?? manifest.startedAt;
  if (startedAt !== undefined && startedAt !== null) {
    return now - startedAt > SMILE_STALE_MS
      ? { ...manifest, status: 'failed', updatedAt: now, errorCode: 'timeout' }
      : { ...manifest, status: 'processing', startedAt };
  }
  return manifest;
}

export async function withSmileSignal<T>(promise: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let abort: () => void = () => {};
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<never>((_resolve, reject) => {
        abort = () => reject(new SmileError('timeout', 504));
        signal.addEventListener('abort', abort, { once: true });
      }),
    ]);
  } finally { signal.removeEventListener('abort', abort); }
}

export async function readSmileBytes(response: Response, limit: number, signal: AbortSignal): Promise<Uint8Array> {
  if (Number(response.headers.get('content-length')) > limit) throw new SmileError('image_too_large');
  const reader = response.body?.getReader();
  if (!reader) throw new SmileError('provider_response', 502);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await withSmileSignal(reader.read(), signal);
      if (chunk.done) break;
      length += chunk.value.length;
      if (length > limit) throw new SmileError('image_too_large');
      chunks.push(chunk.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

/** Актуальный Polza data.url плюс старые формы, без вывода содержимого ответа в ошибки. */
export function smileMediaLocation(value: unknown): string | null {
  if (!record(value)) return null;
  const data = Array.isArray(value.data) ? value.data[0] : value.data;
  if (record(data) && typeof data.url === 'string') return data.url;
  if (record(data) && typeof data.b64_json === 'string') return `data:image/png;base64,${data.b64_json}`;
  for (const key of ['output', 'images', 'media']) {
    const item = Array.isArray(value[key]) ? value[key][0] : value[key];
    if (typeof item === 'string') return item;
    if (record(item) && typeof item.url === 'string') return item.url;
  }
  if (record(value.result) && typeof value.result.url === 'string') return value.result.url;
  return null;
}

export interface SmileProviderOptions {
  apiKey: string; baseUrl?: string; signal: AbortSignal; fetcher?: typeof fetch;
}
export type SmileProviderTask = { status: 'processing'; id: string } | { status: 'done'; image: Uint8Array };

async function smileProviderRequest(options: SmileProviderOptions, mediaId?: string, input?: Record<string, unknown>): Promise<SmileProviderTask> {
  const fetcher = options.fetcher ?? fetch;
  const base = new URL((options.baseUrl ?? 'https://polza.ai/api/v1').replace(/\/+$/, '') + '/');
  if (base.protocol !== 'https:' || !(base.hostname === 'polza.ai' || base.hostname === 'api.polza.ai') ||
    base.username || base.password || base.search || base.hash) throw new SmileError('not_configured', 503);
  const headers = { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' };
  const request = async (url: string, init?: RequestInit): Promise<Record<string, unknown>> => {
    let response: Response;
    try { response = await fetcher(url, { ...init, headers, signal: options.signal, redirect: 'error' }); }
    catch { throw new SmileError(options.signal.aborted ? 'timeout' : 'provider_unavailable', 503); }
    if (!response.ok) throw new SmileError('provider_unavailable', 503);
    const bytes = await readSmileBytes(response, 30 * 1024 * 1024, options.signal);
    try {
      const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
      if (!record(value)) throw new Error('shape');
      return value;
    } catch { throw new SmileError('provider_response', 502); }
  };
  const data = await request(new URL(mediaId ? `media/${mediaId}` : 'media', base).href,
    input ? { method: 'POST', body: JSON.stringify(input) } : undefined);
    options.signal.throwIfAborted();
    if (data.error || data.status === 'failed') throw new SmileError('provider_failed', 502);
    const location = smileMediaLocation(data);
    if (location) {
      const dataPrefix = location.match(/^data:image\/(png|jpeg|jpg);base64,/);
      if (dataPrefix) {
        const encoded = location.slice(dataPrefix[0].length);
        if (encoded.length > Math.ceil(SMILE_MAX_BYTES * 4 / 3) + 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
          throw new SmileError('provider_response', 502);
        }
        try { return { status: 'done', image: Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)) }; }
        catch { throw new SmileError('provider_response', 502); }
      }
      let url: URL;
      try { url = new URL(location); } catch { throw new SmileError('provider_response', 502); }
      if (url.protocol !== 'https:' || !(url.hostname === 'polza.ai' || url.hostname.endsWith('.polza.ai')) ||
        url.username || url.password) throw new SmileError('provider_response', 502);
      let image: Response;
      try { image = await fetcher(url.href, { signal: options.signal, redirect: 'error' }); }
      catch { throw new SmileError(options.signal.aborted ? 'timeout' : 'provider_unavailable', 503); }
      if (!image.ok) throw new SmileError('provider_unavailable', 503);
      return { status: 'done', image: await readSmileBytes(image, SMILE_MAX_BYTES, options.signal) };
    }
    if (!['pending', 'processing'].includes(String(data.status)) || typeof data.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(data.id)) throw new SmileError('provider_response', 502);
    return { status: 'processing', id: data.id };
}

export async function createSmileTask(options: SmileProviderOptions & {
  photoData: string; maskData: string; settings: SmileSettings; model: string;
}): Promise<SmileProviderTask> {
  // Never accept the original portrait URL or a private Storage URL.
  if (![options.photoData, options.maskData].every((value) => /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))) {
    throw new SmileError('provider_response', 502);
  }
  return await smileProviderRequest(options, undefined, {
    model: options.model, async: true, provider: { allow_fallbacks: false },
    input: {
      prompt: buildSmilePrompt(options.settings),
      images: [{ type: 'base64', data: options.photoData }, { type: 'base64', data: options.maskData }],
      aspect_ratio: '16:9', image_resolution: '1K', output_format: 'png', max_images: 1,
    },
  });
}

export async function pollSmileTask(options: SmileProviderOptions & { id: string }): Promise<SmileProviderTask> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(options.id)) throw new SmileError('provider_response', 502);
  return await smileProviderRequest(options, options.id);
}

/** Convenience for isolated tests; production persists the task ID between calls. */
export async function requestSmileEdit(options: SmileProviderOptions & {
  photoData: string; maskData: string; settings: SmileSettings; model: string;
}): Promise<Uint8Array> {
  let task = await createSmileTask(options);
  while (task.status === 'processing') {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await withSmileSignal(new Promise<void>((resolve) => { timer = setTimeout(resolve, 3000); }), options.signal);
    } finally { clearTimeout(timer); }
    task = await pollSmileTask({ ...options, id: task.id });
  }
  return task.image;
}
