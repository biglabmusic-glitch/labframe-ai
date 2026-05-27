// Список админов на фронте — отдельная env переменная VITE_ADMIN_IDS
// (через запятую, telegram_id). Используется для условного показа админ-плашки на Home.
//
// ВАЖНО: это только UI-удобство. Настоящая проверка прав — на бэке в /admin,
// который читает Supabase ADMIN_IDS (отдельный список, нельзя поменять с клиента).

const raw = import.meta.env.VITE_ADMIN_IDS ?? '';
const ADMIN_IDS = new Set(
  raw
    .split(',')
    .map((s: string) => Number(s.trim()))
    .filter((n: number) => Number.isFinite(n) && n > 0),
);

export function isAdmin(telegramId?: number): boolean {
  return Boolean(telegramId) && ADMIN_IDS.has(telegramId!);
}
