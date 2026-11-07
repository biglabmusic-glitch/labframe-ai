import type { FormatId, StyleId } from './replicate.ts';
export interface ImageInput {
  photoUrl: string;
  style: StyleId;
  format: FormatId;
  prompt: string;
  referenceImages?: string[];
  /** Native inpainting mask: white edits, black protects. Never infer from references. */
  maskUrl?: string;
  aspectRatio?: '16:9';
}
