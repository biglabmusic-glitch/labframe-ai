import { assert, assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { proposeToothPixels, AutoMaskError, type MouthRegion } from '../app/src/lib/tooth-mask.ts';
import { limitMaskView, maskImagePoint, zoomMaskView } from '../app/src/lib/mask-viewport.ts';

const width = 200, height = 160;
const mouth: MouthRegion = { upper: [{ x: 40, y: 65 }, { x: 100, y: 65 }, { x: 160, y: 65 }],
  lower: [{ x: 40, y: 110 }, { x: 100, y: 110 }, { x: 160, y: 110 }] };
function picture(touching = false) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p++) pixels.set([180, 95, 90, 255], p * 4);
  for (let y = 66; y < 110; y++) for (let x = 41; x < 160; x++) pixels.set([25, 15, 18, 255], (y * width + x) * 4);
  for (let y = 70; y < (touching ? 109 : 86); y++) for (let x = 49; x < 152; x++) pixels.set([225, 215, 188, 255], (y * width + x) * 4);
  for (let y = 103; y < 109; y++) for (let x = 58; x < 145; x++) pixels.set([225, 215, 188, 255], (y * width + x) * 4);
  pixels.set([255, 255, 255, 255], 0); // Background highlights must not leak into the mask.
  return pixels;
}

Deno.test('auto mask follows enamel candidates and excludes gingiva, lower teeth and background', () => {
  const { mask, center } = proposeToothPixels(picture(), width, height, mouth);
  assertEquals(mask[0], 0);
  assertEquals(mask[78 * width + 100], 255);
  assertEquals(mask[105 * width + 100], 0);
  assertEquals(mask[68 * width + 100], 0);
  assert(center.x > 0.4 && center.x < 0.6 && center.y > 0.4 && center.y < 0.6);
  for (let p = 0; p < mask.length; p++) if (mask[p]) {
    const x = p % width, y = Math.floor(p / width);
    assert(x > 40 && x < 160 && y > 65 && y < 100);
  }
});

Deno.test('auto mask abstains when upper and lower enamel have no distinct separation', () => {
  assertThrows(() => proposeToothPixels(picture(true), width, height, mouth), AutoMaskError);
});

Deno.test('auto mask rejects red gingiva, closed mouth and invalid geometry instead of guessing', () => {
  const red = picture();
  for (let y = 66; y < 110; y++) for (let x = 41; x < 160; x++) red.set([210, 100, 105, 255], (y * width + x) * 4);
  assertThrows(() => proposeToothPixels(red, width, height, mouth), AutoMaskError);
  assertThrows(() => proposeToothPixels(picture(), width, height, { upper: mouth.upper, lower: mouth.upper }), AutoMaskError);
  assertThrows(() => proposeToothPixels(picture(), width, height, { upper: [], lower: [] }), AutoMaskError);
});

Deno.test('zoom anchors the original pixel; pan and maximum zoom stay in bounds', () => {
  const zoomed = zoomMaskView({ zoom: 1, x: 0, y: 0 }, 3, 150, 200, 300, 400);
  assertEquals(zoomed, { zoom: 3, x: -300, y: -400 });
  assertEquals(maskImagePoint(150, 200, { left: zoomed.x, top: zoomed.y, width: 900, height: 1200 }, 1500, 2000), { x: 750, y: 1000 });
  assertEquals(zoomMaskView(zoomed, 1, 150, 200, 300, 400), { zoom: 1, x: 0, y: 0 });
  assertEquals(limitMaskView({ zoom: 20, x: 200, y: -10000 }, 300, 400), { zoom: 6, x: 0, y: -2000 });
});
