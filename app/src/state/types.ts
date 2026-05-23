export type WorkType = 'crown' | 'veneer' | 'bridge' | 'other';
export type StyleId = 'clean' | 'dark' | 'soft';
export type FormatId = '4x5' | '1x1' | '9x16';
export type TextType = 'short' | 'sell' | 'tech' | 'none';
export type BrandingKind = 'logo' | 'name' | 'none';
export type Plan = 'free' | 'start' | 'pro' | 'lab';
export type JobStatus =
  | 'created'
  | 'photo_uploaded'
  | 'settings_selected'
  | 'processing'
  | 'done'
  | 'failed';

export interface User {
  telegramId?: number;
  username?: string;
  name: string;
  initials: string;
  avatarUrl?: string;
  plan: Plan;
  usage: { used: number; limit: number; period: string };
}

export interface BrandData {
  logoUrl?: string;
  logoFileName?: string;
  masterName?: string;
  labName?: string;
  defaultStyle?: StyleId;
  logoPlacement: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  hashtags: string[];
}

export interface Draft {
  photo?: { name: string; size: string; resolution: string; url?: string };
  workType?: WorkType;
  style?: StyleId;
  branding?: BrandingKind;
  format?: FormatId;
  textType?: TextType;
  status: JobStatus;
}

export interface Job {
  id: string;
  style: StyleId;
  format: FormatId;
  workType?: WorkType;
  createdAt: number;
  thumbBg: string;
  dark?: boolean;
}
