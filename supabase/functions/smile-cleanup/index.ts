// Hourly, internal-only cleanup. Never logs paths, photographs or secrets.
import { db } from '../_shared/db.ts';

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply({ error: 'method' }, 405);
  const expected = Deno.env.get('INTERNAL_SECRET');
  if (!expected || req.headers.get('x-internal-secret') !== expected) return reply({ error: 'forbidden' }, 403);
  let deleted = 0;
  for (let page = 0; page < 4; page++) {
    const { data, error } = await db.rpc('smile_expired_objects', { p_limit: 500 });
    if (error || !Array.isArray(data)) return reply({ error: 'cleanup_unavailable' }, 503);
    const paths = data.map((row: { name: string }) => row.name);
    // Defense in depth: even an unexpected RPC result cannot delete normal photos.
    if (paths.some((path: unknown) => typeof path !== 'string' ||
      !/^\d+\/smile-pilot\/[0-9a-f-]{36}\/(source\.enc|mask\.enc|result\.enc|manifest\.json|running\.json)$/.test(path))) {
      return reply({ error: 'cleanup_unavailable' }, 503);
    }
    if (!paths.length) return reply({ deleted });
    const result = await db.storage.from('photos').remove(paths);
    if (result.error) return reply({ error: 'cleanup_unavailable' }, 503);
    deleted += paths.length;
    if (paths.length < 500) break;
  }
  return reply({ deleted });
});
