import type { PreparedSmileCrop } from './smile-crop';
import { validateSmileCropGeometry } from './smile-crop-geometry';
import type { NormalizedSmilePhoto } from './smile-preview';

/** Originals are kept on this browser only. This module never makes a network request. */
export interface SmileLocalSource {
  photo: NormalizedSmilePhoto;
  crop: PreparedSmileCrop;
}

interface StoredSource extends SmileLocalSource {
  version: 1;
  jobId: string;
  createdAt: number;
  expiresAt: number;
}

const DATABASE = 'labframe-smile-local-source';
const STORE = 'sources';
const MARKER = 'labframe.smilePreview.cropJobId';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TTL_MS = 24 * 60 * 60_000;
const OPEN_TIMEOUT_MS = 1500;
const TRANSACTION_TIMEOUT_MS = 2500;
const MAX_BLOB_BYTES = 20 * 1024 * 1024;
const pending = new Map<string, Promise<unknown>>();
// A late save must not bring back an image the user has just deleted.
const deleted = new Set<string>();

function isJobId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

export function markSmileCropJob(jobId: string): void {
  if (!isJobId(jobId) || deleted.has(jobId)) return;
  try { sessionStorage.setItem(MARKER, jobId); } catch { /* Private mode may deny storage. */ }
}

export function isSmileCropJob(jobId: string): boolean {
  if (!isJobId(jobId) || deleted.has(jobId)) return false;
  try { return sessionStorage.getItem(MARKER) === jobId; } catch { return false; }
}

function clearMarker(jobId: string): void {
  try {
    if (sessionStorage.getItem(MARKER) === jobId) sessionStorage.removeItem(MARKER);
  } catch { /* Deletion of the actual browser record is independent of sessionStorage. */ }
}

function pngBlob(value: unknown): value is Blob {
  return value instanceof Blob && value.type === 'image/png' && value.size > 0 && value.size <= MAX_BLOB_BYTES;
}

function validSource(value: unknown): value is SmileLocalSource {
  if (!value || typeof value !== 'object') return false;
  const { photo, crop } = value as Partial<SmileLocalSource>;
  if (!photo || !crop || !pngBlob(photo.blob) || !pngBlob(crop.photo) || !pngBlob(crop.mask) ||
    !Number.isInteger(photo.width) || !Number.isInteger(photo.height) || photo.width < 64 || photo.height < 64 ||
    photo.width > 2000 || photo.height > 2000 || photo.width * photo.height > 4_000_000 ||
    crop.sourceWidth !== photo.width || crop.sourceHeight !== photo.height) return false;
  try { validateSmileCropGeometry(crop); return true; } catch { return false; }
}

/** Copy only the persisted contract: no object URLs, Files, component state, or other fields. */
function copySource(value: SmileLocalSource): SmileLocalSource {
  const { photo, crop } = value;
  const blob = (image: Blob) => image.slice(0, image.size, 'image/png');
  return {
    photo: { blob: blob(photo.blob), width: photo.width, height: photo.height },
    crop: {
      photo: blob(crop.photo), mask: blob(crop.mask), sourceWidth: crop.sourceWidth, sourceHeight: crop.sourceHeight,
      width: crop.width, height: crop.height,
      region: { x: crop.region.x, y: crop.region.y, width: crop.region.width, height: crop.region.height },
      offsetX: crop.offsetX, offsetY: crop.offsetY, polygon: crop.polygon.map((point) => ({ x: point.x, y: point.y })),
    },
  };
}

function queue<T>(jobId: string, work: () => Promise<T>): Promise<T> {
  const next = (pending.get(jobId) ?? Promise.resolve()).catch(() => {}).then(work);
  pending.set(jobId, next);
  void next.then(() => { if (pending.get(jobId) === next) pending.delete(jobId); },
    () => { if (pending.get(jobId) === next) pending.delete(jobId); });
  return next;
}

