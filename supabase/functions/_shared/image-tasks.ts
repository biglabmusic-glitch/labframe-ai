import { readTextBody } from './http-body.ts';
import type { ImageInput } from './image-contracts.ts';

export type ImageProvider = 'polza' | 'replicate-flux' | 'replicate-nano' | 'fal';
export interface ImageRoute {
  provider: ImageProvider;
  model: string;
}
export type ImageTask = { status: 'pending'; id: string } | {
  status: 'done';
  id?: string;
  url: string;
};
export class ImageTaskError extends Error {
  constructor(public code: string, public definitive: boolean, public canFallback = false) {
    super(code);
  }
}
export const providerFamily = (provider: ImageProvider): 'polza' | 'replicate' | 'fal' =>
  provider.startsWith('replicate') ? 'replicate' : provider as 'polza' | 'fal';
const TASK_ID = /^[a-zA-Z0-9_-]{1,128}$/;

export function imageRoute(name: string): ImageRoute | null {
  if (name === 'polza' && Deno.env.get('POLZA_API_KEY')) {
    return {
      provider: 'polza',
      model: Deno.env.get('POLZA_IMAGE_MODEL') ?? 'google/gemini-3.1-flash-image-preview',
    };
  }
  if (
    ['flux-kontext', 'replicate-flux', 'nano-banana', 'replicate-nano'].includes(name) &&
    Deno.env.get('REPLICATE_API_TOKEN')
  ) {
    const nano = name === 'nano-banana' || name === 'replicate-nano';
    return {
      provider: nano ? 'replicate-nano' : 'replicate-flux',
      model: nano ? 'google/nano-banana' : 'black-forest-labs/flux-kontext-pro',
    };
  }
  if (name === 'fal' && Deno.env.get('FAL_KEY')) {
    const model = Deno.env.get('FAL_IMAGE_MODEL') ?? 'fal-ai/flux-pro/kontext';
    if (!['fal-ai/flux-pro/kontext', 'fal-ai/nano-banana/edit'].includes(model)) {
      throw new ImageTaskError('provider_config', true);
    }
    return { provider: 'fal', model };
  }
  return null;
}

export function imageRoutes(): ImageRoute[] {
  const selected = Deno.env.get('IMAGE_PROVIDER') ?? 'auto';
  const primaryName = selected === 'auto'
    ? Deno.env.get('REPLICATE_API_TOKEN') ? 'flux-kontext' : 'polza'
    : selected;
  const backupName = Deno.env.get('IMAGE_BACKUP_PROVIDER') ??
    (primaryName === 'polza' ? 'flux-kontext' : 'polza');
  return [imageRoute(primaryName), backupName === 'none' ? null : imageRoute(backupName)]
    .filter((route, index, all): route is ImageRoute =>
      route !== null && all.findIndex((x) => x?.provider === route.provider) === index
    );
}

function apiBase(route: ImageRoute): string {
  if (route.provider === 'polza') {
    const base = new URL(Deno.env.get('POLZA_MEDIA_BASE_URL') ?? 'https://polza.ai/api/v1');
    if (
      base.protocol !== 'https:' || !['polza.ai', 'api.polza.ai'].includes(base.hostname) ||
      base.username || base.password || base.port || base.search || base.hash
    ) {
      throw new ImageTaskError('provider_config', true);
    }
    return base.href.replace(/\/$/, '');
  }
  return route.provider === 'fal' ? 'https://queue.fal.run' : 'https://api.replicate.com/v1';
}

export function providerImageUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 8192) {
    throw new ImageTaskError('provider_response', false);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ImageTaskError('provider_response', false);
  }
  const allowed = ['polza.ai', 'replicate.delivery', 'fal.media'];
  if (
    url.protocol !== 'https:' || url.username || url.password || url.port ||
    !allowed.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))
  ) {
    throw new ImageTaskError('provider_response', false);
  }
  return url.href;
}

