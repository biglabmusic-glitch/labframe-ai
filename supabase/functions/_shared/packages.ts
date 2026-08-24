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
 * Идентификатор заказа: `lf-<tgId>-<packageId>-<nonce>`.
 * tgId и пакет берём отсюда, а не из отдельных полей уведомления: order_id
 * входит в подписанные данные, значит подделать его нельзя.
 */
export interface ParsedOrder {
  tgId: number;
  pkg: CreditPackage;
}

export function parseOrderId(orderId: string): ParsedOrder | null {
  const m = /^lf-(\d{1,20})-([a-z0-9]+)-[A-Za-z0-9]+$/.exec(orderId);
  if (!m) return null;

  const tgId = Number(m[1]);
  if (!Number.isSafeInteger(tgId) || tgId <= 0) return null;

  const pkg = packageById(m[2]);
  return pkg ? { tgId, pkg } : null;
}

/** Собирает order_id для новой ссылки на оплату. */
export function buildOrderId(tgId: number, packageId: string): string {
  const nonce = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  return `lf-${tgId}-${packageId}-${nonce}`;
}
