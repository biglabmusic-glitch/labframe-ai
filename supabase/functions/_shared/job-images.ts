import { db } from './db.ts';
import type { ImageInput } from './image-contracts.ts';
import {
  type ImageProvider,
  type ImageRoute,
  imageRoute,
  imageRoutes,
  ImageTaskError,
  pollImageTask,
  providerFamily,
  providerImageUrl,
  submitImageTask,
} from './image-tasks.ts';
import { boundedInt } from './job-input.ts';

interface Attempt {
  id: string;
  attempt_no: number;
  provider: ImageProvider;
  model: string;
  status: 'starting' | 'pending' | 'succeeded' | 'failed' | 'unknown';
  provider_task_id: string | null;
  result_url: string | null;
}
export type JobImage = { status: 'pending' } | {
  status: 'done';
  imageUrl: string;
  provider: string;
  durationMs: number;
};

async function health(route: ImageRoute, success: boolean, code?: string) {
  const { error } = await db.rpc('record_ai_provider_result', {
    p_provider: providerFamily(route.provider),
    p_success: success,
    p_error_code: code ?? null,
  });
  if (error) console.error('provider health write unavailable', error.code);
}

export async function advanceJobImage(
  jobId: string,
  workerToken: string,
  input: ImageInput,
  testProvider?: string,
): Promise<JobImage> {
  const { data, error } = await db.from('ai_image_attempts').select('*').eq('job_id', jobId).order(
    'attempt_no',
    { ascending: false },
  ).limit(1);
  if (error) throw new Error('storage_unavailable');
  const previous = data?.[0] as Attempt | undefined;
  if (previous?.status === 'succeeded' && previous.result_url) {
    return {
      status: 'done',
      imageUrl: providerImageUrl(previous.result_url),
      provider: `${previous.provider}:${previous.model}`,
      durationMs: 0,
    };
  }
  // Starting without an id means an earlier process died around POST. Never POST it again.
  if (previous && ['starting', 'unknown'].includes(previous.status)) {
    if (previous.status === 'starting') {
      const { error: unknownError } = await db.from('ai_image_attempts').update({
        status: 'unknown',
        error_code: 'submission_unknown',
        updated_at: new Date().toISOString(),
      }).eq('id', previous.id).eq('status', 'starting');
      if (unknownError) throw new Error('storage_unavailable');
      await health(previous, false, 'submission_unknown');
    }
    return { status: 'pending' };
  }

  let attempt = previous;
  let submitting = false;
  if (!attempt || attempt.status === 'failed') {
    if (attempt && attempt.attempt_no >= 2) throw new Error('image_providers_unavailable');
    const forced = testProvider ? imageRoute(testProvider) : null;
    const routes = (testProvider ? forced ? [forced] : [] : imageRoutes()).filter((route) =>
      !attempt || route.provider !== attempt.provider
    );
    const { data: providers, error: healthError } = await db.from('ai_provider_health').select(
      'provider,open_until',
    );
    if (healthError) throw new Error('provider_health_unavailable');
    const blocked = new Set(
      (testProvider ? [] : providers ?? []).filter((row) =>
        row.open_until && new Date(row.open_until).getTime() > Date.now()
      ).map((row) => row.provider),
    );
    const route = routes.find((candidate) => !blocked.has(providerFamily(candidate.provider)));
    if (!route) throw new Error('image_providers_unavailable');
    const { data: created, error: createError } = await db.rpc('begin_image_attempt', {
      p_job_id: jobId,
      p_worker_token: workerToken,
      p_provider: route.provider,
      p_model: route.model,
      p_daily_limit: boundedInt(Deno.env.get('AI_MAX_ATTEMPTS_PER_DAY'), 200, 10000),
    });
    if (createError || !created?.[0]) {
      throw new Error(
        createError?.message === 'provider_daily_limit'
          ? 'provider_daily_limit'
          : 'attempt_unavailable',
      );
    }
    attempt = created[0] as Attempt;
    submitting = true;
  }
  if (!attempt) throw new Error('attempt_unavailable');
  const route: ImageRoute = { provider: attempt.provider, model: attempt.model };
  const t0 = Date.now();
  try {
    const result = submitting
      ? await submitImageTask(route, input)
      : await pollImageTask(route, attempt.provider_task_id!);
    const { error: saveError } = await db.from('ai_image_attempts').update({
      status: result.status === 'done' ? 'succeeded' : 'pending',
      provider_task_id: result.id ?? attempt.provider_task_id,
      result_url: result.status === 'done' ? result.url : null,
      error_code: null,
      updated_at: new Date().toISOString(),
    }).eq('id', attempt.id);
    if (saveError) throw new Error('attempt_save_unavailable');
    await health(route, true);
    return result.status === 'pending' ? { status: 'pending' } : {
      status: 'done',
      imageUrl: result.url,
      provider: `${route.provider}:${route.model}`,
      durationMs: Date.now() - t0,
    };
  } catch (error) {
    if (!(error instanceof ImageTaskError)) throw error;
    await health(route, false, error.code);
    // Once an id exists, transient failures only defer polling that very task.
    if (!submitting && !error.definitive) return { status: 'pending' };
    const unknown = submitting && !error.definitive;
    const { error: updateError } = await db.from('ai_image_attempts').update({
      status: unknown ? 'unknown' : 'failed',
      error_code: error.code,
      updated_at: new Date().toISOString(),
    }).eq('id', attempt.id);
    if (updateError) throw new Error('attempt_save_unavailable');
    if (unknown) return { status: 'pending' };
    if (error.canFallback && attempt.attempt_no < 2) return { status: 'pending' };
    throw new Error(error.code);
  }
}
