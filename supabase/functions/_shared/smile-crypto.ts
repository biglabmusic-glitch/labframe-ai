// A per-job key keeps a leaked result key isolated from every other photograph.
// The master key lives only in Functions Secrets; never include it in responses.
export type SmileImageKind = 'photo' | 'mask' | 'result';
const encoder = new TextEncoder();

function fromBase64(value: string): Uint8Array {
  try { return Uint8Array.from(atob(value), (char) => char.charCodeAt(0)); }
  catch { throw new Error('invalid_encryption_key'); }
}

function base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

export async function deriveSmileKey(masterSecret: string, userId: number, jobId: string): Promise<Uint8Array> {
  const master = fromBase64(masterSecret);
  if (master.length !== 32 || !Number.isSafeInteger(userId) || userId <= 0 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
    throw new Error('invalid_encryption_key');
  }
  const material = await crypto.subtle.importKey('raw', new Uint8Array(master), 'HKDF', false, ['deriveBits']);
  master.fill(0);
  const bits = await crypto.subtle.deriveBits({
    name: 'HKDF', hash: 'SHA-256', salt: encoder.encode(`labframe-smile:${userId}`),
    info: encoder.encode(`v1:${jobId}`),
  }, material, 256);
  return new Uint8Array(bits);
}

export function smileEncryption(key: Uint8Array): { algorithm: 'AES-GCM'; key: string } {
  if (key.length !== 32) throw new Error('invalid_encryption_key');
  return { algorithm: 'AES-GCM', key: base64(key) };
}

async function importImageKey(key: Uint8Array, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  if (key.length !== 32) throw new Error('invalid_encryption_key');
  return await crypto.subtle.importKey('raw', new Uint8Array(key), 'AES-GCM', false, [usage]);
}

export async function encryptSmileBytes(bytes: Uint8Array, key: Uint8Array, jobId: string, kind: SmileImageKind): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({
    name: 'AES-GCM', iv, additionalData: encoder.encode(`labframe-smile:${jobId}:${kind}`), tagLength: 128,
  }, await importImageKey(key, 'encrypt'), new Uint8Array(bytes));
  const envelope = new Uint8Array(13 + cipher.byteLength);
  envelope[0] = 1;
  envelope.set(iv, 1);
  envelope.set(new Uint8Array(cipher), 13);
  return envelope;
}

export async function decryptSmileBytes(envelope: Uint8Array, key: Uint8Array, jobId: string, kind: SmileImageKind): Promise<Uint8Array> {
  if (envelope.length < 29 || envelope[0] !== 1) throw new Error('invalid_encrypted_image');
  try {
    const bytes = await crypto.subtle.decrypt({
      name: 'AES-GCM', iv: envelope.slice(1, 13),
      additionalData: encoder.encode(`labframe-smile:${jobId}:${kind}`), tagLength: 128,
    }, await importImageKey(key, 'decrypt'), envelope.slice(13));
    return new Uint8Array(bytes);
  } catch { throw new Error('invalid_encrypted_image'); }
}
