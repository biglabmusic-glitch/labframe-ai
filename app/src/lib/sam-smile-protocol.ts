import type { LocalSamPoint } from './sam-mask-selection';

export type SamWorkerRequest =
  | { id: number; action: 'prepare'; assets: string; width: number; height: number; pixels: ArrayBuffer }
  | { id: number; action: 'segment'; points: LocalSamPoint[] };
export type SamWorkerResponse =
  | { id: number; ok: true; action: 'prepare' }
  | { id: number; ok: true; action: 'segment'; pixels: ArrayBuffer; score: number; center: { x: number; y: number } }
  | { id: number; ok: false; code: 'model_unavailable' | 'uncertain' | 'invalid_input' | 'busy' };