function openDatabase(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    let settled = false;
    const finish = (db: IDBDatabase | null) => {
      if (settled) { db?.close(); return; }
      settled = true;
      clearTimeout(timer);
      resolve(db);
    };
    const timer = setTimeout(() => finish(null), OPEN_TIMEOUT_MS);
    try {
      if (typeof indexedDB === 'undefined') { finish(null); return; }
      request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => {
        if (settled) { request.transaction?.abort(); return; }
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'jobId' });
      };
      request.onblocked = () => finish(null);
      request.onerror = () => finish(null);
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        finish(db);
      };
    } catch { finish(null); }
  });
}

/** Purge and the requested operation share a bounded transaction; the database closes afterward. */
async function operation<T>(run: (store: IDBObjectStore, done: (value: T) => void) => void): Promise<T | null> {
  const db = await openDatabase();
  if (!db) return null;
  return await new Promise<T | null>((resolve) => {
    let transaction: IDBTransaction | undefined;
    let value: T | null = null;
    let settled = false;
    const finish = (result: T | null) => {
      if (settled) return;
      settled = true; clearTimeout(timer); db.close(); resolve(result);
    };
    const timer = setTimeout(() => {
      try { transaction?.abort(); } catch { /* Transaction may already be inactive. */ }
      finish(null);
    }, TRANSACTION_TIMEOUT_MS);
    try {
      transaction = db.transaction(STORE, 'readwrite');
      transaction.oncomplete = () => finish(value);
      transaction.onerror = () => finish(null);
      transaction.onabort = () => finish(null);
      const store = transaction.objectStore(STORE);
      const cursor = store.openCursor();
      const fail = () => {
        try { transaction?.abort(); } catch { /* Already inactive. */ }
        finish(null);
      };
      cursor.onerror = fail;
      cursor.onsuccess = () => {
        if (settled) return;
        try {
          const current = cursor.result;
          if (!current) { run(store, (result) => { value = result; }); return; }
          const record = current.value as Partial<StoredSource> | undefined;
          if (!record || record.version !== 1 || !Number.isFinite(record.expiresAt) || record.expiresAt! <= Date.now()) current.delete();
          current.continue();
        } catch { fail(); }
      };
    } catch { finish(null); }
  });
}

export async function saveSmileLocalSource(jobId: string, source: SmileLocalSource): Promise<boolean> {
  if (!isJobId(jobId) || deleted.has(jobId) || !validSource(source)) return false;
  const copy = copySource(source);
  return await queue(jobId, async () => {
    if (deleted.has(jobId)) return false;
    const now = Date.now();
    return await operation<boolean>((store, done) => {
      if (deleted.has(jobId)) { done(false); return; }
      const request = store.put({ version: 1, jobId, createdAt: now, expiresAt: now + TTL_MS, ...copy } satisfies StoredSource);
      request.onsuccess = () => done(true);
    }) ?? false;
  }).catch(() => false);
}

export async function loadSmileLocalSource(jobId: string): Promise<SmileLocalSource | null> {
  if (!isJobId(jobId) || deleted.has(jobId)) return null;
  return await queue(jobId, async () => await operation<SmileLocalSource>((store, done) => {
    const request = store.get(jobId);
    request.onsuccess = () => {
      const record = request.result as Partial<StoredSource> | undefined;
      if (!record) return;
      if (record.version !== 1 || record.jobId !== jobId || !Number.isFinite(record.createdAt) ||
        !Number.isFinite(record.expiresAt) || record.expiresAt! <= Date.now() ||
        record.expiresAt! > record.createdAt! + TTL_MS || deleted.has(jobId) || !validSource(record)) {
        store.delete(jobId); return;
      }
      done(copySource(record as StoredSource));
    };
  })).catch(() => null);
}

export async function deleteSmileLocalSource(jobId: string): Promise<void> {
  if (!isJobId(jobId)) return;
  deleted.add(jobId);
  clearMarker(jobId);
  await queue(jobId, async () => { await operation<boolean>((store, done) => {
    const request = store.delete(jobId); request.onsuccess = () => done(true);
  }); }).catch(() => {});
}
