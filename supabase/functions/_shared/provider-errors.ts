// Разбор ошибок провайдеров картинок: что повторять, а что нет.
//
// Отдельно от image-providers.ts, потому что там при импорте читаются
// секреты, а эти правила нужно проверять тестами без них.

/** Код ответа из сообщения вида «polza 503: …». null — ответа не было вовсе. */
export function httpStatus(message: string): number | null {
  const m = /^[a-z][a-z-]* (\d{3}):/i.exec(message);
  return m ? Number(m[1]) : null;
}

/**
 * Стоит ли пробовать второй раз.
 *
 * Повторяем только то, что похоже на временную беду связи или перегрузку.
 * Отказ по ключу или неверный запрос повторять незачем — второй раз ответят
 * то же самое, а время работы мы потратим.
 *
 * Код ответа смотрим только в начале сообщения. Раньше искали « 5xx» по всему
 * тексту, включая тело ответа, и любое число вроде «512» в описании ошибки
 * делало постоянный отказ «временным».
 */
export function isTransient(message: string): boolean {
  const status = httpStatus(message);
  if (status !== null) return status >= 500 || status === 429 || status === 408;

  // Ответа не было: наш таймаут или обрыв связи. Отладочный дамп ответа
  // (всё после « :: ») не читаем — в нём может встретиться что угодно.
  const m = message.split(' :: ')[0].toLowerCase();
  return (
    m.includes('не ответила') ||     // наш таймаут
    m.includes('timed out') ||
    m.includes('timeout') ||
    m.includes('connect') ||
    m.includes('network') ||
    m.includes('econnreset') ||
    m.includes('overloaded')
  );
}

/**
 * Провайдер отказал из-за нашего аккаунта у него: кончились деньги,
 * ключ отозван или заблокирован. Такой ответ приходит мгновенно и сам
 * не пройдёт — пока кто-то не пополнит счёт или не сменит ключ.
 */
export function isAccountProblem(message: string): boolean {
  const status = httpStatus(message);
  return status === 401 || status === 402 || status === 403;
}
