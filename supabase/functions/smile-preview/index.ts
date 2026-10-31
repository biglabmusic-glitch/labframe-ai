// Отдельный закрытый пилот. Ни jobs, ни публичный results, ни отправка фото боту здесь не используются.
import { authorize, corsPreflight, jsonResponse } from '../_shared/auth.ts';
import { envAdminIds } from '../_shared/admins.ts';
import { db } from '../_shared/db.ts';
import {createFalSmileTask,pollFalSmileTask,smileProviderConfig} from '../_shared/smile-fal.ts';
import {boundedInt} from '../_shared/job-input.ts';
import { deriveSmileKey, decryptSmileBytes, encryptSmileBytes, smileEncryption } from '../_shared/smile-crypto.ts';
import {
  compositeSmile, createSmileTask, decodeSmileInputs, pollSmileTask, readSmileBytes, recoverSmileManifest,
  safeSmileError, SmileError, smilePaths, smilePilotAllowed, smileProviderInputs,
  SMILE_MAX_BYTES, SMILE_CIPHER_OVERHEAD, SMILE_TIMEOUT_MS, SMILE_PREPARED_TTL_MS,
  validateSmileSettings, withSmileSignal, type SmileManifest, type SmileSettings,
} from '../_shared/smile-preview.ts';

const BUCKET = 'photos';
const RESULT_TTL_SEC = 5 * 60;
const IO_TIMEOUT_MS = 20_000;
type Paths = ReturnType<typeof smilePaths>;

async function jobKey(userId: number, jobId: string): Promise<Uint8Array> {
  const secret = Deno.env.get('SMILE_ENCRYPTION_KEY');
  if (!secret) throw new SmileError('not_configured', 503);
  return await deriveSmileKey(secret, userId, jobId);
}

function io<T>(promise: PromiseLike<T>, signal = AbortSignal.timeout(IO_TIMEOUT_MS)): Promise<T> {
  return withSmileSignal(promise, signal);
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const bytes = await readSmileBytes(new Response(req.body, { headers: req.headers }), 16 * 1024, AbortSignal.timeout(10_000));
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('body');
    return body as Record<string, unknown>;
  } catch { throw new SmileError('bad_json'); }
}

async function saveManifest(paths: Paths, manifest: SmileManifest, upsert = true, signal?: AbortSignal) {
  const { error } = await io(db.storage.from(BUCKET).upload(paths.manifest, JSON.stringify(manifest), {
    upsert, contentType: 'application/json', cacheControl: '0',
  }), signal);
  if (error) throw new SmileError('storage_error', 503);
}

async function download(path: string, code: string, signal?: AbortSignal): Promise<Blob> {
  const { data, error } = await io(db.storage.from(BUCKET).download(path), signal);
  if (error || !data) throw new SmileError(code, code === 'job_not_found' ? 404 : 400);
  return data;
}

async function loadManifest(paths: Paths, userId: number, jobId: string): Promise<SmileManifest> {
  const blob = await download(paths.manifest, 'job_not_found');
  if (blob.size > 2048) throw new SmileError('job_not_found', 404);
  try {
    const manifest = JSON.parse(await blob.text()) as SmileManifest;
    if (manifest.version !== 2 || manifest.userId !== userId || manifest.jobId !== jobId ||
      !['prepared', 'processing', 'done', 'failed'].includes(manifest.status) ||
      !Number.isFinite(manifest.createdAt) || !Number.isFinite(manifest.updatedAt) ||
      !Number.isFinite(manifest.consentAt) || manifest.consentAt <= 0 ||
      (manifest.startedAt !== undefined && !Number.isFinite(manifest.startedAt)) ||
      (manifest.providerId !== undefined && !/^[a-zA-Z0-9_-]{1,128}$/.test(manifest.providerId)) ||
      (manifest.providerName !== undefined && !['polza','fal'].includes(manifest.providerName)) ||
      (manifest.providerModel !== undefined && (typeof manifest.providerModel!=='string' || manifest.providerModel.length>200))) throw new Error('manifest');
    return manifest;
  } catch { throw new SmileError('job_not_found', 404); }
}

