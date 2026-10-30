import assert from 'node:assert/strict';
import { decryptSmileImage, encryptSmileImage } from '../app/src/lib/smile-crypto.ts';
import { decryptSmileBytes, encryptSmileBytes } from '../supabase/functions/_shared/smile-crypto.ts';

const encryption = { algorithm: 'AES-GCM', key: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64') };
const jobId = 'c6ca2a6b-476f-4b45-9929-ab88bc78e0be';
const original = new Blob([new Uint8Array([137, 80, 78, 71, 0, 255, 34, 16])], { type: 'image/png' });
const ciphertext = await encryptSmileImage(original, encryption, jobId, 'photo');
const duplicate = await encryptSmileImage(original, encryption, jobId, 'photo');

assert.equal(ciphertext.type, 'application/octet-stream');
assert.equal(ciphertext.size, original.size + 29);
assert.notDeepEqual(new Uint8Array(await ciphertext.arrayBuffer()), new Uint8Array(await duplicate.arrayBuffer()), 'Each encryption must use a fresh nonce');
const decrypted = await decryptSmileImage(ciphertext, encryption, jobId, 'photo');
assert.deepEqual(new Uint8Array(await decrypted.arrayBuffer()), new Uint8Array(await original.arrayBuffer()));
const serverKey = new Uint8Array(Buffer.from(encryption.key, 'base64'));
const serverPlaintext = await decryptSmileBytes(new Uint8Array(await ciphertext.arrayBuffer()), serverKey, jobId, 'photo');
assert.deepEqual(serverPlaintext, new Uint8Array(await original.arrayBuffer()), 'Server must decrypt the browser upload envelope');
const serverResult = await encryptSmileBytes(new Uint8Array(await original.arrayBuffer()), serverKey, jobId, 'result');
const clientResult = await decryptSmileImage(new Blob([serverResult]), encryption, jobId, 'result');
assert.deepEqual(new Uint8Array(await clientResult.arrayBuffer()), new Uint8Array(await original.arrayBuffer()), 'Browser must decrypt the server result envelope');

await assert.rejects(decryptSmileImage(ciphertext, encryption, jobId, 'mask'), 'Ciphertext must be bound to its image kind');
await assert.rejects(decryptSmileImage(ciphertext, encryption, 'another-job', 'photo'), 'Ciphertext must be bound to its job');
await assert.rejects(decryptSmileImage(ciphertext, { ...encryption, key: Buffer.alloc(32).toString('base64') }, jobId, 'photo'), 'Another key must not decrypt an image');
const tampered = new Uint8Array(await ciphertext.arrayBuffer());
tampered[tampered.length - 1] ^= 1;
await assert.rejects(decryptSmileImage(new Blob([tampered]), encryption, jobId, 'photo'), 'Authentication must reject tampering');
tampered[0] = 2;
await assert.rejects(decryptSmileImage(new Blob([tampered]), encryption, jobId, 'photo'), 'Unknown envelope versions must be rejected');
await assert.rejects(encryptSmileImage(original, { ...encryption, key: 'AA==' }, jobId, 'photo'), 'An invalid key length must be rejected');

console.log('Smile encryption: browser/server compatibility, round trip, nonce uniqueness, job/kind binding, wrong key, tampering and version checks passed.');
