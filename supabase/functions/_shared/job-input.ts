import { resolveDecor } from './decor.ts';

export class JobInputError extends Error {}
export function jobSettings(
  body: Record<string, unknown>,
  userId: number,
): Record<string, string | null> {
  const {
    photoPath,
    style,
    format,
    workType,
    branding = 'none',
    textType = 'short',
    decorPreset,
    decorAddition,
  } = body;
  if (
    typeof photoPath !== 'string' || photoPath.length > 512 ||
    !photoPath.startsWith(`${userId}/`) ||
    !/^[a-zA-Z0-9._-]+$/.test(photoPath.slice(`${userId}/`.length)) || photoPath.includes('..')
  ) {
    throw new JobInputError('forbidden_path');
  }
  if (
    !['clean', 'dark', 'soft'].includes(String(style)) ||
    !['4x5', '1x1', '9x16'].includes(String(format)) ||
    !['none', 'name', 'logo'].includes(String(branding)) ||
    !['short', 'sell', 'tech', 'none'].includes(String(textType)) ||
    (workType !== undefined &&
      !['crown', 'veneer', 'bridge', 'other'].includes(String(workType))) ||
    (decorPreset !== undefined && (typeof decorPreset !== 'string' || decorPreset.length > 80)) ||
    (decorAddition !== undefined &&
      (typeof decorAddition !== 'string' || decorAddition.length > 1000))
  ) {
    throw new JobInputError('invalid_settings');
  }
  for (const value of [style, format, branding, textType]) {
    if (typeof value !== 'string') throw new JobInputError('invalid_settings');
  }
  if (workType !== undefined && typeof workType !== 'string') {
    throw new JobInputError('invalid_settings');
  }
  const decor = resolveDecor(
    decorPreset as string | undefined,
    decorAddition as string | undefined,
    style as 'clean' | 'dark' | 'soft',
  );
  return {
    photo_path: photoPath,
    style: style as string,
    format: format as string,
    work_type: workType as string ?? null,
    branding: branding as string,
    text_type: textType as string,
    decor_preset: decor ? decorPreset as string : null,
    decor_surface: decor?.surface ?? null,
    decor_addition: decor?.addition ?? null,
  };
}

export function boundedInt(value: string | undefined, fallback: number, max = 1000): number {
  const n = Number(value);
  return value && Number.isInteger(n) && n >= 1 && n <= max ? n : fallback;
}

export function requestKey(value: unknown): string | null {
  if (value === undefined) return null;
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new JobInputError('invalid_request_key');
  }
  return value;
}
