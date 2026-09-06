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
 * Ник бота, который продаёт пакеты. Значение по умолчанию — боевой бот, чтобы
 * покупка работала сразу после деплоя; переопределяется через env, если бот
 * когда-нибудь сменится.
 */
export const BOT_TG: string = import.meta.env.VITE_BOT_TG || 'labframe_ai_bot';

/**
 * Ссылка на покупку пакета.
 *
 * Ведёт в чат с ботом, а НЕ на платёжную страницу: Telegram требует продавать
 * цифровые товары внутри мини-аппов только за Stars, поэтому платёжную ссылку
 * здесь не открываем. Бот по payload `buy_<id>` сразу присылает кнопку оплаты —
 * для покупателя это одно лишнее касание, зато правило соблюдено, а продажа
 * идёт без участия владельца.
 *
 * Раньше кнопка вела в чат с владельцем и счёт выставлялся руками; payload
 * разбирается в supabase/functions/bot-webhook.
 */
export function buyLink(pkg: Package): string {
  return `https://t.me/${BOT_TG}?start=buy_${pkg.id}`;
}

/** Склонение «генерация/генерации/генераций» для подписей. */
export function pluralGenerations(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'генерация';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'генерации';
  return 'генераций';
}
