import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { alignSmileContext, inwardMaskDistance } from './smile-quality.ts';

function fixture() {
  const width = 192, height = 108, bitmap = new Uint8Array(width * height * 4), mask = new Uint8Array(width * height);
  let seed = 725;
  for (let p = 0; p < width * height; p++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const value = 40 + (seed >>> 24) % 170;
    bitmap.set([value, value, value, 255], p * 4);
    const x = p % width, y = Math.floor(p / width);
    if (x >= 45 && x < 145 && y >= 42 && y < 66) mask[p] = 1;
  }
  return { source: { width, height, bitmap }, mask, crop: { x: 0, y: 0, width, height }, frame: { width, height, offsetX: 0, offsetY: 0 } };
}

Deno.test('quality: two-pixel translation uses protected context, ignores regenerated teeth', () => {
  const { source, mask, crop, frame } = fixture();
  const edited = { ...source, bitmap: new Uint8Array(source.bitmap.length) };
  for (let y = 0; y < source.height - 1; y++) for (let x = 0; x < source.width - 2; x++) {
    edited.bitmap.set(source.bitmap.subarray((y * source.width + x) * 4, (y * source.width + x) * 4 + 4), ((y + 1) * source.width + x + 2) * 4);
  }
  for (let y = 43; y < 67; y++) for (let x = 47; x < 147; x++) edited.bitmap.set([255, 255, 255, 255], (y * source.width + x) * 4);
  assertEquals(alignSmileContext(source, edited, mask, crop, frame), { x: 2, y: 1, rejected: false });
  const scaled = { width: edited.width * 2, height: edited.height * 2, bitmap: new Uint8Array(edited.bitmap.length * 4) };
  for (let y = 0; y < scaled.height; y++) for (let x = 0; x < scaled.width; x++) {
    const p = (Math.floor(y / 2) * edited.width + Math.floor(x / 2)) * 4;
    scaled.bitmap.set(edited.bitmap.subarray(p, p + 4), (y * scaled.width + x) * 4);
  }
  assertEquals(alignSmileContext(source, scaled, mask, crop, frame), { x: 4, y: 2, rejected: false });
});

Deno.test('quality: identity stays fixed, unrecognizable context is rejected, flat images do not invent an offset', () => {
  const { source, mask, crop, frame } = fixture();
  assertEquals(alignSmileContext(source, source, mask, crop, frame), { x: 0, y: 0, rejected: false });
  const inverted = { ...source, bitmap: Uint8Array.from(source.bitmap, (v, i) => i % 4 === 3 ? v : 255 - v) };
  assert(alignSmileContext(source, inverted, mask, crop, frame).rejected);
  const flat = { ...source, bitmap: new Uint8Array(source.bitmap.length).fill(255) };
  assertEquals(alignSmileContext(flat, flat, mask, crop, frame), { x: 0, y: 0, rejected: false });
});

Deno.test('quality: inward feather respects holes and protected edges, reaches full opacity', () => {
  const mask = new Uint8Array(25 * 25);
  for (let y = 2; y < 23; y++) for (let x = 2; x < 23; x++) mask[y * 25 + x] = 1;
  mask[12 * 25 + 12] = 0;
  const distance = inwardMaskDistance(mask, 25, 25, 5);
  assertEquals(distance[0], 0); assertEquals(distance[12 * 25 + 12], 0);
  assertEquals(distance[2 * 25 + 8], 1); assertEquals(distance[3 * 25 + 8], 2);
  assertEquals(distance[8 * 25 + 8], 5); assertEquals(distance[12 * 25 + 11], 1);
  for (let p = 0; p < mask.length; p++) if (!mask[p]) assertEquals(distance[p], 0);
});
