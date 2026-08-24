import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { PACKAGES, amountMatches, buildOrderId, packageById, parseOrderId } from './packages.ts';

Deno.test('парсинг order_id: достаёт telegram id и пакет', () => {
  const r = parseOrderId('lf-888181907-p50-a1b2c3d4e5');
  assertEquals(r?.tgId, 888181907);
  assertEquals(r?.pkg.credits, 50);
  assertEquals(r?.pkg.priceRub, 1500);
});

Deno.test('парсинг order_id: отвергает мусор и неизвестный пакет', () => {
  for (const bad of [
    'lf-888181907-p999-abc',      // пакета нет в прайсе
    'lf-abc-p50-abc',             // id не число
    'lf--p50-abc',                // пустой id
    'other-888181907-p50-abc',    // чужой префикс
    'lf-888181907-p50',           // нет nonce
    '',
  ]) {
    assertEquals(parseOrderId(bad), null, `должно отвергнуть: ${bad}`);
  }
});

Deno.test('order_id, собранный buildOrderId, разбирается обратно', () => {
  for (const p of PACKAGES) {
    const r = parseOrderId(buildOrderId(42, p.id));
    assertEquals(r?.tgId, 42);
    assertEquals(r?.pkg.id, p.id);
  }
});

Deno.test('сверка суммы: принимает точную цену, отвергает заниженную', () => {
  const p50 = packageById('p50')!;
  assertEquals(amountMatches(p50, '1500'), true);
  assertEquals(amountMatches(p50, '1500.00'), true);
  // Ровно тот случай, ради которого сверка и нужна: правка цены в ссылке.
  assertEquals(amountMatches(p50, '1.00'), false);
  assertEquals(amountMatches(p50, '1499.99'), false);
  assertEquals(amountMatches(p50, 'abc'), false);
  assertEquals(amountMatches(p50, ''), false);
});

Deno.test('прайс совпадает с фронтом (app/src/lib/plans.ts)', async () => {
  // Цены живут в двух местах, потому что фронт не импортирует код функций.
  // Тест падает, если списки разъехались, — иначе покупатель увидел бы одну
  // цену, а вебхук ждал бы другую и отказал в начислении.
  const src = await Deno.readTextFile(new URL('../../../app/src/lib/plans.ts', import.meta.url));
  const front = [...src.matchAll(/id:\s*'(\w+)',\s*count:\s*(\d+),\s*price:\s*(\d+)/g)]
    .map((m) => ({ id: m[1], credits: Number(m[2]), priceRub: Number(m[3]) }));

  assertEquals(front.length, PACKAGES.length, 'разное число пакетов');
  assertEquals(front, PACKAGES);
});