async function providerJson(
  route: ImageRoute,
  url: string,
  body?: unknown,
  fetcher: typeof fetch = fetch,
): Promise<Record<string, unknown>> {
  const family = providerFamily(route.provider);
  const key = Deno.env.get(
    family === 'polza' ? 'POLZA_API_KEY' : family === 'fal' ? 'FAL_KEY' : 'REPLICATE_API_TOKEN',
  );
  if (!key) throw new ImageTaskError('provider_not_configured', true, true);
  let response: Response;
  try {
    response = await fetcher(url, {
      method: body === undefined ? 'GET' : 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(25_000),
      headers: {
        Authorization: `${family === 'fal' ? 'Key' : 'Bearer'} ${key}`,
        'Content-Type': 'application/json',
        ...(family === 'fal'
          ? {
            'X-Fal-Store-IO': '0',
            'X-Fal-Object-Lifecycle-Preference': '{"expiration_duration_seconds":3600}',
          }
          : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ImageTaskError('provider_unavailable', false);
  }
  if (!response.ok) {
    void response.body?.cancel().catch(() => {});
    const account = [401, 402, 403].includes(response.status);
    const rejected = response.status >= 400 && response.status < 500;
    throw new ImageTaskError(
      account
        ? `account_${response.status}`
        : response.status === 429
        ? 'provider_rate_limit'
        : `provider_http_${response.status}`,
      rejected,
      account || response.status === 429,
    );
  }
  try {
    const value = JSON.parse(await readTextBody(response, 256 * 1024, 10_000));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new ImageTaskError('provider_response', false);
  }
}

function task(route: ImageRoute, data: Record<string, unknown>): ImageTask {
  const id = data.id;
  if (data.error || ['failed', 'canceled'].includes(String(data.status))) {
    throw new ImageTaskError('provider_failed', true, true);
  }
  let output: unknown;
  if (route.provider === 'polza') {
    const nested = data.data;
    output = Array.isArray(nested)
      ? (nested[0] as { url?: string } | undefined)?.url
      : nested && typeof nested === 'object'
      ? (nested as { url?: string }).url
      : undefined;
    output ??= Array.isArray(data.output) ? data.output[0] : data.output;
  } else output = Array.isArray(data.output) ? data.output[0] : data.output;
  if (output) {
    return {
      status: 'done',
      url: providerImageUrl(output),
      ...(typeof id === 'string' && TASK_ID.test(id) ? { id } : {}),
    };
  }
  if (
    typeof id === 'string' && TASK_ID.test(id) &&
    ['pending', 'starting', 'processing'].includes(String(data.status))
  ) return { status: 'pending', id };
  throw new ImageTaskError('provider_response', false);
}

export async function submitImageTask(
  route: ImageRoute,
  input: ImageInput,
  fetcher?: typeof fetch,
): Promise<ImageTask> {
  const base = apiBase(route);
  const aspect = input.aspectRatio ?? { '4x5': '4:5', '1x1': '1:1', '9x16': '9:16' }[input.format];
  if (route.provider === 'polza') {
    return task(
      route,
      await providerJson(route, `${base}/media`, {
        model: route.model,
        async: true,
        input: {
          prompt: input.prompt,
          aspect_ratio: aspect,
          max_images: 1,
          images: [input.photoUrl, ...input.referenceImages ?? []].map((data) => ({
            type: data.startsWith('data:') ? 'base64' : 'url',
            data,
          })),
          output_format: 'png',
        },
      }, fetcher),
    );
  }
  if (route.provider === 'fal') {
    const data = await providerJson(route, `${base}/${route.model}`, {
      prompt: input.prompt,
      aspect_ratio: aspect,
      num_images: 1,
      output_format: 'png',
      ...(route.model.includes('flux-pro')
        ? { image_url: input.photoUrl }
        : { image_urls: [input.photoUrl, ...input.referenceImages ?? []] }),
    }, fetcher);
    if (typeof data.request_id !== 'string' || !TASK_ID.test(data.request_id)) {
      throw new ImageTaskError('provider_response', false);
    }
    return { status: 'pending', id: data.request_id };
  }
  return task(
    route,
    await providerJson(route, `${base}/models/${route.model}/predictions`, {
      input: route.provider === 'replicate-nano'
        ? { prompt: input.prompt, image_input: [input.photoUrl], output_format: 'jpg' }
        : {
          prompt: input.prompt,
          input_image: input.photoUrl,
          aspect_ratio: aspect,
          output_format: 'jpg',
          safety_tolerance: 2,
          prompt_upsampling: false,
        },
    }, fetcher),
  );
}

export async function pollImageTask(
  route: ImageRoute,
  id: string,
  fetcher?: typeof fetch,
): Promise<ImageTask> {
  if (!TASK_ID.test(id)) throw new ImageTaskError('provider_response', false);
  const base = apiBase(route);
  if (route.provider === 'fal') {
    const endpoint = `${base}/${route.model.split('/').slice(0, 2).join('/')}/requests/${id}`;
    const data = await providerJson(route, `${endpoint}/status`, undefined, fetcher);
    if (data.error) throw new ImageTaskError('provider_failed', true, true);
    if (['IN_QUEUE', 'IN_PROGRESS'].includes(String(data.status))) return { status: 'pending', id };
    if (data.status !== 'COMPLETED') throw new ImageTaskError('provider_response', false);
    const result = await providerJson(route, endpoint, undefined, fetcher);
    const images = result.images as { url?: unknown }[] | undefined;
    if (result.error) throw new ImageTaskError('provider_failed', true, true);
    return { status: 'done', id, url: providerImageUrl(images?.[0]?.url) };
  }
  return task(
    route,
    await providerJson(
      route,
      route.provider === 'polza' ? `${base}/media/${id}` : `${base}/predictions/${id}`,
      undefined,
      fetcher,
    ),
  );
}
