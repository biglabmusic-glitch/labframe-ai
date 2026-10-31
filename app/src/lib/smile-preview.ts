import { WebApp } from '../telegram/webapp';
import { decryptSmileImage, encryptSmileImage, type SmileEncryption, type SmileImageKind } from './smile-crypto';

export const UPPER_TEETH = [16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26] as const;
export const SMILE_SHADES = [
  'BL1', 'BL2', 'BL3', 'BL4', 'A1', 'A2', 'A3', 'A3.5', 'A4',
  'B1', 'B2', 'B3', 'B4', 'C1', 'C2', 'C3', 'C4', 'D2', 'D3', 'D4',
] as const;

export type SmileShade = typeof SMILE_SHADES[number];
export type SmileShape = 'original' | 'square' | 'triangular' | 'rounded';
export interface SmileSettings {
  teeth: number[];
  shades: Record<string, string>;
  shape: SmileShape;
  zenithMode: 'preserve' | 'allow';
  zenithInstruction?: string;
  translucency: 'none' | 'natural';
  imageResolution?: '1K' | '2K';
}
export interface NormalizedSmilePhoto {
  blob: Blob;
  width: number;
  height: number;
}
export interface SmilePreparedJob {
  jobId: string;
  photo: { uploadUrl: string; path: string };
  mask: { uploadUrl: string; path: string };
  encryption: SmileEncryption;
}
export interface SmileJobStatus {
  jobId: string;
  status: 'prepared' | 'processing' | 'done' | 'failed';
  resultUrl?: string;
  encryption?: SmileEncryption;
  error?: string;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
const REQUEST_TIMEOUT_MS = 25_000;
const JOB_STORAGE_KEY = 'labframe.smilePreview.jobId';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSmilePreviewReady(): boolean {
  return Boolean(API_BASE);
}

export function readSmileJobId(): string | null {
  try {
    const id = sessionStorage.getItem(JOB_STORAGE_KEY);
    return id && UUID.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** Only an opaque job ID is persisted. Patient images and links stay in memory. */
export function rememberSmileJobId(id: string | null): void {
  try {
    if (id && UUID.test(id)) sessionStorage.setItem(JOB_STORAGE_KEY, id);
    else sessionStorage.removeItem(JOB_STORAGE_KEY);
  } catch { /* Storage may be unavailable in a WebView. */ }
}

export class SmilePreviewError extends Error {
  constructor(public code: string, public status = 0) {
    super(code);
    this.name = 'SmilePreviewError';
  }
}

async function timedFetch(url: string, init: RequestInit, outerSignal?: AbortSignal, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (outerSignal?.aborted) controller.abort();
  else outerSignal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    // In particular, never retry a generate POST after a network timeout.
    return await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
    outerSignal?.removeEventListener('abort', abort);
  }
}

async function request<T>(body: unknown, signal?: AbortSignal): Promise<T> {
  if (!API_BASE) throw new SmilePreviewError('not_configured');
  const response = await timedFetch(`${API_BASE.replace(/\/+$/, '')}/smile-preview`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-telegram-initdata': WebApp?.initData ?? '',
      ...(ANON_KEY ? { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } : {}),
    },
    body: JSON.stringify(body),
  }, signal);
  if (!response.ok) {
    const payload: { error?: unknown; code?: unknown } = await response.json().catch(() => ({}));
    const code = typeof payload.error === 'string' ? payload.error :
      typeof payload.code === 'string' ? payload.code : 'request_failed';
    throw new SmilePreviewError(code, response.status);
  }
  return response.json() as Promise<T>;
}

export function prepareSmileJob(signal?: AbortSignal): Promise<SmilePreparedJob> {
  return request({ action: 'prepare', consent: true }, signal);
}

export function generateSmilePreview(jobId: string, settings: SmileSettings, signal?: AbortSignal): Promise<SmileJobStatus> {
  return request({ action: 'generate', jobId, settings }, signal);
}

export function getSmileJobStatus(jobId: string, signal?: AbortSignal): Promise<SmileJobStatus> {
  return request({ action: 'status', jobId }, signal);
}

export function deleteSmileJob(jobId: string, signal?: AbortSignal): Promise<{ deleted: true }> {
  return request({ action: 'delete', jobId }, signal);
}

export async function uploadSmilePng(
  url: string, blob: Blob, encryption: SmileEncryption, jobId: string, kind: SmileImageKind, signal?: AbortSignal,
): Promise<void> {
  let ciphertext: Blob;
  try {
    ciphertext = await encryptSmileImage(blob, encryption, jobId, kind);
  } catch {
    throw new SmilePreviewError('encryption_unavailable');
  }
  signal?.throwIfAborted();
  // A signed storage URL carries its own scoped permission; do not send Telegram or API credentials.
  const response = await timedFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: ciphertext,
  }, signal, 60_000);
  if (!response.ok) throw new SmilePreviewError('upload_failed', response.status);
}

