import type { FormatId, StyleId } from './replicate.ts';
export interface ImageInput {
  photoUrl: string;
  style: StyleId;
  format: FormatId;
  prompt: string;
  referenceImages?: string[];
  aspectRatio?: '16:9';
}
