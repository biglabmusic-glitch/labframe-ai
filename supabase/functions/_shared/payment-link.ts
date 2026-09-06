// Сборка ссылки на оплату Продамуса — общая для админского и пользовательского входа.
//
// У Продамуса ссылка — это просто URL с параметрами, никакого вызова API и
// токена не нужно. Всё, что вебхуку понадобится знать о покупке, зашито в
// order_id, а order_id входит в подписанные данные уведомления — значит
// подменить адресата начисления нельзя.
//
// Цена уходит в ссылке параметром, и покупатель может подправить её в адресной
// строке до оплаты. Это НЕ дыра: payment-webhook сверяет пришедшую сумму с
// PACKAGES и при расхождении не начисляет. Здесь просто подставляем прайс.
import { PACKAGES, buildOrderId, packageById } from './packages.ts';

export interface PaymentLink {
  url: string;
  orderId: string;
  credits: number;
  priceRub: number;
}

/** Ошибка сборки ссылки с уже готовым HTTP-статусом для ответа. */
export class PaymentLinkError extends Error {
  constructor(
    public code: string,
    public status: number,
    public extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

/**
 * Собирает ссылку на оплату пакета.
 *
 * customerLabel попадает в customer_extra — это подпись заказа в кабинете
 * Продамуса, чтобы владелец видел, кто платил. На начисление она не влияет:
 * вебхук берёт получателя строго из order_id.
 */
export function buildPaymentLink(
  tgId: number,
  packageId: string,
  customerLabel: string,
): PaymentLink {
  const pkg = packageById(packageId);
  if (!pkg) {
    throw new PaymentLinkError('unknown_package', 400, { known: PACKAGES.map((p) => p.id) });
  }

  // Базовый адрес формы вида https://<магазин>.payform.ru — из env, потому что
  // он появится только после регистрации в Продамусе и может смениться.
  const formUrl = (Deno.env.get('PRODAMUS_FORM_URL') ?? '').replace(/\/+$/, '');
  if (!formUrl) throw new PaymentLinkError('not_configured', 500);

  const orderId = buildOrderId(tgId, pkg.id);

  const q = new URLSearchParams({
    order_id: orderId,
    customer_extra: `Пакет ${pkg.credits} генераций для ${customerLabel}`,
    do: 'pay',
  });
  q.set('products[0][name]', `${pkg.credits} генераций LabFrame AI`);
  q.set('products[0][price]', String(pkg.priceRub));
  q.set('products[0][quantity]', '1');

  return {
    url: `${formUrl}/?${q.toString()}`,
    orderId,
    credits: pkg.credits,
    priceRub: pkg.priceRub,
  };
}
