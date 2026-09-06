// POST /payment-link — ссылка на оплату пакета для ТЕКУЩЕГО юзера.
// GET  /payment-link — серверный прайс: [{ id, credits, priceRub }].
//
// Раньше ссылку умел выдавать только админ (action payment-link в /admin) и слал
// её покупателю руками. Здесь тот же сборщик, но вход по Telegram initData —
// покупка проходит без участия владельца.
//
// Денег функция не трогает: она собирает URL и всё. Начисление делает
// payment-webhook после уведомления Продамуса, сверяя сумму с серверным
// прайсом. Поэтому выпросить лишние кредиты, дёргая этот эндпоинт, нельзя:
// максимум получишь ссылку на честную оплату.
import { authorize, corsPreflight, jsonResponse } from '../_shared/auth.ts';
import { db } from '../_shared/db.ts';
import { PACKAGES } from '../_shared/packages.ts';
import { PaymentLinkError, buildPaymentLink } from '../_shared/payment-link.ts';

interface Body {
  packageId?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight();

  // Прайс отдаём с сервера, чтобы у фронта не было своей копии цен.
  if (req.method === 'GET') return jsonResponse({ packages: PACKAGES });

  if (req.method !== 'POST') return jsonResponse({ error: 'method' }, { status: 405 });

  const auth = await authorize(req);
  if ('response' in auth) return auth.response;
  const tg = auth.user;

  // Как в create-job: гарантируем строку в users. Когда придёт уведомление об
  // оплате, начислять уже точно будет кому — даже если юзер не заходил в /me.
  await db.from('users').upsert(
    {
      id: tg.id,
      username:      tg.username      ?? null,
      first_name:    tg.first_name    ?? null,
      last_name:     tg.last_name     ?? null,
      photo_url:     tg.photo_url     ?? null,
      language_code: tg.language_code ?? 'ru',
      last_seen_at:  new Date().toISOString(),
    },
    { onConflict: 'id', ignoreDuplicates: false },
  );

  // Забаненному ссылку не выдаём: иначе он оплатит, вебхук честно начислит
  // кредиты, а тратить их он не сможет — и придётся возвращать деньги.
  const { data: userRow } = await db
    .from('users').select('banned').eq('id', tg.id).maybeSingle();
  if (userRow?.banned) return jsonResponse({ error: 'banned' }, { status: 403 });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'bad_body' }, { status: 400 });
  }

  try {
    const link = buildPaymentLink(tg.id, body.packageId ?? '', `@${tg.username ?? tg.id}`);
    console.log(`ссылка на оплату: юзер ${tg.id}, ${link.orderId}, ${link.priceRub}₽`);
    return jsonResponse({ ok: true, ...link });
  } catch (e) {
    if (e instanceof PaymentLinkError) {
      if (e.code === 'not_configured') {
        console.error('PRODAMUS_FORM_URL не задан — выдать ссылку нечем');
      }
      return jsonResponse({ error: e.code, ...e.extra }, { status: e.status });
    }
    throw e;
  }
});