async function recover(paths: Paths, manifest: SmileManifest): Promise<SmileManifest> {
  const { data: files, error } = await io(db.storage.from(BUCKET).list(paths.base, { limit: 10 }));
  if (error || !files) throw new SmileError('storage_error', 503);
  const resultExists = files.some((file) => file.name === 'result.enc');
  const markerExists = files.some((file) => file.name === 'running.json');
  let markerStartedAt: number | null = null;
  if (markerExists) {
    const marker = await download(paths.running, 'storage_error');
    if (marker.size > 256) throw new SmileError('storage_error', 503);
    try {
      const value = JSON.parse(await marker.text());
      if (value.deleted === true) throw new SmileError('job_not_found', 404);
      if (!Number.isFinite(value.startedAt) || value.startedAt <= 0) throw new Error('marker');
      markerStartedAt = value.startedAt;
    } catch (error) { if (error instanceof SmileError) throw error; throw new SmileError('storage_error', 503); }
  }
  const recovered = recoverSmileManifest(manifest, markerStartedAt, resultExists);
  if (recovered.status !== manifest.status) {
    // Результат и marker — источник восстановления, даже если запись manifest не доехала.
    await saveManifest(paths, recovered).catch(() => {});
  }
  return recovered;
}

async function statusResponse(paths: Paths, manifest: SmileManifest): Promise<Response> {
  if (manifest.status === 'done') {
    const { data, error } = await io(db.storage.from(BUCKET).createSignedUrl(paths.result, RESULT_TTL_SEC));
    if (error || !data) throw new SmileError('storage_error', 503);
    return privateJson({
      jobId: manifest.jobId, status: 'done', resultUrl: data.signedUrl,
      encryption: smileEncryption(await jobKey(manifest.userId, manifest.jobId)),
    });
  }
  return privateJson({
    jobId: manifest.jobId,
    status: manifest.status,
    ...(manifest.status === 'failed' ? {
      error: safeSmileError(new SmileError(manifest.errorCode ?? 'processing_failed')).code,
      message: safeSmileError(new SmileError(manifest.errorCode ?? 'processing_failed')).message,
    } : {}),
  });
}

function privateJson(body: unknown, status = 200): Response {
  return jsonResponse(body, { status, headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } });
}

/** В отличие от общего fail-open helper, сбой лимита пилота запрещает платный вызов. */
async function requireRate(userId: number, action: string, limit: number, windowSec=3600) {
  const { data, error } = await io(db.rpc('hit_rate_limit', {
    p_user_id: userId, p_action: action, p_limit: limit, p_window_sec: windowSec,
  }));
  if (error || typeof data !== 'boolean') throw new SmileError('storage_error', 503);
  if (!data) throw new SmileError('rate_limited', 429);
}

async function removeJob(paths: Paths): Promise<void> {
  const { error } = await io(db.storage.from(BUCKET).remove([
    // running.json — маленькая tombstone/оплаченный замок. Не удаляем её здесь:
    // generate мог уже прочитать prepared, а signed upload ещё может быть действителен.
    // Отдельный sweep удалит оставшиеся метаданные после истечения срока загрузки.
    paths.photo, paths.mask, paths.result, paths.manifest,
  ]));
  if (error) throw new SmileError('storage_error', 503);
}

async function loadJobInputs(paths: Paths, manifest: SmileManifest, signal: AbortSignal) {
    const [photo, mask] = await Promise.all([
      download(paths.photo, 'missing_upload', signal), download(paths.mask, 'missing_upload', signal),
    ]);
    if (photo.size > SMILE_MAX_BYTES + SMILE_CIPHER_OVERHEAD || mask.size > SMILE_MAX_BYTES + SMILE_CIPHER_OVERHEAD) {
      throw new SmileError('image_too_large');
    }
    const key = await jobKey(manifest.userId, manifest.jobId);
    let photoBytes: Uint8Array, maskBytes: Uint8Array;
    try {
      [photoBytes, maskBytes] = await Promise.all([
        decryptSmileBytes(new Uint8Array(await photo.arrayBuffer()), key, manifest.jobId, 'photo'),
        decryptSmileBytes(new Uint8Array(await mask.arrayBuffer()), key, manifest.jobId, 'mask'),
      ]);
    } catch { throw new SmileError('invalid_encryption'); }
    const inputs = await withSmileSignal(decodeSmileInputs(
      photoBytes, maskBytes,
    ), signal);
    return { inputs, key };
}

async function completeJob(paths: Paths, manifest: SmileManifest, generated: Uint8Array, signal: AbortSignal,
  loaded?: Awaited<ReturnType<typeof loadJobInputs>>) {
    const { inputs, key } = loaded ?? await loadJobInputs(paths, manifest, signal);
    const result = await withSmileSignal(compositeSmile(inputs, generated), signal);
    const encryptedResult = await encryptSmileBytes(result, key, manifest.jobId, 'result');
    signal.throwIfAborted();
    const current = await recover(paths, await loadManifest(paths, manifest.userId, manifest.jobId));
    if (current.status === 'done') return;
    const { error } = await io(db.storage.from(BUCKET).upload(paths.result, encryptedResult, {
      upsert: false, contentType: 'application/octet-stream', cacheControl: '0',
    }), signal);
    if (error) {
      // Concurrent status checks may finish the same provider result. First wins.
      const existing = await recover(paths, await loadManifest(paths, manifest.userId, manifest.jobId));
      if (existing.status === 'done') return;
      throw new SmileError('storage_error', 503);
    }
    await saveManifest(paths, { ...manifest, status: 'done', updatedAt: Date.now() });
    // Deletion may win after the preflight but before our writes finish.
    // The persistent tombstone keeps late bytes inaccessible; remove them as well.
    try { await recover(paths, await loadManifest(paths, manifest.userId, manifest.jobId)); }
    catch (error) {
      if (error instanceof SmileError && error.code === 'job_not_found') await removeJob(paths);
      throw error;
    }
}

