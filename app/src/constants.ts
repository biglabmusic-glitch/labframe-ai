export const APP_NAME = 'LabFrame AI';

/**
 * Аккаунт поддержки в Telegram. Тот же адрес задан секретом SUPPORT_URL
 * на сервере — там кнопки поддержки в боте; меняя одно, поменяйте и второе.
 */
export const SUPPORT_TG: string = import.meta.env.VITE_SUPPORT_TG || 'DanyaSanta';
export const SUPPORT_URL = `https://t.me/${SUPPORT_TG}`;

export const TG_THEME = {
  headerColor: '#0F1221',
  backgroundColor: '#0F1221',
  mainButtonColor: '#93D5E1',
  mainButtonTextColor: '#0F1221',
} as const;
