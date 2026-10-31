// Ограничитель частоты для эндпоинтов, которые тратят деньги на каждом вызове.
//
// Проверка initData отсекает чужих, но не своего же пользователя, который
// зациклил запрос — или того, кто получил чужую строку initData и крутит её
// сутки. Счёт за модели при этом платим мы.
import { db } from './db.ts';
import { jsonResponse } from './auth.ts';

export interface Limit {
  /** Сколько обращений разрешаем в окне. */
  limit: number;
  /** Окно в секундах. */
  windowSec: number;
}

/** A failed limit check must not permit an operation that spends money. */
export async function allowAction(userId: number, action: string, { limit, windowSec }: Limit): Promise<boolean> {
  try {
  const { data, error } = await db.rpc('hit_rate_limit', {
    p_user_id: userId,
    p_action: action,
    p_limit: limit,
    p_window_sec: windowSec,
  });
  if (error) {
    console.error(`лимит ${action} не проверился:`, error.message);
    return false;
  }
  return data === true;
  } catch {
    console.error(`лимит ${action} временно недоступен`);
    return false;
  }
}

/** Готовый отказ: 429 и человеческая причина. */
export function tooOften(): Response {
  return jsonResponse(
    { error: 'rate_limited', message: 'Слишком часто. Подождите немного и попробуйте снова.' },
    { status: 429 },
  );
}