async function failJob(paths: Paths, manifest: SmileManifest, error: unknown) {
    const safe = safeSmileError(error);
    console.error('smile-preview failed:', safe.code);
    await loadManifest(paths, manifest.userId, manifest.jobId)
      .then(async (latest) => {
        const active = await recover(paths, latest);
        if (active.status !== 'done') await saveManifest(paths, { ...active, status: 'failed', errorCode: safe.code, updatedAt: Date.now() });
      }).catch(() => {});
}

async function runJob(paths: Paths, manifest: SmileManifest, settings: SmileSettings) {
  const signal = AbortSignal.timeout(SMILE_TIMEOUT_MS);
  let submitted=false;
  try {
    const loaded = await loadJobInputs(paths, manifest, signal);
    const cropped = await withSmileSignal(smileProviderInputs(loaded.inputs), signal);
    submitted=true;
    const task = manifest.providerName==='fal' ? await createFalSmileTask({photoData:cropped.photo,maskData:cropped.mask,settings,signal}) : await createSmileTask({
      photoData: cropped.photo, maskData: cropped.mask, settings,
      apiKey: Deno.env.get('POLZA_API_KEY')!,
      model: manifest.providerModel || Deno.env.get('POLZA_SMILE_MODEL') || Deno.env.get('POLZA_IMAGE_MODEL') || 'google/gemini-3.1-flash-image-preview',
      baseUrl: Deno.env.get('POLZA_MEDIA_BASE_URL') || undefined,
      signal,
    });
    if(task.id){
      const accepted={...manifest,providerId:task.id,updatedAt:Date.now()};
      await saveManifest(paths,accepted);
      manifest=accepted;
    }
    if (task.status === 'done') await completeJob(paths, manifest, task.image, signal, loaded);
  } catch (error) {
    if(submitted && !manifest.providerId && ['provider_unavailable','provider_response','timeout','storage_error'].includes(safeSmileError(error).code)){
      // An unacknowledged POST may already be paid. Keep its lock until the deadline.
      return;
    }
    await failJob(paths, manifest, error);
  }
}

