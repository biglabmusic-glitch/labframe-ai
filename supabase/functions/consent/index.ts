// POST /consent — пользователь принял политику обработки персональных данных.
//
// Отдельная функция, а не поле в /me: согласие — юридически значимое действие,
// и оно должно происходить явным запросом, а не побочным эффектом загрузки
// профиля. По той же причине дату ставит сервер, а не присылает клиент.
//
// Повторный вызов дату НЕ обновляет: важен момент, когда согласие было дано
// впервые для этой версии политики. Иначе при каждом заходе она уезжала бы
// вперёд и перестала бы что-либо подтверждать.
import { authorize, corsPreflight, jsonResponse } from '../_shared/auth.ts';
import { db } from '../_shared/db.ts';

interface Body {
  version?: number;
}

export const CURRENT_CONSENT_VERSION = 1;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight();
  if (req.method !== 'POST') return jsonResponse({ error: 'method' }, { status: 405 });

  const auth = await authorize(req);
  if ('response' in auth) return auth.response;
  const tg = auth.user;

  let body: Body = {};
  try { body = await req.json(); } catch { /* пустое тело — берём текущую версию */ }
  const version = Number.isInteger(body.version) ? body.version! : CURRENT_CONSENT_VERSION;

  const { data: existing } = await db
    .from('users').select('consent_at, consent_version').eq('id', tg.id).maybeSingle();

  // Уже соглашался с этой же версией — ничего не трогаем, отдаём исходную дату.
  if (existing?.consent_at && existing.consent_version === version) {
    return jsonResponse({ ok: true, consentAt: existing.consent_at, version });
  }

  const consentAt = new Date().toISOString();
  const { error } = await db.from('users')
    .update({ consent_at: consentAt, consent_version: version })
    .eq('id', tg.id);

  if (error) {
    console.error('не смогли записать согласие:', error.message);
    return jsonResponse({ error: 'save_failed' }, { status: 500 });
  }

  console.log(`согласие принято: юзер ${tg.id}, версия ${version}`);
  return jsonResponse({ ok: true, consentAt, version });
});
