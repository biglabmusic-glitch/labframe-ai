import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { COST_DECOR, COST_NORMAL, creditCost } from './credits.ts';

Deno.test('creditCost: обычная генерация стоит 1', () => {
  assertEquals(creditCost(null), 1);
  assertEquals(creditCost(undefined), 1);
  assertEquals(creditCost(''), 1);
});

Deno.test('creditCost: генерация с декором стоит 3', () => {
  assertEquals(creditCost('snake'), 3);
  assertEquals(creditCost('amethyst'), 3);
  assertEquals(creditCost('custom'), 3);
});

Deno.test('константы совпадают с контрактом SQL-триггера spend_credits_on_done', () => {
  assertEquals(COST_NORMAL, 1);
  assertEquals(COST_DECOR, 3);
});
