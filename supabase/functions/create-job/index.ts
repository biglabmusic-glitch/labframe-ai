// POST /create-job
// Принимает: { photoPath, workType?, style, format, branding, textType }
// photoPath — путь в bucket 'photos' (фронт загружает фото через подписанный URL).
// Возвращает: { id, status: 'created' }
// Дальше воркер process-job (cron / pg_net) подхватывает job в статусе 'created'.
import { corsPreflight, jsonResponse, verifyInitData } from '../_shared/auth.ts';
import { db } from '../_shared/db.ts';

interface Body {
  photoPath: string;
  workType?: 'crown' | 'veneer' | 'bridge' | 'other';
  style: 'clean' | 'dark' | 'soft';
  format: '4x5' | '1x1' | '9x16';
  branding: 'logo' | 'name' | 'none';
  textType: 'short' | 'sell' | 'tech' | 'none';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight();
  if (req.method !== 'POST') return jsonResponse({ error: 'method' }, { status: 405 });

  const initData = req.headers.get('x-telegram-initdata') ?? '';
  const tg = await verifyInitData(initData);
  if (!tg) return jsonResponse({ error: 'unauthorized' }, { status: 401 });

  let body: Body;
  try { body = await req.json(); }
  catch { return jsonResponse({ error: 'bad_json' }, { status: 400 }); }

  if (!body.photoPath || !body.style || !body.format) {
    return jsonResponse({ error: 'missing_fields' }, { status: 400 });
  }

  const { data: job, error } = await db
    .from('jobs')
    .insert({
      user_id: tg.id,
      photo_path: body.photoPath,
      work_type: body.workType ?? null,
      style: body.style,
      format: body.format,
      branding: body.branding ?? 'none',
      text_type: body.textType ?? 'short',
      status: 'created',
    })
    .select('id, status')
    .single();

  if (error) {
    if (error.message.includes('usage_limit_reached')) {
      return jsonResponse({ error: 'usage_limit_reached' }, { status: 402 });
    }
    return jsonResponse({ error: error.message }, { status: 500 });
  }

  return jsonResponse({ id: job.id, status: job.status });
});