/** Download ciphertext without application credentials; show decrypted pixels from an in-memory Blob. */
export async function loadSmileResult(result: SmileJobStatus, signal?: AbortSignal): Promise<string> {
  if (!result.resultUrl || !result.encryption) throw new SmilePreviewError('missing_result');
  const response = await timedFetch(result.resultUrl, { method: 'GET' }, signal, 60_000);
  if (!response.ok) throw new SmilePreviewError('download_failed', response.status);
  const ciphertext = await response.blob();
  if (ciphertext.size > 20 * 1024 * 1024 + 29) throw new SmilePreviewError('invalid_encrypted_image');
  try {
    const image = await decryptSmileImage(ciphertext, result.encryption, result.jobId, 'result');
    signal?.throwIfAborted();
    return URL.createObjectURL(image);
  } catch {
    throw new SmilePreviewError('decryption_failed');
  }
}

/** The mask editor uses these exact pixels, after orientation and resizing. */
export async function normalizeSmilePhoto(file: File): Promise<NormalizedSmilePhoto> {
  if (file.size > 20 * 1024 * 1024) throw new SmilePreviewError('photo_too_large');
  if (file.type && !file.type.startsWith('image/')) throw new SmilePreviewError('unsupported_image');
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new SmilePreviewError('unsupported_image'));
      img.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new SmilePreviewError('unsupported_image');
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    if (width < 64 || height < 64) throw new SmilePreviewError('image_dimensions');
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new SmilePreviewError('canvas_unavailable');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new SmilePreviewError('canvas_unavailable');
    if (blob.size > 20 * 1024 * 1024) throw new SmilePreviewError('photo_too_large');
    return { blob, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function downloadSmilePng(url: string, jobId: string): Promise<void> {
  if (!url.startsWith('blob:')) throw new SmilePreviewError('download_failed');
  const link = document.createElement('a');
  link.href = url;
  link.download = `smile-preview-${jobId}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function smileErrorMessage(error: unknown): string {
  if (error instanceof SmilePreviewError) {
    if (error.status === 401) return 'Откройте мини-приложение заново через Telegram, чтобы подтвердить вход.';
    if (error.status === 403) return 'Доступ к закрытому тесту не подтверждён. Попросите администратора проверить приглашение.';
    if (error.status === 429) return 'Слишком много запросов. Подождите немного перед следующей попыткой.';
    if (error.code === 'job_not_found' || error.code === 'expired') return 'Эта примерка уже удалена или срок её хранения истёк. Можно создать новую.';
    if (error.status === 404 || error.code === 'not_configured' || /disabled|not_enabled/.test(error.code)) {
      return 'Пилот ещё не включён на сервере. Параметры можно подготовить, но генерация пока недоступна.';
    }
    if (error.code === 'photo_too_large') return 'Выберите фото размером до 20 МБ.';
    if (error.code === 'image_dimensions') return 'Выберите фото, у которого ширина и высота не меньше 64 пикселей.';
    if (error.code === 'unsupported_image') return 'Не удалось открыть фото. Сохраните его в JPEG или PNG и попробуйте снова.';
    if (error.code === 'canvas_unavailable') return 'Браузер не смог подготовить фото. Попробуйте открыть приложение заново.';
    if (error.code === 'upload_failed') return 'Фото или маска не загрузились. Проверьте соединение.';
    if (error.code === 'encryption_unavailable') return 'Браузер не смог зашифровать фото. Обновите Telegram или откройте приложение на другом устройстве.';
    if (/decryption|encrypted_image/.test(error.code)) return 'Не удалось расшифровать результат. Проверьте статус примерки ещё раз.';
    if (error.code === 'job_processing' || error.status === 409) return 'Примерка ещё обрабатывается. Дождитесь завершения, затем удалите её.';
    if (error.code === 'download_failed') return 'Не удалось скачать PNG. Обновите временную ссылку и попробуйте ещё раз.';
    if (error.code === 'timeout') return 'Время ожидания модели истекло. Проверьте статус этой примерки перед новой попыткой.';
    if (error.code === 'provider_failed') return 'AI не смог обработать снимок. Попробуйте другую фотографию.';
    if (error.code === 'provider_response' || error.code === 'processing_failed') return 'Не удалось применить ответ AI. Изображение не изменено; можно создать новую примерку.';
    if (error.code === 'provider_unavailable') return 'AI временно недоступен. Позже проверьте статус этой же примерки.';
    if (error.code === 'output_dimensions') return 'AI изменил пропорции фрагмента. Результат не применён, чтобы не исказить фото.';
    if (error.code === 'output_alignment') return 'AI сместил или изменил детали вокруг зубов. Результат отклонён. Создайте новую примерку.';
    if (/mask/.test(error.code)) return 'Проверьте маску: выделите только разрешённую для изменения область.';
    if (/settings|teeth|shade|zenith|instruction|shape/.test(error.code)) return 'Проверьте выбранные зубы, оттенки и указание для зенитов.';
  }
  return 'Не удалось получить ответ. Проверьте соединение и статус примерки перед новым запуском.';
}
