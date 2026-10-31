import { ImageTaskError, pollImageTask, submitImageTask } from './image-tasks.ts';
import {
  buildSmilePrompt,
  readSmileBytes,
  SMILE_MAX_BYTES,
  SmileError,
  type SmileProviderTask,
  type SmileSettings,
} from './smile-preview.ts';

export function smileProviderName(): 'polza' | 'fal' {
  return Deno.env.get('SMILE_PROVIDER') === 'fal' ? 'fal' : 'polza';
}
export function smileProviderConfig() {
  const name = Deno.env.get('SMILE_PROVIDER') ?? 'polza';
  if (!['polza', 'fal'].includes(name)) throw new SmileError('not_configured', 503);
  if (name === 'fal') {
    if (Deno.env.get('SMILE_EXTERNAL_PROVIDER_APPROVED') !== 'fal' || !Deno.env.get('FAL_KEY')) {
      throw new SmileError('not_configured', 503);
    }
    return { providerName: 'fal' as const, providerModel: 'fal-ai/nano-banana/edit' };
  }
  if (!Deno.env.get('POLZA_API_KEY')) throw new SmileError('not_configured', 503);
  return {
    providerName: 'polza' as const,
    providerModel: Deno.env.get('POLZA_SMILE_MODEL') || Deno.env.get('POLZA_IMAGE_MODEL') ||
      'google/gemini-3.1-flash-image-preview',
  };
}
async function translate(
  task: ReturnType<typeof submitImageTask>,
  signal: AbortSignal,
): Promise<SmileProviderTask> {
  try {
    const value = await task;
    if (value.status === 'pending') return { status: 'processing', id: value.id };
    const url = new URL(value.url);
    if (url.hostname !== 'fal.media' && !url.hostname.endsWith('.fal.media')) {
      throw new SmileError('provider_response', 502);
    }
    const response = await fetch(value.url, { signal, redirect: 'error' });
    if (!response.ok) throw new SmileError('provider_unavailable', 503);
    return {
      status: 'done',
      image: await readSmileBytes(response, SMILE_MAX_BYTES, signal),
      ...(value.id ? { id: value.id } : {}),
    };
  } catch (error) {
    if (error instanceof SmileError) throw error;
    if (error instanceof ImageTaskError && error.code === 'provider_failed') {
      throw new SmileError('provider_failed', 502);
    }
    throw new SmileError(signal.aborted ? 'timeout' : 'provider_unavailable', 503);
  }
}
export async function createFalSmileTask(
  options: { photoData: string; maskData: string; settings: SmileSettings; signal: AbortSignal },
): Promise<SmileProviderTask> {
  options.signal.throwIfAborted();
  if (Deno.env.get('SMILE_EXTERNAL_PROVIDER_APPROVED') !== 'fal') {
    throw new SmileError('not_configured', 503);
  }
  if (
    ![options.photoData, options.maskData].every((x) =>
      /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(x)
    )
  ) throw new SmileError('provider_response', 502);
  return translate(
    submitImageTask({ provider: 'fal', model: 'fal-ai/nano-banana/edit' }, {
      photoUrl: options.photoData,
      referenceImages: [options.maskData],
      prompt: buildSmilePrompt(options.settings),
      style: 'clean',
      format: '1x1',
      aspectRatio: '16:9',
    }),
    options.signal,
  );
}
export async function pollFalSmileTask(
  id: string,
  signal: AbortSignal,
): Promise<SmileProviderTask> {
  return translate(
    pollImageTask({ provider: 'fal', model: 'fal-ai/nano-banana/edit' }, id),
    signal,
  );
}
