import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  canonicalJson,
  parsePhpFormBody,
  signPayload,
  verifySignature,
} from './prodamus.ts';

// Реальное по форме уведомление Продамуса: PHP-скобки, кириллица, плюс как пробел,
// процентное кодирование в дате.
const BODY =
  'date=2026-08-24T15%3A00%3A00%2B03%3A00&order_id=lf-888181907-p50-a1b2' +
  '&sum=1500.00&payment_status=success&customer_extra=%D0%9F%D0%B0%D0%BA%D0%B5%D1%82+50' +
  '&products%5B0%5D%5Bname%5D=50+%D0%B3%D0%B5%D0%BD%D0%B5%D1%80%D0%B0%D1%86%D0%B8%D0%B9' +
  '&products%5B0%5D%5Bprice%5D=1500&products%5B0%5D%5Bquantity%5D=1';

const SECRET = 'test_secret_key_123';

// Подпись посчитана НЕЗАВИСИМОЙ реализацией (python-prodamus, dnagikh) на этих же
// данных. Если наш код даст другое значение — расходимся с продакшеном Продамуса,
// и вебхук будет отбивать настоящие оплаты.
const REFERENCE_SIGN = '8401650a30f479440c44ce89d3851c1bd0050fac838e75d1e919cb337d54655e';

Deno.test('parsePhpFormBody: разворачивает PHP-скобки в массив объектов', () => {
  const d = parsePhpFormBody(BODY);
  assertEquals(d.order_id, 'lf-888181907-p50-a1b2');
  assertEquals(d.payment_status, 'success');
  assertEquals(d.customer_extra, 'Пакет 50');          // «+» это пробел
  assertEquals(d.date, '2026-08-24T15:00:00+03:00');    // а тут «+» закодирован
  assertEquals(d.products, [{ name: '50 генераций', price: '1500', quantity: '1' }]);
});

Deno.test('canonicalJson: ключи отсортированы рекурсивно, компактно, без экранирования', () => {
  const json = canonicalJson(parsePhpFormBody(BODY));
  assertEquals(json.startsWith('{"customer_extra":"Пакет 50","date":'), true);
  assertEquals(json.includes(': '), false);            // компактные разделители
  const BS = String.fromCharCode(92);                 // обратный слэш
  assertEquals(json.includes(BS + 'u'), false);       // кириллица как есть, не escape
  assertEquals(json.includes(BS + '/'), false);       // слэши не экранируются
});

Deno.test('signPayload: совпадает с эталонной реализацией', async () => {
  const sign = await signPayload(parsePhpFormBody(BODY), SECRET);
  assertEquals(sign, REFERENCE_SIGN);
});

Deno.test('verifySignature: принимает верную подпись в любом регистре', async () => {
  const data = parsePhpFormBody(BODY);
  assertEquals(await verifySignature(data, REFERENCE_SIGN, SECRET), true);
  assertEquals(await verifySignature(data, REFERENCE_SIGN.toUpperCase(), SECRET), true);
});

Deno.test('verifySignature: отвергает чужую подпись, чужой ключ и подмену суммы', async () => {
  const data = parsePhpFormBody(BODY);
  assertEquals(await verifySignature(data, 'deadbeef', SECRET), false);
  assertEquals(await verifySignature(data, REFERENCE_SIGN, 'wrong_secret'), false);
  assertEquals(await verifySignature(data, null, SECRET), false);

  // Главный сценарий атаки: подменить сумму в уже подписанном уведомлении.
  const tampered = { ...data, sum: '1.00' };
  assertEquals(await verifySignature(tampered, REFERENCE_SIGN, SECRET), false);
});
