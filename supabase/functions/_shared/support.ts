// Куда писать человеку, если что-то пошло не так.
//
// Адрес задаётся секретом SUPPORT_URL (ссылка на аккаунт в Telegram). Пока он
// не задан, кнопки поддержки просто нет: лучше её отсутствие, чем кнопка,
// ведущая в пустоту.
import type { InlineButton } from './telegram.ts';

export function supportUrl(): string | null {
  return Deno.env.get('SUPPORT_URL') || null;
}

export function supportButton(text = 'Написать в поддержку'): InlineButton[] {
  const url = supportUrl();
  return url ? [{ text, url }] : [];
}
