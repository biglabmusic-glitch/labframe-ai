// POST /apply-referral
// Body: { code?: string, startParam?: string }
// Ставит привязку текущего юзера к пригласившему. Все анти-абьюз правила в applyReferral().
import { authorize, corsPreflight, jsonResponse } from '../_shared/auth.ts';
import { applyReferral, parseStartParam, normalizeCode } from '../_shared/referral.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight();
  if (req.method !== 'POST') return jsonResponse({ error: 'method' }, { status: 405 });

  const auth = await authorize(req);
  if ('response' in auth) return auth.response;
  const tg = auth.user;

  let body: { code?: string; startParam?: string };
  try { body = await req.json(); }
  catch { return jsonResponse({ error: 'bad_json' }, { status: 400 }); }

  // Код берём из ручного ввода (code) или из start_param ('ref_<CODE>').
  const code = body.code ? normalizeCode(body.code) : parseStartParam(body.startParam);

  const result = await applyReferral(tg.id, code);
  return jsonResponse(result);
});
