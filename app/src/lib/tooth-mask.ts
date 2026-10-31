// A conservative photo heuristic, not a dental diagnosis or an FDI classifier.
// Coordinates and pixels never leave the caller's device.
export interface MaskPoint { x: number; y: number }
export interface MouthRegion { upper: MaskPoint[]; lower: MaskPoint[] }
export class AutoMaskError extends Error {
  constructor(public code: 'no_face' | 'uncertain' | 'model_unavailable') { super(code); }
}

function curveY(points: MaskPoint[], x: number): number {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (x <= b.x) return a.y + (b.y - a.y) * Math.max(0, Math.min(1, (x - a.x) / Math.max(0.01, b.x - a.x)));
  }
  return points[points.length - 1].y;
}

export function proposeToothPixels(rgba: Uint8ClampedArray, width: number, height: number, mouth: MouthRegion) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 32 || height < 32 ||
      width * height > 1_000_000 || rgba.length !== width * height * 4) throw new AutoMaskError('uncertain');
  const upper = [...mouth.upper].sort((a, b) => a.x - b.x);
  const lower = [...mouth.lower].sort((a, b) => a.x - b.x);
  if (upper.length < 3 || lower.length < 3 || [...upper, ...lower].some((p) => !Number.isFinite(p.x + p.y))) {
    throw new AutoMaskError('uncertain');
  }
  const left = Math.max(1, Math.ceil(Math.max(upper[0].x, lower[0].x)));
  const right = Math.min(width - 2, Math.floor(Math.min(upper.at(-1)!.x, lower.at(-1)!.x)));
  const span = right - left;
  if (span < 24 || span > width * 0.9 || Math.abs(upper.at(-1)!.y - upper[0].y) > span * 0.28) throw new AutoMaskError('uncertain');
  const top = new Float32Array(width), bottom = new Float32Array(width);
  let innerArea = 0;
  const levels: number[] = [];
  const neutral = new Uint8Array(width * height);
  for (let x = left; x <= right; x++) {
    top[x] = curveY(upper, x); bottom[x] = curveY(lower, x);
    if (bottom[x] - top[x] > height * 0.45) throw new AutoMaskError('uncertain');
    if (x < left + span * 0.035 || x > right - span * 0.035) continue;
    for (let y = Math.max(1, Math.ceil(top[x]) + 1); y < Math.min(height - 1, bottom[x] - 1); y++) {
      innerArea++;
      const pixel = y * width + x, i = pixel * 4;
      const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
      // Reject red gingiva/lips, strongly coloured illumination and darkness.
      if (rgba[i + 3] > 240 && r - g <= 32 && r <= g * 1.27 && g - b <= 75 && b - g <= 42 && g - r <= 35) {
        neutral[pixel] = 1;
        levels.push(0.2126 * r + 0.7152 * g + 0.0722 * b);
      }
    }
  }
  if (innerArea < 150 || levels.length < innerArea * 0.08) throw new AutoMaskError('uncertain');
  levels.sort((a, b) => a - b);
  const bright = levels[Math.floor((levels.length - 1) * 0.85)];
  if (bright < 140) throw new AutoMaskError('uncertain');
  const threshold = Math.max(105, Math.min(190, bright * 0.7));
  const candidate = new Uint8Array(width * height);
  const rows = new Uint32Array(64), rowArea = new Uint32Array(64);
  for (let x = left; x <= right; x++) {
    const depth = bottom[x] - top[x];
    if (depth < 4) continue;
    for (let y = Math.max(1, Math.ceil(top[x]) + 1); y < Math.min(height - 1, bottom[x] - 1); y++) {
      const p = y * width + x, i = p * 4;
      const value = neutral[p] && 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2] >= threshold;
      if (value) candidate[p] = 1;
      if (x >= left + span * 0.18 && x <= right - span * 0.18) {
        const row = Math.max(0, Math.min(63, Math.floor(64 * (y - top[x]) / depth)));
        rowArea[row]++; rows[row] += value ? 1 : 0;
      }
    }
  }
  // Find the end of the first enamel band. No clear dark separation => abstain.
  const fractions = Array.from(rows, (n, i) => {
    let sum = 0, count = 0;
    for (let k = Math.max(0, i - 2); k <= Math.min(63, i + 2); k++) { sum += rows[k]; count += rowArea[k]; }
    return count ? sum / count : 0;
  });
  let start = -1, end = -1;
  for (let i = 4; i < 35; i++) if (fractions[i] > 0.22) { start = i; break; }
  if (start < 0) throw new AutoMaskError('uncertain');
  for (let i = start + 5; i < 56; i++) {
    if (fractions[i] < 0.12 && fractions[i + 1] < 0.12 && fractions[i + 2] < 0.12) { end = i; break; }
  }
  if (end < 0 || end < 13 || end - start < 6) throw new AutoMaskError('uncertain');
  const cutoff = end / 64;
  const mask = new Uint8Array(width * height);
  let area = 0, minX = width, maxX = 0, minY = height, maxY = 0;
  for (let x = left + 1; x < right; x++) {
    for (let y = Math.max(1, Math.ceil(top[x]) + 2); y < Math.min(height - 1, top[x] + (bottom[x] - top[x]) * cutoff); y++) {
      const p = y * width + x;
      if (!candidate[p]) continue;
      let neighbours = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) neighbours += candidate[p + dy * width + dx];
      // Smooth isolated speckles without growing into rejected tissue.
      if (neighbours < 7) continue;
      mask[p] = 255; area++;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  if (area < Math.max(40, innerArea * 0.06) || area > innerArea * 0.7 || maxX - minX < span * 0.35) {
    throw new AutoMaskError('uncertain');
  }
  return { mask, center: { x: (minX + maxX) / 2 / width, y: (minY + maxY) / 2 / height } };
}
