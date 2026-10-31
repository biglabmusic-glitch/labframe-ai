export interface LocalSamPoint { x: number; y: number; label: 0 | 1 }
export interface SelectedSamMask {
  pixels: Uint8Array;
  score: number;
  center: { x: number; y: number };
}

/** Retain only prompted components. A tap can miss the exact edge by two crop pixels;
 * never paint a circle around it or grow the model's predicted contour.
 * SAM's ranking score is not a calibrated dental confidence.
 */
export function selectSamMask(width: number, height: number, pixels: Uint8Array, scores: ArrayLike<number | bigint>, points: LocalSamPoint[], maxAreaFraction = 0.8): SelectedSamMask | null {
  const area = width * height;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || area > 4_194_304 ||
      !points.length || !points.some((p) => p.label === 1) || points.some((p) => !Number.isFinite(p.x + p.y) ||
        p.x < 0 || p.y < 0 || p.x >= width || p.y >= height || ![0, 1].includes(p.label))) return null;
  const queue = new Int32Array(area), labels = new Int32Array(area);
  let best: SelectedSamMask | null = null, bestCount = Infinity;
  for (let candidate = 0; candidate < scores.length; candidate++) {
    const offset = candidate * area, score = Number(scores[candidate]);
    // SAM ranks alternate object granularities, not whether an object is a tooth.
    // A compact part covering all positive taps is safer here than the whole mouth.
    // The ranking floor merely discards weak model candidates, not a dental confidence.
    if (!Number.isFinite(score) || score < 0.6 || offset + area > pixels.length) continue;
    labels.fill(0);
    let component = 0;
    for (let p = 0; p < area; p++) {
      if (!pixels[offset + p] || labels[p]) continue;
      const label = ++component; let read = 0, write = 1; queue[0] = p; labels[p] = label;
      while (read < write) {
        const current = queue[read++], x = current % width, y = Math.floor(current / width);
        for (let yy = Math.max(0, y - 1); yy <= Math.min(height - 1, y + 1); yy++) {
          for (let xx = Math.max(0, x - 1); xx <= Math.min(width - 1, x + 1); xx++) {
            const next = yy * width + xx;
            if (!labels[next] && pixels[offset + next]) { labels[next] = label; queue[write++] = next; }
          }
        }
      }
    }
    const keep = new Set<number>(); let valid = true;
    for (const point of points.filter((p) => p.label === 1)) {
      let nearest = 0, distance = Infinity;
      const x = Math.round(point.x), y = Math.round(point.y);
      for (let yy = Math.max(0, y - 2); yy <= Math.min(height - 1, y + 2); yy++) {
        for (let xx = Math.max(0, x - 2); xx <= Math.min(width - 1, x + 2); xx++) {
          const d = Math.hypot(xx - point.x, yy - point.y), label = labels[yy * width + xx];
          if (label && d <= 2 && d < distance) { nearest = label; distance = d; }
        }
      }
      if (!nearest) { valid = false; break; }
      keep.add(nearest);
    }
    if (!valid) continue;
    // Negative taps exclude a whole component; they do not punch arbitrary holes.
    for (const point of points.filter((p) => p.label === 0)) {
      const p = Math.min(height - 1, Math.round(point.y)) * width + Math.min(width - 1, Math.round(point.x));
      if (keep.has(labels[p])) { valid = false; break; }
    }
    if (!valid) continue;
    const selected = new Uint8Array(area); let count = 0, sumX = 0, sumY = 0;
    for (let p = 0; p < area; p++) if (keep.has(labels[p])) {
      selected[p] = 1; count++; sumX += p % width; sumY += Math.floor(p / width);
    }
    if (count < Math.max(8, area * 0.0005) || count > area * maxAreaFraction) continue;
    if (count > bestCount || (count === bestCount && best && score <= best.score)) continue;
    bestCount = count;
    best = { pixels: selected, score, center: { x: (sumX / count + 0.5) / width, y: (sumY / count + 0.5) / height } };
  }
  return best;
}
