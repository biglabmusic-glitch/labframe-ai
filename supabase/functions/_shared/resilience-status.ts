import { db } from './db.ts';
import { imageRoutes } from './image-tasks.ts';
import { boundedInt } from './job-input.ts';
export async function resilienceStatus() {
  try {
    const routes = imageRoutes();
    const [health, attempts, unknown, queue, backup] = await Promise.all([
      db.from('ai_provider_health').select('*'),
      db.from('ai_image_attempts').select('id', { count: 'exact', head: true }).gte(
        'created_at',
        new Date(Date.now() - 86400_000).toISOString(),
      ),
      db.from('ai_image_attempts').select('id', { count: 'exact', head: true }).in('status', [
        'starting',
        'unknown',
      ]),
      db.from('jobs').select('id', { count: 'exact', head: true }).in('status', [
        'created',
        'processing',
      ]),
      db.from('backup_runs').select(
        'snapshot_at,completed_at,data_verified,storage_verified,storage_included,portable_recovery',
      )
        .order('completed_at', { ascending: false }).limit(1),
    ]);
    if ([health, attempts, unknown, queue, backup].some((r) => r.error)) throw new Error();
    return {
      available: true,
      attempts24h: attempts.count ?? 0,
      limit24h: boundedInt(Deno.env.get('AI_MAX_ATTEMPTS_PER_DAY'), 200, 10000),
      unknownAttempts: unknown.count ?? 0,
      queuedJobs: queue.count ?? 0,
      providers: [
        { name: 'Polza', id: 'polza', configured: Boolean(Deno.env.get('POLZA_API_KEY')) },
        {
          name: 'Replicate',
          id: 'replicate',
          configured: Boolean(Deno.env.get('REPLICATE_API_TOKEN')),
        },
        { name: 'fal.ai', id: 'fal', configured: Boolean(Deno.env.get('FAL_KEY')) },
      ].map((p) => {
        const status = health.data?.find((h) => h.provider === p.id);
        return {
          ...p,
          enabled: routes.some((r) => r.provider.startsWith(p.id)),
          openUntil: status?.open_until ?? null,
          lastSuccessAt: status?.last_success_at ?? null,
          lastError: status?.last_error_code ?? null,
        };
      }),
      backup: backup.data?.[0] ?? null,
    };
  } catch {
    return { available: false };
  }
}
