// Единый источник правды по пакетам генераций. Используется в ScreenPricing
// и ScreenMyPlan — не дублируем цены в разных местах.
//
// Пакеты не сгорают: купленные генерации лежат на балансе, пока не потратятся.
// Обычная генерация стоит 1, генерация с декором — 3 (см. _shared/credits.ts).

export interface Package {
  id: string;
  /** Сколько генераций начисляется. */
  count: number;
  /** Цена в рублях. */
  price: number;
  /** Цена за одну генерацию — для подписи «выгоднее». */
  perUnit: number;
  recommended?: boolean;
  points: string[];
}

export const PACKAGES: Package[] = [
  {
    id: 'p20',
    count: 20,
    price: 700,
    perUnit: 35,
    points: ['20 генераций на баланс', 'Не сгорают', 'Все форматы и стили'],
  },
  {
    id: 'p50',
    count: 50,
    price: 1500,
    perUnit: 30,
    recommended: true,
    points: ['50 генераций на баланс', 'Не сгорают', 'Все форматы и стили', 'Выгоднее на 14%'],
  },
  {
    id: 'p150',
    count: 150,
    price: 3500,
    perUnit: 23,
    points: [
      '150 генераций на баланс',
      'Не сгорают',
      'Все форматы и стили',
      'Лучшая цена за генерацию',
    ],
  },
];

export const PACKAGE_BY_ID = Object.fromEntries(
  PACKAGES.map((p) => [p.id, p]),
) as Record<string, Package>;

/**
 * Ник владельца в Telegram для ручной продажи. Берётся из env, а не хардкодится:
 * контакт для продаж меняется чаще, чем код. Пустая строка = кнопки покупки скрыты.
 */
export const OWNER_TG: string = import.meta.env.VITE_OWNER_TG ?? '';

/**
 * Ссылка на чат с владельцем с префиллом текста.
 * Платёжную ссылку внутри мини-аппа не открываем сознательно: Telegram требует
 * продавать цифровые товары внутри своих приложений только за Stars. Здесь мы
 * лишь открываем переписку, счёт владелец выставляет вручную из кабинета ЮKassa.
 */
export function buyLink(pkg: Package): string {
  const text = `Хочу пакет ${pkg.count} генераций за ${pkg.price} ₽`;
  return `https://t.me/${OWNER_TG}?text=${encodeURIComponent(text)}`;
}

/** Склонение «генерация/генерации/генераций» для подписей. */
export function pluralGenerations(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'генерация';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'генерации';
  return 'генераций';
}
