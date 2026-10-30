import { assertEquals, assertRejects, assertNotEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { decryptSmileBytes, deriveSmileKey, encryptSmileBytes, smileEncryption } from './smile-crypto.ts';

const master = btoa(String.fromCharCode(...new Uint8Array(32).fill(42)));
const jobId = '123e4567-e89b-42d3-a456-426614174000';

Deno.test('smile encryption roundtrip; random IV prevents repeated ciphertext', async () => {
  const key = await deriveSmileKey(master, 123, jobId);
  const bytes = new TextEncoder().encode('private photograph bytes');
  const first = await encryptSmileBytes(bytes, key, jobId, 'photo');
  const second = await encryptSmileBytes(bytes, key, jobId, 'photo');
  assertNotEquals(first, second);
  assertEquals(await decryptSmileBytes(first, key, jobId, 'photo'), bytes);
  assertEquals(smileEncryption(key).algorithm, 'AES-GCM');
});

Deno.test('smile keys are isolated by user and job', async () => {
  const first = await deriveSmileKey(master, 123, jobId);
  assertEquals(first, await deriveSmileKey(master, 123, jobId));
  assertNotEquals(first, await deriveSmileKey(master, 124, jobId));
  assertNotEquals(first, await deriveSmileKey(master, 123, '123e4567-e89b-42d3-a456-426614174001'));
});

Deno.test('smile rejects tampering, swapped file kind, wrong job and wrong key', async () => {
  const key = await deriveSmileKey(master, 123, jobId);
  const encrypted = await encryptSmileBytes(new Uint8Array([1, 2, 3]), key, jobId, 'photo');
  await assertRejects(() => decryptSmileBytes(encrypted, key, jobId, 'result'));
  await assertRejects(() => decryptSmileBytes(encrypted, key, 'other-job', 'photo'));
  await assertRejects(async () => decryptSmileBytes(encrypted, await deriveSmileKey(master, 124, jobId), jobId, 'photo'));
  const tampered = encrypted.slice(); tampered[tampered.length - 1] ^= 1;
  await assertRejects(() => decryptSmileBytes(tampered, key, jobId, 'photo'));
  await assertRejects(() => decryptSmileBytes(new Uint8Array([2]), key, jobId, 'photo'));
});

Deno.test('smile refuses missing or weak master key', async () => {
  await assertRejects(() => deriveSmileKey('', 123, jobId));
  await assertRejects(() => deriveSmileKey('not base64', 123, jobId));
  await assertRejects(() => deriveSmileKey(master, 0, jobId));
});
