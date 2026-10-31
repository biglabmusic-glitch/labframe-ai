/** Bounded, local image operations. No model calls or patient-data logging. */
interface Raster { width: number; height: number; bitmap: Uint8Array | Uint8ClampedArray }
interface Region { x: number; y: number; width: number; height: number }
interface Frame { width: number; height: number; offsetX: number; offsetY: number }

export function inwardMaskDistance(mask: Uint8Array, width: number, height: number, cap: number): Uint8Array {
  const distance = Uint8Array.from(mask, (v) => v ? cap : 0);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = y * width + x;
    if (distance[p]) distance[p] = Math.min(distance[p], x ? distance[p - 1] + 1 : 1, y ? distance[p - width] + 1 : 1);
  }
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const p = y * width + x;
    if (distance[p]) distance[p] = Math.min(distance[p], x + 1 < width ? distance[p + 1] + 1 : 1,
      y + 1 < height ? distance[p + width] + 1 : 1);
  }
  return distance;
}

function luminance(image: Raster, x: number, y: number): number {
  x = Math.max(0, Math.min(image.width - 1, x)); y = Math.max(0, Math.min(image.height - 1, y));
  const x0 = Math.floor(x), y0 = Math.floor(y), dx = x - x0, dy = y - y0;
  const value = (xx: number, yy: number) => {
    const p = (yy * image.width + xx) * 4;
    return image.bitmap[p] * 0.2126 + image.bitmap[p + 1] * 0.7152 + image.bitmap[p + 2] * 0.0722;
  };
  const x1 = Math.min(x0 + 1, image.width - 1), y1 = Math.min(y0 + 1, image.height - 1);
  return (value(x0, y0) * (1 - dx) + value(x1, y0) * dx) * (1 - dy) +
    (value(x0, y1) * (1 - dx) + value(x1, y1) * dx) * dy;
}

/** Translation only, measured on protected context, never on newly generated teeth.
 * Low texture or ambiguous matches leave coordinates unchanged. This is not an anatomy check.
 */
export function alignSmileContext(source: Raster, edited: Raster, mask: Uint8Array, crop: Region, frame: Frame) {
  const identity = { x: 0, y: 0, rejected: false };
  if (crop.width < 80 || crop.height < 24) return identity;
  const radius = Math.max(3, Math.min(6, Math.round(crop.width * 0.012)));
  const clearance = inwardMaskDistance(Uint8Array.from(mask, (v) => v ? 0 : 1), source.width, source.height, radius + 3);
  const sx = edited.width / frame.width, sy = edited.height / frame.height;
  const samples: Array<{ x: number; y: number; gx: number; gy: number }> = [];
  const step = Math.max(1, Math.ceil(Math.sqrt(crop.width * crop.height / 700)));
  let xx = 0, yy = 0;
  for (let y = crop.y + radius + 2; y < crop.y + crop.height - radius - 2; y += step) {
    for (let x = crop.x + radius + 2; x < crop.x + crop.width - radius - 2; x += step) {
      if (clearance[y * source.width + x] < radius + 2) continue;
      const gx = luminance(source, x + 1, y) - luminance(source, x - 1, y);
      const gy = luminance(source, x, y + 1) - luminance(source, x, y - 1);
      if (gx * gx + gy * gy < 100) continue;
      samples.push({ x: (x - crop.x + frame.offsetX + 0.5) * sx - 0.5,
        y: (y - crop.y + frame.offsetY + 0.5) * sy - 0.5, gx, gy });
      xx += gx * gx; yy += gy * gy;
    }
  }
  if (samples.length < 48 || Math.min(xx, yy) < (xx + yy) * 0.08) return identity;
  const scores: Array<{ x: number; y: number; score: number }> = [];
  for (let y = -radius; y <= radius; y++) for (let x = -radius; x <= radius; x++) {
    let dot = 0, energy = 0;
    for (const s of samples) {
      const px = s.x + x * sx, py = s.y + y * sy;
      const gx = luminance(edited, px + sx, py) - luminance(edited, px - sx, py);
      const gy = luminance(edited, px, py + sy) - luminance(edited, px, py - sy);
      dot += gx * s.gx + gy * s.gy; energy += gx * gx + gy * gy;
    }
    scores.push({ x, y, score: energy ? dot / Math.sqrt((xx + yy) * energy) : 0 });
  }
  scores.sort((a, b) => b.score - a.score);
  const best = scores[0], zero = scores.find((s) => s.x === 0 && s.y === 0)!;
  // A strongly mismatching textured context is not safe to paste. No automatic paid retry.
  if (best.score < 0.45) return { ...identity, rejected: true };
  const competitor = scores.find((s) => Math.abs(s.x - best.x) + Math.abs(s.y - best.y) > 1);
  if (best.score < 0.85 || best.score - zero.score < 0.08 || (competitor && best.score - competitor.score < 0.06)) return identity;
  if (Math.abs(best.x) === radius || Math.abs(best.y) === radius) return { ...identity, rejected: true };
  return { x: best.x * sx, y: best.y * sy, rejected: false };
}
