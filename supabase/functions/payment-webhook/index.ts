// POST /payment-webhook — уведомление Продамуса об оплате.
//
// Вызывается НЕ пользователем, а Продамусом, поэтому здесь нет Telegram initData.
// Единственная защита — подпись в заголовке Sign на секрете PRODAMUS_SECRET.
//
// Продамус повторяет уведомление, пока не получит 200. Отсюда два правила:
//   • начисление идемпотентно по order_id (SQL-функция apply_payment);
//   • на уже обработанный или неинтересный нам платёж отвечаем 200, иначе
//     Продамус будет долбить вечно.
// 4xx отдаём только там, где повтор бессмысленен (нет подписи, битое тело).
import { jsonResponse } from '../_shared/auth.ts';
import { db } from '../_shared/db.ts';
import { amountMatches, parseOrderId } from '../_shared/packages.ts';
import { parsePhpFormBody, verifySignature, type PhpValue } from '../_shared/prodamus.ts';
import { grantReferralReward } from '../_shared/referral.ts';
import { sendMessage } from '../_shared/telegram.ts';

// Где искать НАШ номер заказа.
//
// Продамус кладёт в order_id собственный UUID, а переданное нами значение
// возвращает под другим именем. Перебираем известных кандидатов и берём первое
// поле, которое разбирается в формат lf-<tgId>-<пакет>-<nonce>. Порядок значения
// не имеет: чужой UUID под наш формат всё равно не подойдёт.
const ORDER_FIELDS = ['order_num', 'order_id', 'orderNum', 'order_number', 'ORDER_ID'];

function findOrder(data: Record<string, PhpValue>) {
  for (const field of ORDER_FIELDS) {
    const value = data[field];
    if (typeof value !== 'string') continue;
    const parsed = parseOrderId(value);
    if (parsed) return parsed;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method' }, { status: 405 });

  const secret = Deno.env.get('PRODAMUS_SECRET') ?? '';
  if (!secret) {
    // Секрет не задан — принять платёж мы не можем, но и подтверждать нельзя:
    // 500 заставит Продамус повторить, когда секрет появится.
    console.error('PRODAMUS_SECRET не задан — уведомление не обработано');
    return jsonResponse({ error: 'not_configured' }, { status: 500 });
  }

  const body = await req.text();
  let data: Record<string, PhpValue>;
  try {
    data = parsePhpFormBody(body);
  } catch (e) {
    console.error('битое тело уведомления:', e instanceof Error ? e.message : e);
    return jsonResponse({ error: 'bad_body' }, { status: 400 });
  }

  const ok = await verifySignature(data, req.headers.get('Sign'), secret);
  if (!ok) {
    console.error('подпись не сошлась, order_id=', String(data.order_id ?? '—'));
    return jsonResponse({ error: 'bad_signature' }, { status: 403 });
  }

  // Дальше данные доверенные: подпись покрывает всё тело целиком.
  const status  = String(data.payment_status ?? '');
  const orderId = String(data.order_id ?? '');
  const sum     = String(data.sum ?? '');

  // Продамус шлёт уведомления и о неуспешных попытках. Это не ошибка — просто
  // не наш случай, подтверждаем и выходим.
  if (status !== 'success') {
    console.log(`платёж не success (${status}), order_id=${orderId}`);
    return jsonResponse({ ok: true, ignored: status });
  }

  const order = findOrder(data);
  if (!order) {
    // Чужой или ручной платёж мимо наших ссылок. Повтор не поможет — отвечаем 200,
    // но громко логируем: деньги пришли, а кому начислять, неизвестно.
    //
    // Печатаем ИМЕНА полей, но не значения: в уведомлении лежат почта и имя
    // покупателя, и складывать их в логи ради диагностики не нужно. Если
    // Продамус снова переименует поле с номером заказа, список имён покажет,
    // куда смотреть, — этого достаточно.
    console.error(`НЕ РАЗОБРАН order_id=${orderId}, сумма=${sum} — начисление вручную`);
    console.error('поля уведомления:', Object.keys(data).join(', '));
    return jsonResponse({ ok: true, ignored: 'unparsable_order_id' });
  }

  // Цена приходит в ссылке параметром, покупатель может подправить её в адресной
  // строке до оплаты — Продамус честно подпишет заниженную сумму. Поэтому сверяем
  // с серверным прайсом и при расхождении НЕ начисляем.
  if (!amountMatches(order.pkg, sum)) {
    console.error(
      `сумма не совпала: order_id=${orderId}, пришло ${sum}, ждали ${order.pkg.priceRub}`,
    );
    return jsonResponse({ ok: true, ignored: 'amount_mismatch' });
  }

  const { data: credited, error } = await db.rpc('apply_payment', {
    p_order_id:   orderId,
    p_user_id:    order.tgId,
    p_package_id: order.pkg.id,
    p_credits:    order.pkg.credits,
    p_amount:     order.pkg.priceRub,
    p_raw:        data,
  });

  if (error) {
    // Начисления не было — просим повторить.
    console.error('apply_payment упал:', error.message);
    return jsonResponse({ error: 'apply_failed' }, { status: 500 });
  }

  if (!credited) {
    console.log(`повторное уведомление, уже начисляли: ${orderId}`);
    return jsonResponse({ ok: true, duplicate: true });
  }

  console.log(`начислено ${order.pkg.credits} генераций юзеру ${order.tgId} (${orderId})`);

  // Говорим покупателю, что деньги дошли. Только здесь, после credited === true:
  // на повторное уведомление Продамуса поздравлять второй раз не нужно.
  //
  // Баланс перечитываем из БД, а не считаем сами: между начислением и этим
  // моментом человек мог потратить генерацию, и цифра из головы разошлась бы
  // с той, что он видит в приложении.
  //
  // Сбой отправки не роняет вебхук: деньги уже начислены, повтор уведомления
  // баланс не удвоит (apply_payment идемпотентен), но и сообщение не починит.
  try {
    const { data: u } = await db
      .from('users').select('credits').eq('id', order.tgId).maybeSingle();
    const balance = u?.credits;

    await sendMessage(
      order.tgId,
      'Оплата прошла, спасибо!\n\n' +
      `Зачислено ${order.pkg.credits} генераций.` +
      (typeof balance === 'number' ? ` Теперь на балансе ${balance}.` : '') +
      '\n\nГенерации не сгорают — тратьте когда удобно.',
    );
  } catch (e) {
    console.error('не смогли сообщить об оплате:', e instanceof Error ? e.message : e);
  }

  // Реферальная награда — за первую оплату приглашённого. Внутри idempotent:
  // переводит связку joined → paid только один раз.
  // Сбой награды не должен приводить к повтору всего уведомления: баланс уже начислен,
  // а повтор его не удвоит, но и награду не починит — поэтому просто логируем.
  try {
    await grantReferralReward(order.tgId);
  } catch (e) {
    console.error('grantReferralReward упал:', e instanceof Error ? e.message : e);
  }

  return jsonResponse({ ok: true, credited: order.pkg.credits });
});
