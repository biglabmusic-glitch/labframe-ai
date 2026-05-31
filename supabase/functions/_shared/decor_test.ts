import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { resolveDecor, buildDecorPrompt, sanitizeAddition, DECOR_PRESETS } from './decor.ts';

Deno.test('resolveDecor: известный пресет → его surface+addition', () => {
  const r = resolveDecor('snake', undefined, 'dark');
  assertEquals(r?.surface, DECOR_PRESETS.snake.surface);
  assertEquals(r?.surface, 'black stone');
  assertStringIncludes(r?.addition ?? '', 'white snake');
});

Deno.test('resolveDecor: custom → дефолтная поверхность по стилю + очищенный текст', () => {
  const r = resolveDecor('custom', '  белая змея!!! ', 'clean');
  assertEquals(r?.surface, 'a clean matte white surface');
  assertEquals(r?.addition, 'белая змея');
});

Deno.test('resolveDecor: пустой/неизвестный/пустой-custom → null', () => {
  assertEquals(resolveDecor(null, null, 'clean'), null);
  assertEquals(resolveDecor('', null, 'clean'), null);
  assertEquals(resolveDecor('nope', null, 'clean'), null);
  assertEquals(resolveDecor('custom', '   ', 'clean'), null);
});

Deno.test('sanitizeAddition: режет мусор и длину', () => {
  assertEquals(sanitizeAddition('a\nb'), 'a b');
  assertEquals(sanitizeAddition('snake <script>'), 'snake script');
  assertEquals(sanitizeAddition('x'.repeat(200)).length, 120);
});

Deno.test('buildDecorPrompt: содержит стиль, поверхность и элемент', () => {
  const p = buildDecorPrompt('dark', 'black stone', 'a white snake');
  assertStringIncludes(p, 'premium dark dental photography');
  assertStringIncludes(p, 'Place the dental work on: black stone');
  assertStringIncludes(p, 'a white snake');
  assertStringIncludes(p, 'exactly one decorative element');
});
