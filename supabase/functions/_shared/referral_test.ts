import { assertEquals, assertMatch } from 'https://deno.land/std@0.224.0/assert/mod.ts';

// referral.ts тянет клиент базы, а тот читает секреты при импорте: без заглушек
// тест падал ещё до первой проверки.
for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'REPLICATE_API_TOKEN', 'POLZA_API_KEY', 'BOT_TOKEN']) {
  Deno.env.set(name, name === 'SUPABASE_URL' ? 'http://localhost' : 'test');
}
const { normalizeCode, parseStartParam, generateRefCode } = await import('./referral.ts');

Deno.test('normalizeCode: upper-case + trim + срез мусора', () => {
  assertEquals(normalizeCode('  zub-ab12 '), 'ZUB-AB12');
  assertEquals(normalizeCode('zub ab12'), 'ZUBAB12');     // пробел внутри убираем
  assertEquals(normalizeCode('zub-ab12!@#'), 'ZUB-AB12'); // спецсимволы убираем
  assertEquals(normalizeCode(''), '');
});

Deno.test('parseStartParam: достаёт код из ref_-префикса', () => {
  assertEquals(parseStartParam('ref_ZUB-AB12'), 'ZUB-AB12');
  assertEquals(parseStartParam('ref_zub-ab12'), 'ZUB-AB12'); // нормализуем
  assertEquals(parseStartParam('ZUB-AB12'), '');             // без префикса — не реф
  assertEquals(parseStartParam(''), '');
  assertEquals(parseStartParam(undefined), '');
});

Deno.test('generateRefCode: формат ZUB-XXXX, 4 символа из безопасного алфавита', () => {
  const code = generateRefCode();
  assertMatch(code, /^ZUB-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
});
