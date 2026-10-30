export interface SmileEncryption {
  algorithm: 'AES-GCM';
  key: string;
}

export type SmileImageKind = 'photo' | 'mask' | 'result';

const ENVELOPE_VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

async function importSmileKey(encryption: SmileEncryption): Promise<CryptoKey> {
  if (!globalThis.crypto?.subtle || encryption?.algorithm !== 'AES-GCM' || typeof encryption.key !== 'string') {
    throw new Error('encryption_unavailable');
  }
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = Uint8Array.from(atob(encryption.key), (character) => character.charCodeAt(0));
  } catch {
    throw new Error('invalid_encryption_key');
  }
  if (bytes.length !== 32) throw new Error('invalid_encryption_key');
  try {
    return await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
  } finally {
    bytes.fill(0);
  }
}

function additionalData(jobId: string, kind: SmileImageKind): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`labframe-smile:${jobId}:${kind}`);
}

/** The only persisted representation is version + random IV + authenticated ciphertext. */
export async function encryptSmileImage(
  blob: Blob,
  encryption: SmileEncryption,
  jobId: string,
  kind: SmileImageKind,
): Promise<Blob> {
  const key = await importSmileKey(encryption);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = await blob.arrayBuffer();
  try {
    const ciphertext = await crypto.subtle.encrypt({
      name: 'AES-GCM', iv, additionalData: additionalData(jobId, kind), tagLength: TAG_BYTES * 8,
    }, key, plaintext);
    return new Blob([new Uint8Array([ENVELOPE_VERSION]), iv, ciphertext], { type: 'application/octet-stream' });
  } finally {
    new Uint8Array(plaintext).fill(0);
  }
}

export async function decryptSmileImage(
  blob: Blob,
  encryption: SmileEncryption,
  jobId: string,
  kind: SmileImageKind,
): Promise<Blob> {
  const key = await importSmileKey(encryption);
  const envelope = new Uint8Array(await blob.arrayBuffer());
  if (envelope.length < 1 + IV_BYTES + TAG_BYTES || envelope[0] !== ENVELOPE_VERSION) {
    throw new Error('invalid_encrypted_image');
  }
  const plaintext = await crypto.subtle.decrypt({
    name: 'AES-GCM',
    iv: envelope.slice(1, 1 + IV_BYTES),
    additionalData: additionalData(jobId, kind),
    tagLength: TAG_BYTES * 8,
  }, key, envelope.slice(1 + IV_BYTES));
  try {
    return new Blob([plaintext], { type: 'image/png' });
  } finally {
    new Uint8Array(plaintext).fill(0);
  }
}
