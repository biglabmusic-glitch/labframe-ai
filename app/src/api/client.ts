/**
 * Тонкий fetch-клиент. Если VITE_API_BASE_URL не задан — работаем в mock-режиме,
 * чтобы UI можно было листать без бэка. Когда задан — реальные вызовы Edge Functions.
 */
import type { Draft, Job, StyleId, TextType, WorkType, FormatId, BrandingKind } from '../state/types';
import { WebApp } from '../telegram/webapp';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

function initData(): string {
  return WebApp?.initData ?? '';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_BASE) throw new Error('VITE_API_BASE_URL is not set');
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'x-telegram-initdata': initData(),
      ...(SUPABASE_ANON ? { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } : {}),
      ...init?.headers,
    },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export interface CreateJobInput {
  photoPath: string;
  workType?: WorkType;
  style: StyleId;
  format: FormatId;
  branding: BrandingKind;
  textType: TextType;
}

export interface JobResult {
  id: string;
  status: 'created' | 'photo_uploaded' | 'settings_selected' | 'processing' | 'done' | 'failed';
  resultUrl?: string | null;
  caption?: { main: string; alt?: string; hashtags: string[] };
  error?: string | null;
}

export const api = {
  /**
   * Загрузка фото: фронт получает подписанный upload-URL у бэка, потом PUT файл прямо в Storage.
   * Mock — отдаём blob-URL.
   */
  async uploadPhoto(file: File): Promise<{ photoPath: string; previewUrl: string }> {
    if (!API_BASE) {
      return {
        photoPath: `mock/${Date.now()}-${file.name}`,
        previewUrl: URL.createObjectURL(file),
      };
    }
    const { uploadUrl, photoPath } = await request<{ uploadUrl: string; photoPath: string }>(
      '/sign-upload',
      { method: 'POST', body: JSON.stringify({ filename: file.name, contentType: file.type }) },
    );
    const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
    if (!put.ok) throw new Error(`upload ${put.status}`);
    return { photoPath, previewUrl: URL.createObjectURL(file) };
  },

  async createJob(input: CreateJobInput): Promise<JobResult> {
    if (!API_BASE) {
      await new Promise((r) => setTimeout(r, 600));
      return { id: 'mock-' + Date.now(), status: 'processing' };
    }
    return request<JobResult>('/create-job', { method: 'POST', body: JSON.stringify(input) });
  },

  async getJob(id: string): Promise<JobResult> {
    if (!API_BASE) {
      return { id, status: 'done', resultUrl: null, caption: { main: '', hashtags: [] } };
    }
    return request<JobResult>(`/get-job?id=${encodeURIComponent(id)}`);
  },

  async me(): Promise<unknown> {
    if (!API_BASE) return null;
    return request<unknown>('/me');
  },

  async getHistory(): Promise<Job[]> {
    if (!API_BASE) return [];
    return request<Job[]>('/history');
  },

  /** Polling — опрашивает get-job до done/failed. */
  async waitForJob(id: string, onTick?: (j: JobResult) => void, intervalMs = 2000): Promise<JobResult> {
    for (;;) {
      const j = await this.getJob(id);
      onTick?.(j);
      if (j.status === 'done' || j.status === 'failed') return j;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  },
};

/** Возвращает true, если бэкенд сконфигурирован (есть VITE_API_BASE_URL). */
export function isBackendReady(): boolean {
  return Boolean(API_BASE);
}
