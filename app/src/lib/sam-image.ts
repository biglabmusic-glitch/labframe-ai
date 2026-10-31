/** MobileSAM's exported encoder consumes RGB 0..255, longest edge 1024.
 * Normalization/padding live inside the pinned ONNX graph. Coordinates always
 * map back to the native crop, not a globally downsampled portrait.
 */
export function samEncoderImage(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 16 || height < 16 ||
      width * height > 4_194_304 || rgba.length !== width * height * 4) throw new Error('invalid_input');
  const scale = 1024 / Math.max(width, height);
  const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
  const data = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    const yy = Math.max(0, Math.min(height - 1, (y + 0.5) * height / h - 0.5));
    const y0 = Math.floor(yy), y1 = Math.min(y0 + 1, height - 1), dy = yy - y0;
    for (let x = 0; x < w; x++) {
      const xx = Math.max(0, Math.min(width - 1, (x + 0.5) * width / w - 0.5));
      const x0 = Math.floor(xx), x1 = Math.min(x0 + 1, width - 1), dx = xx - x0;
      for (let c = 0; c < 3; c++) {
        const top = rgba[(y0 * width + x0) * 4 + c] * (1 - dx) + rgba[(y0 * width + x1) * 4 + c] * dx;
        const bottom = rgba[(y1 * width + x0) * 4 + c] * (1 - dx) + rgba[(y1 * width + x1) * 4 + c] * dx;
        data[(y * w + x) * 3 + c] = top * (1 - dy) + bottom * dy;
      }
    }
  }
  return { data, width: w, height: h, scaleX: w / width, scaleY: h / height };
}

/** A coarse positive tap near a pink/dark edge may indicate neighbouring enamel.
 * Use colour only to position a prompt inside that nearby surface, never to draw
 * the resulting mask. Negative taps are preserved exactly.
 */
export function samPromptPoints<T extends { x: number; y: number; label: 0 | 1 }>(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number, points: readonly T[]): T[] {
  const enamel = (x: number, y: number) => {
    const p = (y * width + x) * 4, r = rgba[p], g = rgba[p + 1], b = rgba[p + 2];
    return r - g <= 35 && r <= g * 1.3 && g - b <= 75 && b - g <= 42 && 0.2126 * r + 0.7152 * g + 0.0722 * b >= 115;
  };
  const interior = (x: number, y: number) => {
    let n = 0;
    for (let yy = Math.max(0, y - 1); yy <= Math.min(height - 1, y + 1); yy++) for (let xx = Math.max(0, x - 1); xx <= Math.min(width - 1, x + 1); xx++) if (enamel(xx, yy)) n++;
    return n >= 7;
  };
  const radius = Math.max(3, Math.min(8, Math.round(width * 0.03)));
  return points.map((point) => {
    if (point.label === 0) return { ...point };
    const px = Math.round(point.x), py = Math.round(point.y);
    if (interior(px, py)) return { ...point };
    let best: { x: number; y: number } | undefined, distance = Infinity;
    for (let y = Math.max(1, py - radius); y <= Math.min(height - 2, py + radius); y++) for (let x = Math.max(1, px - radius); x <= Math.min(width - 2, px + radius); x++) {
      const d = (x - point.x) ** 2 + (y - point.y) ** 2;
      if (d < distance && d <= radius * radius && interior(x, y)) { best = { x, y }; distance = d; }
    }
    return best ? { ...point, ...best } : { ...point };
  });
}
