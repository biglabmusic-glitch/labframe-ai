import { assert, assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  compositeSmileCropPixels, locateManualSmileCrop, locateSmileCrop, smileCropMask, SmileCropError,
  type SmileCropGeometry, type SmileCropPoint,
} from '../app/src/lib/smile-crop-geometry.ts';

function face(): SmileCropPoint[] {
  const points = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  const upper = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308];
  const lower = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308];
  const outerUpper = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291];
  const outerLower = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291];
  for (let i = 0; i < upper.length; i++) {
    const x = 0.35 + i * 0.03, arch = Math.sin(Math.PI * i / 10);
    points[upper[i]] = { x, y: 0.65 - arch * 0.035 };
    points[lower[i]] = { x, y: 0.65 + arch * 0.075 };
    points[outerUpper[i]] = { x: x - 0.012 + i * 0.0024, y: 0.65 - arch * 0.07 };
    points[outerLower[i]] = { x: x - 0.012 + i * 0.0024, y: 0.65 + arch * 0.11 };
  }
  return points;
}

Deno.test('already-cropped smile needs no face and its confirmed contour fits the existing server mask limits', () => {
  for (const [width, height] of [[600, 400], [1600, 128], [1280, 1600]]) {
    const points = Array.from({ length: 8 }, (_, i) => ({
      x: width * (0.5 + 0.32 * Math.cos(Math.PI + i * Math.PI / 4)),
      y: height * (0.52 + 0.18 * Math.sin(Math.PI + i * Math.PI / 4)),
    }));
    const g = locateManualSmileCrop(width, height, points), mask = smileCropMask(g);
    const selected = mask.reduce((count, p) => count + Number(p !== 0), 0);
    assert(selected > 16 && selected / mask.length <= 0.45);
    assert(g.region.width < width || g.region.height < height);
    assert((Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y)) + 1) / g.height <= 0.55);
    assertEquals(g.sourceWidth, width); assertEquals(g.sourceHeight, height);
  }
});

Deno.test('cropped-smile confirmation rejects crossed, folded, out-of-frame and tiny contours', () => {
  const box = [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 180 }, { x: 100, y: 180 }];
  for (const points of [[], [box[0], box[2], box[1], box[3]], box.map((p) => ({ ...p, x: p.x - 200 })),
    box.map((p) => ({ ...p, y: 100 })), box.map((p) => ({ ...p, x: p.x / 10 })),
    [box[0], { x: NaN, y: 140 }, box[2]]]) assertThrows(() => locateManualSmileCrop(600, 400, points), SmileCropError);
  const star = Array.from({ length: 5 }, (_, i) => ({ x: 300 + 120 * Math.cos(i * Math.PI * 4 / 5), y: 200 + 65 * Math.sin(i * Math.PI * 4 / 5) }));
  assertThrows(() => locateManualSmileCrop(600, 400, star), SmileCropError);
});

Deno.test('mouth crop excludes portrait eyes/nose and uses black padding for server mask limits', () => {
  const g = locateSmileCrop(1000, 1000, [face()]), mask = smileCropMask(g);
  assert(g.region.x > 300 && g.region.x + g.region.width < 700);
  assert(g.region.y > 550 && g.region.y + g.region.height < 800);
  assert(g.width >= 64 && g.height >= 64);
  const selected = mask.reduce((count, p) => count + Number(p !== 0), 0);
  assert(selected > 16 && selected / mask.length <= 0.45);
  const xs: number[] = [], ys: number[] = [];
  for (let p = 0; p < mask.length; p++) if (mask[p]) { xs.push(p % g.width); ys.push(Math.floor(p / g.width)); }
  const w = Math.max(...xs) - Math.min(...xs) + 1, h = Math.max(...ys) - Math.min(...ys) + 1;
  assert(h <= g.height * 0.55 && w * h <= mask.length * 0.45);
  assertEquals(mask[g.offsetY * g.width + g.offsetX], 0);
});

Deno.test('missing, multiple, too-small and closed mouths abstain instead of uploading full portrait', () => {
  assertEquals(assertThrows(() => locateSmileCrop(1000, 1000, []), SmileCropError).code, 'no_face');
  assertEquals(assertThrows(() => locateSmileCrop(1000, 1000, [face(), face()]), SmileCropError).code, 'multiple_faces');
  assertEquals(assertThrows(() => locateSmileCrop(200, 200, [face()]), SmileCropError).code, 'mouth_too_small');
  const closed = face().map((p) => ({ ...p, y: 0.65 }));
  assertEquals(assertThrows(() => locateSmileCrop(1000, 1000, [closed]), SmileCropError).code, 'mouth_closed');
  const invalid = face(); invalid[13].y = NaN;
  assertThrows(() => locateSmileCrop(1000, 1000, [invalid]), SmileCropError);
});

Deno.test('local composition changes both upper and lower mouth but preserves lips, outside pixels and alpha exactly', () => {
  const g: SmileCropGeometry = { sourceWidth: 160, sourceHeight: 120, width: 80, height: 64,
    region: { x: 40, y: 40, width: 60, height: 40 }, offsetX: 10, offsetY: 12,
    polygon: [{ x: 20, y: 20 }, { x: 60, y: 20 }, { x: 60, y: 42 }, { x: 20, y: 42 }] };
  const source = new Uint8Array(g.sourceWidth * g.sourceHeight * 4), edited = new Uint8Array(g.width * g.height * 4);
  for (let p = 0; p < source.length / 4; p++) source.set([p % 253, 31, 72, 100 + p % 155], p * 4);
  for (let p = 0; p < edited.length / 4; p++) edited.set([240, 230, 220, 255], p * 4);
  const before = source.slice(), result = compositeSmileCropPixels(source, edited, g), mask = smileCropMask(g);
  let inside = 0;
  for (let y = 0; y < g.sourceHeight; y++) for (let x = 0; x < g.sourceWidth; x++) {
    const i = (y * g.sourceWidth + x) * 4, localX = x - g.region.x + g.offsetX, localY = y - g.region.y + g.offsetY;
    const active = localX >= 0 && localX < g.width && localY >= 0 && localY < g.height && mask[localY * g.width + localX];
    assertEquals(result[i + 3], source[i + 3]);
    if (active) { assertEquals([...result.subarray(i, i + 3)], [240, 230, 220]); inside++; }
    else assertEquals([...result.subarray(i, i + 4)], [...source.subarray(i, i + 4)]);
  }
  assert(inside > 100); assertEquals(source, before);
  assertEquals([...result.subarray((50 * 160 + 60) * 4, (50 * 160 + 60) * 4 + 3)], [240, 230, 220]);
  assertEquals([...result.subarray((65 * 160 + 60) * 4, (65 * 160 + 60) * 4 + 3)], [240, 230, 220]);
});

Deno.test('composition rejects wrong-size result and persisted geometry escaping the local source', () => {
  const g = locateSmileCrop(1000, 1000, [face()]);
  assertThrows(() => compositeSmileCropPixels(new Uint8Array(1000 * 1000 * 4), new Uint8Array(4), g), SmileCropError);
  assertThrows(() => smileCropMask({ ...g, region: { ...g.region, x: -1 } }), SmileCropError);
  assertThrows(() => smileCropMask({ ...g, polygon: [{ x: 0, y: -1 }, { x: 20, y: 20 }, { x: 10, y: 20 }] }), SmileCropError);
});
