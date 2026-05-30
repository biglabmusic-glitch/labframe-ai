import { assertEquals, assertMatch } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { normalizeCode, parseStartParam, generateRefCode } from './referral.ts';

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