async function resumeJob(paths: Paths, manifest: SmileManifest): Promise<SmileManifest> {
  if (manifest.status !== 'processing' || !manifest.providerId) return manifest;
  try {
    const signal = AbortSignal.timeout(20_000);
    const task = manifest.providerName==='fal' ? await pollFalSmileTask(manifest.providerId,signal) : await pollSmileTask({
      id: manifest.providerId, apiKey: Deno.env.get('POLZA_API_KEY')!,
      baseUrl: Deno.env.get('POLZA_MEDIA_BASE_URL') || undefined, signal,
    });
    if (task.status === 'done') await completeJob(paths, manifest, task.image, signal);
  } catch (error) {
    const code = safeSmileError(error).code;
    // Transient polling failures must never lose a paid task or create another one.
    if (!['provider_unavailable', 'provider_response', 'timeout', 'storage_error'].includes(code)) await failJob(paths, manifest, error);
  }
  return await recover(paths, await loadManifest(paths, manifest.userId, manifest.jobId));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight();
  if (req.method !== 'POST') return privateJson({ error: 'method' }, 405);
  const auth = await authorize(req);
  if ('response' in auth) return auth.response;
  const userId = auth.user.id;
  try {
    const { data: row, error: permissionError } = await io(db.from('users').select('is_admin, banned, smile_tester, consent_at, consent_version').eq('id', userId).maybeSingle());
    if (permissionError) throw new SmileError('auth_unavailable', 503);
    if (row?.banned) throw new SmileError('banned', 403);
    if (!smilePilotAllowed(userId, envAdminIds(), row)) throw new SmileError('not_admin', 403);
    const { data: bucket, error: bucketError } = await io(db.storage.getBucket(BUCKET));
    if (bucketError || !bucket || bucket.public !== false) throw new SmileError('private_storage_required', 503);

    const body = await readBody(req);
    if(['prepare','generate'].includes(String(body.action)) && (!row?.consent_at || row.consent_version!==2))throw new SmileError('permission_required',403);
    if (body.action === 'prepare') {
      if (body.consent !== true) throw new SmileError('permission_required');
      const provider=smileProviderConfig();
      if((body.expectedProvider??'polza')!==provider.providerName)throw new SmileError('processor_changed',409);
      await requireRate(userId, 'smile-prepare', 60);
      const jobId = crypto.randomUUID();
      const encryption = smileEncryption(await jobKey(userId, jobId));
      const paths = smilePaths(userId, jobId);
      const now = Date.now();
      await saveManifest(paths, {
        version: 2, jobId, userId, status: 'prepared', createdAt: now, updatedAt: now, consentAt: now,...provider,
      }, false);
      const [photo, mask] = await Promise.all([
        io(db.storage.from(BUCKET).createSignedUploadUrl(paths.photo, { upsert: false })),
        io(db.storage.from(BUCKET).createSignedUploadUrl(paths.mask, { upsert: false })),
      ]);
      if (photo.error || mask.error || !photo.data || !mask.data) throw new SmileError('storage_error', 503);
      return privateJson({ jobId, encryption, photo: { uploadUrl: photo.data.signedUrl, path: paths.photo }, mask: { uploadUrl: mask.data.signedUrl, path: paths.mask } });
    }

    const paths = smilePaths(userId, body.jobId);
    let manifest: SmileManifest;
    try { manifest = await loadManifest(paths, userId, body.jobId as string); }
    catch (error) {
      if (body.action === 'delete' && error instanceof SmileError && error.code === 'job_not_found') {
        await removeJob(paths);
        return privateJson({ deleted: true });
      }
      throw error;
    }
    if (Date.now() - manifest.createdAt > SMILE_PREPARED_TTL_MS) {
      await removeJob(paths);
      if (body.action === 'delete') return privateJson({ deleted: true });
      throw new SmileError('expired', 410);
    }
    const current = await recover(paths, manifest);
    if (body.action === 'delete') {
      if (current.status === 'processing') throw new SmileError('processing_active', 409);
      if (current.status === 'prepared') {
        // Тот же atomic insert, что у generate: только один из них может победить.
        const { error: lockError } = await io(db.storage.from(BUCKET).upload(paths.running, JSON.stringify({
          startedAt: Date.now(), deleted: true,
        }), { upsert: false, contentType: 'application/json', cacheControl: '0' }));
        if (lockError) {
          const locked = await recover(paths, await loadManifest(paths, userId, current.jobId));
          if (locked.status === 'processing') throw new SmileError('processing_active', 409);
          if (locked.status === 'prepared') throw new SmileError('storage_error', 503);
        }
      }
      const { error: tombstoneError } = await io(db.storage.from(BUCKET).upload(paths.running, JSON.stringify({
        startedAt: Date.now(), deleted: true,
      }), { upsert: true, contentType: 'application/json', cacheControl: '0' }));
      if (tombstoneError) throw new SmileError('storage_error', 503);
      await removeJob(paths);
      return privateJson({ deleted: true });
    }
    if (body.action === 'status') return await statusResponse(paths, await resumeJob(paths, current));
    if (body.action !== 'generate') return privateJson({ error: 'unknown_action' }, 400);
    // Повторный generate только возвращает состояние, даже если body.settings уже другие.
    if (current.status !== 'prepared') return await statusResponse(paths, current);
    const settings = validateSmileSettings(body.settings);
    if (!Deno.env.get('POLZA_API_KEY')) throw new SmileError('not_configured', 503);
    const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (work: Promise<unknown>) => void } }).EdgeRuntime;
    if (!runtime?.waitUntil) throw new SmileError('runtime_unavailable', 503);
    await requireRate(userId, 'smile-generate', 20);
    await requireRate(0,'smile-daily-budget',boundedInt(Deno.env.get('SMILE_GENERATIONS_PER_DAY'),100,10000),86400);
    const startedAt = Date.now();
    // Уникальная вставка в Storage — атомарный замок, общий для всех Edge isolates.
    const { error: markerError } = await io(db.storage.from(BUCKET).upload(paths.running, JSON.stringify({ startedAt }), {
      upsert: false, contentType: 'application/json', cacheControl: '0',
    }));
    if (markerError) return await statusResponse(paths, await recover(paths, await loadManifest(paths, userId, manifest.jobId)));
    const processing: SmileManifest = { ...current, status: 'processing', startedAt, updatedAt: startedAt };
    await saveManifest(paths, processing);
    runtime.waitUntil(runJob(paths, processing, settings));
    return privateJson({ jobId: manifest.jobId, status: 'processing' });
  } catch (error) {
    const safe = safeSmileError(error);
    return privateJson({ error: safe.code, message: safe.message }, error instanceof SmileError ? error.status : 503);
  }
});
