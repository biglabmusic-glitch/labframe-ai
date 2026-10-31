export class BodyError extends Error {
  constructor(public code: string, public status = 400) {
    super(code);
  }
}

/** Limit the stream itself: Content-Length is optional and cannot be trusted. */
export async function readBodyBytes(
  req: Pick<Request, 'headers' | 'body'>,
  maxBytes: number,
  timeoutMs = 10_000,
): Promise<Uint8Array> {
  const declared = req.headers.get('content-length');
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    throw new BodyError('body_too_large', 413);
  }
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new BodyError('body_timeout', 408));
      void reader.cancel().catch(() => {});
    }, timeoutMs);
  });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), expired]);
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new BodyError('body_too_large', 413);
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
    try {
      reader.releaseLock();
    } catch { /* pending read is cancelled above */ }
  }
}

export async function readTextBody(
  req: Pick<Request, 'headers' | 'body'>,
  maxBytes: number,
  timeoutMs = 10_000,
): Promise<string> {
  const bytes = await readBodyBytes(req, maxBytes, timeoutMs);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new BodyError('bad_encoding');
  }
}

export async function readJsonBody<T>(req: Request, maxBytes = 16 * 1024): Promise<T> {
  const text = await readTextBody(req, maxBytes);
  try {
    const value = JSON.parse(text);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value as T;
  } catch {
    throw new BodyError('bad_json');
  }
}
