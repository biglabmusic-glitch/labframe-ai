import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';

// digest.ts тянет клиент базы, а тот читает секреты при импорте.
for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'REPLICATE_API_TOKEN', 'POLZA_API_KEY', 'BOT_TOKEN']) {
  Deno.env.set(name, name === 'SUPABASE_URL' ? 'http://localhost' : 'test');
}
const { digestText, topReason } = await import('./digest.ts');
type DigestData = Parameters<typeof digestText>[0];

function data(patch: Partial<DigestData> = {}): DigestData {
  return {
    jobs: 20, done: 19, failed: 1, newUsers: 4,
    revenue: 1500, payments: 1,
    balance: 1354, currency: 'RUB', blocked: 0, topError: null,
    ...patch,
  };
}

Deno.test('обычный день: работы, люди, деньги, остаток', () => {
  const t = digestText(data());
  assertStringIncludes(t, 'Работ: 20 · успешных 95%');
  assertStringIncludes(t, 'Новых людей: 4');
  assertStringIncludes(t, 'Оплат: 1 на 1500 ₽');
  assertStringIncludes(t, 'Остаток polza: 1354 RUB');
});

Deno.test('тишина за сутки — повод проверить', () => {
  const t = digestText(data({ jobs: 0, done: 0, failed: 0, payments: 0, revenue: 0 }));
  assertStringIncludes(t, 'ни одной работы');
  // Процент успеха при нуле работ не выдумываем.
  assertEquals(t.includes('успешных'), false);
});

Deno.test('много падений — зовём в админку и называем причину', () => {
  const t = digestText(data({ jobs: 10, done: 5, failed: 5, topError: 'модель не ответила (5)' }));
  assertStringIncludes(t, 'Упало: 5 · чаще всего: модель не ответила (5)');
  assertStringIncludes(t, 'меньше 80%');
});

Deno.test('о тихом дне без оплат и блокировок лишних строк нет', () => {
  const t = digestText(data({ payments: 0, revenue: 0, failed: 0, blocked: 0 }));
  assertEquals(t.includes('Оплат:'), false);
  assertEquals(t.includes('Упало:'), false);
  assertEquals(t.includes('Заблокировали'), false);
});

Deno.test('причины падений группируются по смыслу', () => {
  assertEquals(
    topReason(['модель не ответила за 100 c', 'timeout', 'polza 503: overloaded']),
    'модель не ответила (2)',
  );
  assertEquals(topReason([]), null);
  assertEquals(topReason([null]), 'без причины (1)');
});
