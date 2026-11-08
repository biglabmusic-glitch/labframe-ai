import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { Image } from 'https://deno.land/x/imagescript@1.2.17/mod.ts';
import { compositeSmileCropPixels, locateManualSmileCrop, locateSmileCrop, smileCropMask, type SmileCropPoint } from '../app/src/lib/smile-crop-geometry.ts';
import { compositeSmile, decodeSmileInputs, smileProviderInputs } from '../supabase/functions/_shared/smile-preview.ts';

/** Synthetic pixels and fixed approximate lip landmarks isolate the raster
 * contract from face-model quality and work without ignored local fixtures.
 * No inference/API calls, patient data or generated dental result is involved. */
function fixtureLandmarks(): SmileCropPoint[] {
  const points = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  const contours = [
    { ids: [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308], left: 194, width: 238, y: 177, depth: -10 },
    { ids: [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308], left: 194, width: 238, y: 177, depth: 93 },
    { ids: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291], left: 181, width: 264, y: 177, depth: -38 },
    { ids: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291], left: 181, width: 264, y: 177, depth: 133 },
  ];
  for (const contour of contours) for (let i = 0; i < contour.ids.length; i++) {
    points[contour.ids[i]] = { x: (contour.left + contour.width * i / 10) / 600,
      y: (contour.y + contour.depth * Math.sin(Math.PI * i / 10)) / 400 };
  }
  return points;
}
function dataBytes(data: string) {
  return Uint8Array.from(atob(data.slice(data.indexOf(',') + 1)), (c) => c.charCodeAt(0));
}

Deno.test('synthetic fixture: mouth-only upload survives real backend framing/composite and local original restoration', async () => {
  const source = new Image(600, 400);
  for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
    const p = (y * source.width + x) * 4;
    source.bitmap.set([x % 200, y % 200, (x + y) % 200, 255], p);
  }
  assertEquals([source.width, source.height], [600, 400]);
  const boundary = Array.from({ length: 8 }, (_, i) => ({ x: 313 + 119 * Math.cos(i * Math.PI / 4), y: 216 + 54 * Math.sin(i * Math.PI / 4) }));
  for (const g of [locateSmileCrop(source.width, source.height, [fixtureLandmarks()]), locateManualSmileCrop(source.width, source.height, boundary)]) {
  assert(g.region.y > 100 && g.region.y + g.region.height < 340);
  assert(g.region.width < source.width && g.region.height < source.height);
  const binary = smileCropMask(g), upload = new Image(g.width, g.height).fill(0x000000ff);
  const maskImage = new Image(g.width, g.height).fill(0x000000ff);
  for (let y = 0; y < g.region.height; y++) for (let x = 0; x < g.region.width; x++) {
    const from = ((g.region.y + y) * source.width + g.region.x + x) * 4;
    const to = ((g.offsetY + y) * g.width + g.offsetX + x) * 4;
    upload.bitmap.set(source.bitmap.subarray(from, from + 4), to);
  }
  for (let p = 0; p < binary.length; p++) if (binary[p]) maskImage.bitmap.set([255, 255, 255, 255], p * 4);
  const inputs = await decodeSmileInputs(await upload.encode(), await maskImage.encode());
  assertEquals([inputs.source.width, inputs.source.height], [g.width, g.height]);
  const provider = await smileProviderInputs(inputs);
  const generated = await Image.decode(dataBytes(provider.photo)), providerMask = await Image.decode(dataBytes(provider.mask));
  // Deterministic stand-in for the provider changes only allowed mouth pixels;
  // it tests mapping and safe pasting, not dental realism or prompt adherence.
  for (let p = 0; p < generated.width * generated.height; p++) if (providerMask.bitmap[p * 4] >= 128) {
    generated.bitmap[p * 4] = 235; generated.bitmap[p * 4 + 1] = 230; generated.bitmap[p * 4 + 2] = 225;
  }
  const serverResult = await Image.decode(await compositeSmile(inputs, await generated.encode()));
  assertEquals([serverResult.width, serverResult.height], [g.width, g.height]);
  const fullResult = compositeSmileCropPixels(source.bitmap, serverResult.bitmap, g);
  let protectedPixels = 0, changedMouthPixels = 0, upperChanges = 0, lowerChanges = 0;
  for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
    const i = (y * source.width + x) * 4, localX = x - g.region.x + g.offsetX, localY = y - g.region.y + g.offsetY;
    const active = localX >= 0 && localX < g.width && localY >= 0 && localY < g.height && binary[localY * g.width + localX] !== 0;
    const changed = [0, 1, 2].some((c) => source.bitmap[i + c] !== fullResult[i + c]);
    assertEquals(fullResult[i + 3], source.bitmap[i + 3]);
    if (!active) { assertEquals([...fullResult.subarray(i, i + 4)], [...source.bitmap.subarray(i, i + 4)]); protectedPixels++; }
    else if (changed) { changedMouthPixels++; if (y < 220) upperChanges++; else lowerChanges++; }
  }
  assert(protectedPixels > source.width * source.height * 0.8);
  assert(changedMouthPixels > 100 && upperChanges > 100 && lowerChanges > 100);
  }
});
