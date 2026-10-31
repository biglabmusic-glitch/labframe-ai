import { AutoMaskError, type MaskPoint, type MouthRegion } from './tooth-mask';

export interface SmileRegion { x: number; y: number; width: number; height: number }
export interface SmileSeed extends MaskPoint { label: 0 | 1 }

/** For a close-up without a detectable face, the first positive tap locates a
 * native crop. Further positive taps can recenter/expand it; no precise outline.
 */
export function smilePointRegion(points: readonly SmileSeed[], photoWidth: number, photoHeight: number): SmileRegion {
  const positive = points.filter((p) => p.label === 1);
  if (!positive.length || !Number.isInteger(photoWidth) || !Number.isInteger(photoHeight) || photoWidth < 32 || photoHeight < 32 ||
      points.some((p) => !Number.isFinite(p.x + p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)) throw new AutoMaskError('uncertain');
  const xs = positive.map((p) => p.x * photoWidth), ys = positive.map((p) => p.y * photoHeight);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const base = Math.max(128, Math.min(384, photoWidth * 0.4));
  const width = Math.min(photoWidth, Math.max(base, (maxX - minX) * 1.6));
  const height = Math.min(photoHeight, Math.max(base * 0.55, (maxY - minY) * 1.8));
  const x = Math.max(0, Math.min(photoWidth - width, (minX + maxX - width) / 2));
  const y = Math.max(0, Math.min(photoHeight - height, (minY + maxY - height) / 2));
  return { x: x / photoWidth, y: y / photoHeight, width: width / photoWidth, height: height / photoHeight };
}

/** Lip landmarks locate a high-resolution crop; they do not claim to locate teeth. */
export function smileRegion(mouth: MouthRegion): SmileRegion {
  const points = [...mouth.upper, ...mouth.lower];
  if (mouth.upper.length < 3 || mouth.lower.length < 3 || points.some((p) => !Number.isFinite(p.x + p.y))) throw new AutoMaskError('uncertain');
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
  const width = right - left, height = bottom - top;
  if (width < 0.015 || height < 0.003 || height > width || width > 0.95) throw new AutoMaskError('uncertain');
  const x = Math.max(0, left - width * 0.16), y = Math.max(0, top - height * 0.35);
  const roi = { x, y, width: Math.min(1, right + width * 0.16) - x, height: Math.min(1, bottom + height * 0.35) - y };
  if (roi.width < 0.015 || roi.height < 0.003) throw new AutoMaskError('uncertain');
  return roi;
}

/** Sparse prompts only. The old colour heuristic is never returned as the final mask. */
export function smileSeeds(mask: Uint8Array, width: number, height: number, roi: SmileRegion): SmileSeed[] {
  if (!Number.isInteger(width) || !Number.isInteger(height) || mask.length !== width * height || width < 1 || height < 1 || width * height > 1_000_000) return [];
  const distance = Uint8Array.from(mask, (p) => p ? 20 : 0);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = y * width + x;
    if (distance[p]) distance[p] = Math.min(distance[p], x ? distance[p - 1] + 1 : 1, y ? distance[p - width] + 1 : 1);
  }
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const p = y * width + x;
    if (distance[p]) distance[p] = Math.min(distance[p], x + 1 < width ? distance[p + 1] + 1 : 1, y + 1 < height ? distance[p + width] + 1 : 1);
  }
  const positives: SmileSeed[] = [];
  const bins = 12;
  for (let bin = 0; bin < bins; bin++) {
    let best = -1, depth = 1;
    for (let y = 0; y < height; y++) for (let x = Math.floor(width * bin / bins); x < width * (bin + 1) / bins; x++) {
      const p = y * width + x;
      if (distance[p] > depth) { depth = distance[p]; best = p; }
    }
    if (best >= 0) positives.push({ x: roi.x + ((best % width) + 0.5) / width * roi.width,
      y: roi.y + (Math.floor(best / width) + 0.5) / height * roi.height, label: 1 });
  }
  return positives;
}
