/**
 * Atajos de la caja: "3x", "x3", "3*" para llevar varias piezas, y los productos
 * que más se venden en esa caja para tenerlos a un toque (frutas, pan suelto, etc.).
 */
export type QuickEntry = {
  /** Piezas pedidas (1 a 999). */
  quantity: number;
  /** Lo que queda para buscar; vacío significa "aplica al siguiente producto". */
  term: string;
};

const MAX_QUANTITY = 999;

function validQuantity(value: string): number | null {
  const quantity = Number(value);
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_QUANTITY ? quantity : null;
}

/**
 * "3x manzana", "3 x manzana", "3*manzana", "manzana x3", "manzana*3" o "3x" solo.
 * Devuelve null si el texto no trae multiplicador. Un código de barras (solo números) nunca lo trae.
 */
export function parseQuickEntry(text: string): QuickEntry | null {
  const value = text.trim();
  if (!value) return null;

  const leading = /^(\d{1,3})\s*[x×*]\s*(.*)$/i.exec(value);
  if (leading) {
    const quantity = validQuantity(leading[1]);
    if (quantity) return { quantity, term: leading[2].trim() };
  }

  const trailing = /^(.*\S)\s+[x×]\s*(\d{1,3})$/i.exec(value) ?? /^(.*\S)\s*\*\s*(\d{1,3})$/.exec(value);
  if (trailing) {
    const quantity = validQuantity(trailing[2]);
    if (quantity) return { quantity, term: trailing[1].trim() };
  }

  return null;
}

export type Frequency = Record<string, number>;

const MAX_TRACKED = 200;

/** Cuenta una venta más del producto; se queda con los más usados para no crecer sin fin. */
export function bumpFrequency(frequency: Frequency, key: string, by = 1): Frequency {
  const next: Frequency = { ...frequency, [key]: (frequency[key] ?? 0) + by };
  const keys = Object.keys(next);
  if (keys.length <= MAX_TRACKED) return next;

  keys.sort((left, right) => next[right] - next[left]);
  return Object.fromEntries(keys.slice(0, MAX_TRACKED).map((item) => [item, next[item]]));
}

/** Lo guardado en el navegador puede venir dañado: solo se aceptan números positivos. */
export function sanitizeFrequency(raw: unknown): Frequency {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const clean: Frequency = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) clean[key] = value;
  }
  return clean;
}

/** Las llaves más vendidas que todavía existen en el catálogo, de mayor a menor. */
export function topFrequent(frequency: Frequency, available: Set<string>, limit = 8): string[] {
  return Object.keys(frequency)
    .filter((key) => available.has(key))
    .sort((left, right) => frequency[right] - frequency[left] || left.localeCompare(right))
    .slice(0, limit);
}
