/** Local mouth geometry only: no image, face or tooth pixels leave the browser. */
export interface SmileCropPoint { x: number; y: number }
export interface SmileCropRegion { x: number; y: number; width: number; height: number }
export interface SmileCropGeometry {
  sourceWidth: number;
  sourceHeight: number;
  width: number;
  height: number;
  region: SmileCropRegion;
  offsetX: number;
  offsetY: number;
  /** Inner lip contour in the padded upload's pixel coordinates. */
  polygon: SmileCropPoint[];
}
export type SmileCropErrorCode = 'no_face' | 'multiple_faces' | 'mouth_closed' |
  'mouth_too_small' | 'crop_unavailable' | 'output_dimensions';
export class SmileCropError extends Error {
  constructor(public readonly code: SmileCropErrorCode) { super(code); this.name = 'SmileCropError'; }
}

const INNER_UPPER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308];
const INNER_LOWER = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308];
const OUTER_UPPER = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291];
const OUTER_LOWER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291];
const MAX_SIDE = 2000;
const MAX_AREA = 4_000_000;
function dimensions(width: number, height: number) {
  return Number.isInteger(width) && Number.isInteger(height) && width >= 1 && height >= 1 &&
    width <= MAX_SIDE && height <= MAX_SIDE && width * height <= MAX_AREA;
}
function bounds(points: readonly SmileCropPoint[]) {
  return { left: Math.min(...points.map((p) => p.x)), top: Math.min(...points.map((p) => p.y)),
    right: Math.max(...points.map((p) => p.x)), bottom: Math.max(...points.map((p) => p.y)) };
}

/** An explicit mouth contour works with an already-cropped smile, without a face model.
 * Points use original image pixels and are confirmed locally before any upload. */
export function locateManualSmileCrop(width: number, height: number,
  boundary: readonly SmileCropPoint[]): SmileCropGeometry {
  if (!dimensions(width, height) || boundary.length < 3 || boundary.length > 32 ||
    boundary.some((p) => !Number.isFinite(p.x + p.y) || p.x < 0 || p.y < 0 || p.x > width || p.y > height)) {
    throw new SmileCropError('crop_unavailable');
  }
  const cross = (a: SmileCropPoint, b: SmileCropPoint, c: SmileCropPoint) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  for (let i = 0; i < boundary.length; i++) for (let j = i + 2; j < boundary.length; j++) {
    if (i === 0 && j === boundary.length - 1) continue;
    const a = boundary[i], b = boundary[(i + 1) % boundary.length], c = boundary[j], d = boundary[(j + 1) % boundary.length];
    if (Math.max(a.x, b.x) >= Math.min(c.x, d.x) && Math.max(c.x, d.x) >= Math.min(a.x, b.x) &&
      Math.max(a.y, b.y) >= Math.min(c.y, d.y) && Math.max(c.y, d.y) >= Math.min(a.y, b.y) &&
      cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0) throw new SmileCropError('crop_unavailable');
  }
  // The editor uses a convex inner-lip contour. Crossed or folded handles must
  // never silently create a different edit area from the one the user sees.
  const turns = boundary.map((p, i) => cross(p, boundary[(i + 1) % boundary.length], boundary[(i + 2) % boundary.length]));
  if (turns.some((n) => n < 0) && turns.some((n) => n > 0)) throw new SmileCropError('crop_unavailable');
  const b = bounds(boundary), mouthWidth = b.right - b.left, mouthHeight = b.bottom - b.top;
  if (mouthWidth < 64) throw new SmileCropError('mouth_too_small');
  if (mouthHeight < 5) throw new SmileCropError('mouth_closed');
  if (mouthHeight > mouthWidth || turns.every((n) => n === 0)) throw new SmileCropError('crop_unavailable');
  const x = Math.max(0, Math.floor(b.left - mouthWidth * 0.12));
  const y = Math.max(0, Math.floor(b.top - mouthWidth * 0.08));
  const right = Math.min(width, Math.ceil(b.right + mouthWidth * 0.12));
  const bottom = Math.min(height, Math.ceil(b.bottom + mouthWidth * 0.08));
  const region = { x, y, width: right - x, height: bottom - y };
  const frameHeight = Math.max(64, region.height, Math.ceil((mouthHeight + 2) / 0.5));
  const frameWidth = Math.max(64, region.width,
    Math.ceil((mouthWidth + 2) * (mouthHeight + 2) / (frameHeight * 0.4)));
  if (!dimensions(frameWidth, frameHeight)) throw new SmileCropError('crop_unavailable');
  const offsetX = Math.floor((frameWidth - region.width) / 2), offsetY = Math.floor((frameHeight - region.height) / 2);
  return { sourceWidth: width, sourceHeight: height, width: frameWidth, height: frameHeight, region, offsetX, offsetY,
    polygon: boundary.map((p) => ({ x: p.x - x + offsetX, y: p.y - y + offsetY })) };
}

