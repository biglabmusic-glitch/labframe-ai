// Пакеты генераций — серверный источник правды.
//
// Дублирует app/src/lib/plans.ts сознательно: фронт не может импортировать код
// Edge Function, а цену НЕЛЬЗЯ брать из уведомления как есть. Ссылка на оплату
// содержит цену параметром, и покупатель может подправить её в адресной строке
// перед оплатой — Продамус честно подпишет уведомление на изменённую сумму.
// Поэтому сумму всегда сверяем с этим списком, а расхождение считаем отказом.
//
// packages_test.ts читает plans.ts и падает, если списки разошлись.

export interface CreditPackage {
  id: string;
  credits: number;
  priceRub: number;
}

export const PACKAGES: CreditPackage[] = [
  { id: 'p20',  credits: 20,  priceRub: 700  },
  { id: 'p50',  credits: 50,  priceRub: 1500 },
  { id: 'p150', credits: 150, priceRub: 3500 },
];

export function packageById(id: string): CreditPackage | undefined {
  return PACKAGES.find((p) => p.id === id);
}

/**
 * Сумма из уведомления приходит строкой вида «1500.00».
 * Сравниваем в копейках, чтобы не ловить погрешность плавающей точки.
 */
export function amountMatches(pkg: CreditPackage, sum: string): boolean {
  const kopecks = Math.round(Number(sum) * 100);
  return Number.isFinite(kopecks) && kopecks === pkg.priceRub * 100;
}

/**
 * Идентификатор заказа: `lf-<tgId>-<packageId>-<nonce>`, а для подарка
 * `lfg-…`. tgId, пакет и признак подарка берём отсюда, а не из отдельных полей
 * уведомления: order_id входит в подписанные данные, значит подделать его
 * нельзя. Будь «это подарок» отдельным полем, покупатель мог бы получить и
 * генерации себе, и подарочный код в придачу.
 */
export interface ParsedOrder {
  tgId: number;
  pkg: CreditPackage;
  /** true — пакет куплен в подарок: генерации ждут в коде, а не на балансе покупателя. */
  gift: boolean;
}

const ORDER_RE = /^(lf|lfg)-(\d{1,20})-([a-z0-9]+)-[A-Za-z0-9]+$/;

export function parseOrderId(orderId: string): ParsedOrder | null {
  const m = ORDER_RE.exec(orderId);
  if (!m) return null;

  const tgId = Number(m[2]);
  if (!Number.isSafeInteger(tgId) || tgId <= 0) return null;

  const pkg = packageById(m[3]);
  return pkg ? { tgId, pkg, gift: m[1] === 'lfg' } : null;
}

/** Собирает order_id для новой ссылки на оплату. */
export function buildOrderId(tgId: number, packageId: string, gift = false): string {
  const nonce = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  return `${gift ? 'lfg' : 'lf'}-${tgId}-${packageId}-${nonce}`;
}

/**
 * Код подарка для ссылки t.me/<бот>?start=gift_<код>.
 * Алфавит без похожих символов: код люди читают и диктуют.
 */
const GIFT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateGiftCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += GIFT_ALPHABET[b % GIFT_ALPHABET.length];
  return `DAR-${s}`;
}

/** Приводит код к каноничному виду: человек может прислать его как угодно. */
export function normalizeGiftCode(raw: string): string {
  return (raw ?? '').toUpperCase().replace(/[^A-Z0-9-]/g, '');
}
