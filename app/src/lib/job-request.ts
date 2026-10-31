interface PendingJob {
  key: string;
  fingerprint: string;
  at: number;
}
const pending = new Map<number, PendingJob>();
export function newRequestKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const h = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export function pendingRequestKey(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  owner: number,
  input: unknown,
): string {
  const slot = `labframe.pendingJob:${owner}`;
  const fingerprint = JSON.stringify(input);
  try {
    const old = JSON.parse(storage.getItem(slot) ?? 'null') as PendingJob | null;
    if (
      old && old.fingerprint === fingerprint &&
      /^[0-9a-f-]{36}$/i.test(old.key)
    ) {
      pending.set(owner, old);
      return old.key;
    }
  } catch { /* blocked storage or corrupt entry: database still deduplicates network retries */ }
  const remembered = pending.get(owner);
  if (remembered?.fingerprint === fingerprint) return remembered.key;
  const key = newRequestKey();
  pending.set(owner, { key, fingerprint, at: Date.now() });
  try {
    storage.setItem(slot, JSON.stringify({ key, fingerprint, at: Date.now() }));
  } catch { /* memory-only session */ }
  return key;
}
export function clearPendingRequest(storage: Pick<Storage, 'removeItem'>, owner: number) {
  pending.delete(owner);
  try {
    storage.removeItem(`labframe.pendingJob:${owner}`);
  } catch { /* storage blocked */ }
}