/** A missing/ambiguous face abstains; it never falls back to uploading the photo. */
export function locateSmileCrop(width: number, height: number,
  faces: readonly (readonly SmileCropPoint[])[]): SmileCropGeometry {
  if (!dimensions(width, height)) throw new SmileCropError('crop_unavailable');
  if (!faces.length) throw new SmileCropError('no_face');
  if (faces.length !== 1) throw new SmileCropError('multiple_faces');
  const face = faces[0];
  const points = (ids: readonly number[]) => ids.map((id) => {
    const p = face[id];
    if (!p || !Number.isFinite(p.x + p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) {
      throw new SmileCropError('crop_unavailable');
    }
    return { x: p.x * width, y: p.y * height };
  });
  const inner = [...points(INNER_UPPER), ...points(INNER_LOWER).slice(1, -1).reverse()];
  const outer = [...points(OUTER_UPPER), ...points(OUTER_LOWER)];
  const inside = bounds(inner), outside = bounds(outer);
  const mouthWidth = inside.right - inside.left, mouthHeight = inside.bottom - inside.top;
  if (mouthWidth < 96) throw new SmileCropError('mouth_too_small');
  if (mouthHeight < Math.max(5, mouthWidth * 0.035)) throw new SmileCropError('mouth_closed');
  if (mouthHeight > mouthWidth || outside.right - outside.left > mouthWidth * 1.8 ||
    inside.left < outside.left - 2 || inside.right > outside.right + 2 ||
    inside.top < outside.top - 2 || inside.bottom > outside.bottom + 2) {
    throw new SmileCropError('crop_unavailable');
  }
  // Small local lip context only. Extra space needed by the existing upload
  // limits is solid black padding, never additional eyes/nose/face pixels.
  const x = Math.max(0, Math.floor(outside.left - mouthWidth * 0.06));
  const y = Math.max(0, Math.floor(outside.top - mouthWidth * 0.035));
  const right = Math.min(width, Math.ceil(outside.right + mouthWidth * 0.06));
  const bottom = Math.min(height, Math.ceil(outside.bottom + mouthWidth * 0.05));
  const region = { x, y, width: right - x, height: bottom - y };
  const frameHeight = Math.max(64, region.height, Math.ceil((mouthHeight + 2) / 0.5));
  const frameWidth = Math.max(64, region.width,
    Math.ceil((mouthWidth + 2) * (mouthHeight + 2) / (frameHeight * 0.4)));
  if (!dimensions(frameWidth, frameHeight)) throw new SmileCropError('crop_unavailable');
  const offsetX = Math.floor((frameWidth - region.width) / 2);
  const offsetY = Math.floor((frameHeight - region.height) / 2);
  return { sourceWidth: width, sourceHeight: height, width: frameWidth, height: frameHeight, region, offsetX, offsetY,
    polygon: inner.map((p) => ({ x: p.x - x + offsetX, y: p.y - y + offsetY })) };
}

export function validateSmileCropGeometry(g: SmileCropGeometry): void {
  const r = g.region;
  if (!dimensions(g.sourceWidth, g.sourceHeight) || !dimensions(g.width, g.height) ||
    !r || [r.x, r.y, r.width, r.height, g.offsetX, g.offsetY].some((v) => !Number.isInteger(v)) ||
    r.x < 0 || r.y < 0 || r.width < 1 || r.height < 1 ||
    r.x + r.width > g.sourceWidth || r.y + r.height > g.sourceHeight ||
    g.offsetX < 0 || g.offsetY < 0 || g.offsetX + r.width > g.width || g.offsetY + r.height > g.height ||
    !Array.isArray(g.polygon) || g.polygon.length < 3 || g.polygon.length > 100 ||
    g.polygon.some((p) => !Number.isFinite(p.x + p.y) || p.x < g.offsetX || p.y < g.offsetY ||
      p.x > g.offsetX + r.width || p.y > g.offsetY + r.height)) {
    throw new SmileCropError('crop_unavailable');
  }
}

/** Binary center-of-pixel rasterization keeps lips outside the edit area. */
export function smileCropMask(g: SmileCropGeometry): Uint8Array {
  validateSmileCropGeometry(g);
  const pixels = new Uint8Array(g.width * g.height), box = bounds(g.polygon);
  for (let y = Math.max(0, Math.floor(box.top)); y <= Math.min(g.height - 1, Math.ceil(box.bottom)); y++) {
    const scanY = y + 0.5, intersections: number[] = [];
    for (let i = 0, j = g.polygon.length - 1; i < g.polygon.length; j = i++) {
      const a = g.polygon[j], b = g.polygon[i];
      if ((a.y > scanY) !== (b.y > scanY)) {
        intersections.push(a.x + (scanY - a.y) * (b.x - a.x) / (b.y - a.y));
      }
    }
    intersections.sort((a, b) => a - b);
    for (let i = 0; i + 1 < intersections.length; i += 2) {
      const from = Math.max(0, Math.ceil(intersections[i] - 0.5));
      const to = Math.min(g.width, Math.ceil(intersections[i + 1] - 0.5));
      pixels.fill(255, y * g.width + from, y * g.width + to);
    }
  }
  if (pixels.reduce((count, p) => count + Number(p !== 0), 0) < 16) throw new SmileCropError('mouth_closed');
  return pixels;
}

/** The already-protected returned crop is placed into a copy of the original.
 * Pixels outside the inner lip polygon and the original alpha remain exact. */
export function compositeSmileCropPixels(source: Uint8ClampedArray | Uint8Array,
  generated: Uint8ClampedArray | Uint8Array, g: SmileCropGeometry): Uint8ClampedArray<ArrayBuffer> {
  validateSmileCropGeometry(g);
  if (source.length !== g.sourceWidth * g.sourceHeight * 4 || generated.length !== g.width * g.height * 4) {
    throw new SmileCropError('output_dimensions');
  }
  const result = new Uint8ClampedArray(source), mask = smileCropMask(g), r = g.region;
  for (let y = 0; y < r.height; y++) for (let x = 0; x < r.width; x++) {
    const local = (y + g.offsetY) * g.width + x + g.offsetX;
    if (!mask[local]) continue;
    const target = ((y + r.y) * g.sourceWidth + x + r.x) * 4;
    result[target] = generated[local * 4]; result[target + 1] = generated[local * 4 + 1];
    result[target + 2] = generated[local * 4 + 2];
  }
  return result;
}
