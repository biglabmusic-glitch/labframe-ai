import { assert, assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { smilePointRegion, smileRegion, smileSeeds } from '../app/src/lib/smile-mask-region.ts';
import { selectSamMask } from '../app/src/lib/sam-mask-selection.ts';
import { samEncoderImage, samPromptPoints } from '../app/src/lib/sam-image.ts';

Deno.test('mouth ROI preserves native proportions and clips the photo edge, invalid/closed geometry abstains', () => {
  const mouth = { upper: [{ x: 0.3, y: 0.55 }, { x: 0.5, y: 0.5 }, { x: 0.7, y: 0.55 }],
    lower: [{ x: 0.3, y: 0.55 }, { x: 0.5, y: 0.65 }, { x: 0.7, y: 0.55 }] };
  const roi = smileRegion(mouth);
  assert(roi.x < 0.3 && roi.y < 0.5 && roi.x + roi.width > 0.7 && roi.y + roi.height > 0.65);
  const edge = smileRegion({ upper: mouth.upper.map((p) => ({ x: p.x - 0.3, y: p.y })), lower: mouth.lower.map((p) => ({ x: p.x - 0.3, y: p.y })) });
  assertEquals(edge.x, 0); assert(edge.width > 0.4);
  assertThrows(() => smileRegion({ upper: [], lower: [] }));
  assertThrows(() => smileRegion({ upper: [{ x: 0, y: 0 }, { x: 0.2, y: 0 }, { x: 0.4, y: 0 }], lower: [{ x: 0, y: 0 }, { x: 0.2, y: 0 }, { x: 0.4, y: 0 }] }));
  assertThrows(() => smileRegion({ upper: mouth.upper.map((p) => ({ ...p, y: p.y - 2 })), lower: mouth.lower.map((p) => ({ ...p, y: p.y - 2 })) }));
});

Deno.test('auto seed points stay inside enamel and map from native crop back to full photo', () => {
  const w = 120, h = 60, mask = new Uint8Array(w * h);
  for (let y = 15; y < 35; y++) for (let x = 10; x < 110; x++) mask[y * w + x] = 255;
  const roi = { x: 0.4, y: 0.6, width: 0.3, height: 0.15 };
  const seeds = smileSeeds(mask, w, h, roi);
  assert(seeds.length >= 3);
  for (const seed of seeds) {
    const x = Math.floor((seed.x - roi.x) / roi.width * w), y = Math.floor((seed.y - roi.y) / roi.height * h);
    assertEquals(mask[y * w + x], 255); assertEquals(seed.label, 1);
    assert(seed.x > roi.x && seed.x < roi.x + roi.width && seed.y > roi.y && seed.y < roi.y + roi.height);
  }
  assertEquals(smileSeeds(new Uint8Array(w * h), w, h, roi), []);
  assertEquals(smileSeeds(mask, -1, h, roi), []);
});

Deno.test('close-up point ROI centers the mouth without requiring a precise finger outline', () => {
  const points = [{ x: 243 / 600, y: 210 / 400, label: 1 as const }, { x: 376 / 600, y: 207 / 400, label: 1 as const }];
  const roi = smilePointRegion(points, 600, 400);
  assert(roi.width < 0.6 && roi.height < 0.5);
  for (const point of points) assert(point.x > roi.x && point.x < roi.x + roi.width && point.y > roi.y && point.y < roi.y + roi.height);
  const edge = smilePointRegion([{ x: 0.01, y: 0.99, label: 1 }], 600, 400);
  assertEquals(edge.x, 0); assert(edge.y + edge.height <= 1);
  assertThrows(() => smilePointRegion([{ x: 0.5, y: 0.5, label: 0 }], 600, 400));
});

function rectangle(pixels: Uint8Array, w: number, x: number, y: number, ww: number, hh: number) {
  for (let yy = y; yy < y + hh; yy++) for (let xx = x; xx < x + ww; xx++) pixels[yy * w + xx] = 1;
}

Deno.test('SAM selection tolerates a tap one pixel off the edge and removes unprompted islands', () => {
  const w = 60, h = 40, pixels = new Uint8Array(w * h);
  rectangle(pixels, w, 10, 10, 25, 10); rectangle(pixels, w, 40, 30, 10, 5);
  const selected = selectSamMask(w, h, pixels, [0.9], [{ x: 9, y: 15, label: 1 }]);
  assert(selected); assertEquals(selected.pixels[15 * w + 15], 1);
  assertEquals(selected.pixels[32 * w + 45], 0); assertEquals(selected.pixels[15 * w + 9], 0);
  assertEquals(selectSamMask(w, h, pixels, [0.9], [{ x: 5, y: 15, label: 1 }]), null);
});

Deno.test('SAM selection refuses conflicting negative points and whole-frame masks instead of silently punching holes', () => {
  const w = 60, h = 40, pixels = new Uint8Array(w * h);
  rectangle(pixels, w, 10, 10, 25, 10);
  assertEquals(selectSamMask(w, h, pixels, [0.95], [{ x: 15, y: 15, label: 1 }, { x: 30, y: 15, label: 0 }]), null);
  assertEquals(selectSamMask(w, h, new Uint8Array(w * h).fill(1), [0.99], [{ x: 15, y: 15, label: 1 }]), null);
  assertEquals(selectSamMask(w, h, pixels, [0.99], [{ x: 15, y: 15, label: 0 }]), null);
});

Deno.test('SAM prefers a compact part containing all tooth prompts over a higher-scored whole-mouth candidate', () => {
  const w = 60, h = 40, area = w * h, candidates = new Uint8Array(area * 2);
  rectangle(candidates, w, 8, 8, 40, 23);
  const small = candidates.subarray(area); rectangle(small, w, 10, 10, 25, 10);
  const result = selectSamMask(w, h, candidates, [0.98, 0.76], [{ x: 15, y: 15, label: 1 }, { x: 30, y: 15, label: 1 }]);
  assert(result); assertEquals(result.pixels[25 * w + 40], 0); assertEquals(result.score, 0.76);
});

Deno.test('MobileSAM preprocessing preserves RGB and aspect ratio, keeps input unchanged and rejects oversized arrays', () => {
  const w = 32, h = 16, rgba = new Uint8Array(w * h * 4);
  for (let p = 0; p < w * h; p++) rgba.set([64, 128, 192, 255], p * 4);
  const before = rgba.slice(), result = samEncoderImage(rgba, w, h);
  assertEquals(result.width, 1024); assertEquals(result.height, 512);
  assertEquals([...result.data.subarray(0, 3)], [64, 128, 192]); assertEquals(rgba, before);
  assertEquals(result.scaleX, result.scaleY);
  assertThrows(() => samEncoderImage(rgba, 4096, 4096));
});

Deno.test('coarse positive edge taps snap only to nearby enamel interior; negatives and distant taps stay fixed', () => {
  const w = 60, h = 40, rgba = new Uint8Array(w * h * 4);
  for (let p = 0; p < w * h; p++) rgba.set([180, 80, 90, 255], p * 4);
  for (let y = 10; y < 25; y++) for (let x = 20; x < 35; x++) rgba.set([230, 220, 210, 255], (y * w + x) * 4);
  const points = [{ x: 19, y: 15, label: 1 as const }, { x: 19, y: 15, label: 0 as const }, { x: 2, y: 2, label: 1 as const }];
  const result = samPromptPoints(rgba, w, h, points);
  assert(result[0].x >= 20 && result[0].x <= 22); assertEquals(result[1], points[1]); assertEquals(result[2], points[2]);
  assertEquals(points[0].x, 19);
});
