// Разбор и проверка подписи уведомлений Продамуса.
//
// Продамус шлёт POST с телом application/x-www-form-urlencoded и PHP-вложенностью
// в именах полей (`products[0][name]`), а подпись кладёт в заголовок `Sign`.
//
// Алгоритм подписи (сверен с рабочей реализацией dnagikh/python-prodamus,
// официального SDK у Продамуса нет):
//   1. тело разбирается в структуру с учётом PHP-скобок;
//   2. сериализуется в JSON с РЕКУРСИВНО отсортированными ключами,
//      компактными разделителями и без экранирования юникода и слэшей;
//   3. HMAC-SHA256 этой строки на секретном ключе, hex;
//   4. сравнение с заголовком регистронезависимое.
//
// Любое отклонение в сериализации (пробел после двоеточия, \uXXXX вместо
// кириллицы, иной порядок ключей) даёт другую подпись — поэтому шаги 2–3
// закреплены тестами в prodamus_test.ts.

export type PhpValue = string | PhpValue[] | { [k: string]: PhpValue };

/**
 * Разбирает form-urlencoded тело в структуру, разворачивая PHP-скобки:
 * `products[0][name]=Пакет` → `{ products: [ { name: 'Пакет' } ] }`.
 * Числовые ключи дают массивы, строковые — объекты (как json_encode в PHP).
 */
export function parsePhpFormBody(body: string): Record<string, PhpValue> {
  const out: Record<string, PhpValue> = {};

  for (const [rawKey, value] of new URLSearchParams(body)) {
    const m = rawKey.match(/^([^\[]+)((?:\[[^\]]*\])*)$/);
    if (!m) { out[rawKey] = value; continue; }

    const path = [m[1], ...[...m[2].matchAll(/\[([^\]]*)\]/g)].map((x) => x[1])];
    assign(out, path, value);
  }
  return out;
}

function assign(root: Record<string, PhpValue>, path: string[], value: string): void {
  // Идём по пути, создавая недостающие узлы. Тип узла выбираем по СЛЕДУЮЩЕМУ
  // ключу: числовой — массив, иначе объект.
  let node: PhpValue = root;

  for (let i = 0; i < path.length; i++) {
    const key = path[i];
    const last = i === path.length - 1;

    if (last) {
      setChild(node, key, value);
      return;
    }

    const nextIsIndex = /^\d+$/.test(path[i + 1]);
    let child = getChild(node, key);
    if (child === undefined || typeof child === 'string') {
      child = nextIsIndex ? [] : {};
      setChild(node, key, child);
    }
    node = child;
  }
}

function getChild(node: PhpValue, key: string): PhpValue | undefined {
  if (Array.isArray(node)) return node[Number(key)];
  if (typeof node === 'object') return node[key];
  return undefined;
}

function setChild(node: PhpValue, key: string, value: PhpValue): void {
  if (Array.isArray(node)) node[Number(key)] = value;
  else if (typeof node === 'object') node[key] = value;
}

/**
 * JSON с рекурсивной сортировкой ключей и компактными разделителями.
 * JSON.stringify сам не экранирует ни слэши, ни кириллицу и не ставит пробелов,
 * поэтому достаточно упорядочить ключи — остальное совпадает с PHP и Python.
 */
export function canonicalJson(value: PhpValue): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: PhpValue): PhpValue {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value !== null && typeof value === 'object') {
    const out: { [k: string]: PhpValue } = {};
    for (const k of Object.keys(value).sort()) out[k] = sortDeep(value[k]);
    return out;
  }
  return value;
}

/** HMAC-SHA256 в hex-строке нижнего регистра. */
export async function hmacSha256Hex(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Подпись структуры уведомления. */
export async function signPayload(
  data: Record<string, PhpValue>,
  secret: string,
): Promise<string> {
  // Продамус исключает поле signature из подписываемых данных — в вебхуке подпись
  // приходит заголовком, но защищаемся и от варианта с полем в теле.
  const { signature: _drop, ...rest } = data;
  return await hmacSha256Hex(canonicalJson(rest), secret);
}

/** Регистронезависимое сравнение за постоянное время. */
export async function verifySignature(
  data: Record<string, PhpValue>,
  sign: string | null,
  secret: string,
): Promise<boolean> {
  if (!sign) return false;
  const expected = await signPayload(data, secret);
  return timingSafeEqual(expected, sign.toLowerCase());
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
