/**
 * Ventas en espera y "repetir última venta" de la caja.
 * Solo se guardan llaves de producto y cantidades; al retomar se vuelven a leer
 * precios y existencias vigentes del catálogo, nunca los de cuando se pausó.
 */
export type HeldLine = { key: string; quantity: number };

export type HeldSale = {
  id: string;
  savedAt: number;
  lines: HeldLine[];
};

export const MAX_HELD_SALES = 8;
/** Una venta olvidada no debe sobrevivir al turno: 12 horas. */
export const HELD_SALE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_LINES = 200;

export function linesFromCart(cart: Array<{ key: string; quantity: number }>): HeldLine[] {
  return cart
    .filter((item) => item.key && Number.isInteger(item.quantity) && item.quantity > 0)
    .map((item) => ({ key: item.key, quantity: item.quantity }));
}

/** Lo guardado en el navegador puede venir dañado: solo se aceptan líneas válidas. */
export function sanitizeLines(raw: unknown): HeldLine[] {
  if (!Array.isArray(raw)) return [];
  const lines: HeldLine[] = [];
  for (const entry of raw.slice(0, MAX_LINES)) {
    if (!entry || typeof entry !== 'object') continue;
    const { key, quantity } = entry as Record<string, unknown>;
    if (typeof key === 'string' && key && typeof quantity === 'number' && Number.isInteger(quantity) && quantity > 0 && quantity <= 9999) {
      lines.push({ key, quantity });
    }
  }
  return lines;
}

export function sanitizeHeld(raw: unknown, now: number): HeldSale[] {
  if (!Array.isArray(raw)) return [];
  const sales: HeldSale[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const { id, savedAt, lines } = entry as Record<string, unknown>;
    if (typeof id !== 'string' || !id || typeof savedAt !== 'number' || !Number.isFinite(savedAt)) continue;
    if (now - savedAt > HELD_SALE_TTL_MS || savedAt > now + 60_000) continue;
    const clean = sanitizeLines(lines);
    if (clean.length === 0) continue;
    sales.push({ id, savedAt, lines: clean });
  }
  return sales.sort((a, b) => b.savedAt - a.savedAt).slice(0, MAX_HELD_SALES);
}

/** La más reciente primero; si ya hay el máximo se descarta la más vieja. */
export function addHeld(list: HeldSale[], sale: HeldSale): HeldSale[] {
  return [sale, ...list.filter((item) => item.id !== sale.id)].slice(0, MAX_HELD_SALES);
}

export function removeHeld(list: HeldSale[], id: string): HeldSale[] {
  return list.filter((item) => item.id !== id);
}

export type RestoreResult<T> = {
  items: Array<{ option: T; quantity: number }>;
  /** Productos que ya no existen en esta caja. */
  missing: number;
  /** Nombres de productos agotados (no se agregan). */
  soldOut: string[];
  /** Nombres de productos cuya cantidad se bajó a la existencia actual. */
  reduced: string[];
};

export function restoreLines<T extends { key: string; productName: string; trackInventory: boolean; stock: number }>(
  lines: HeldLine[],
  options: T[],
): RestoreResult<T> {
  const byKey = new Map(options.map((option) => [option.key, option]));
  const result: RestoreResult<T> = { items: [], missing: 0, soldOut: [], reduced: [] };
  const merged = new Map<string, number>();

  for (const line of lines) merged.set(line.key, (merged.get(line.key) ?? 0) + line.quantity);

  for (const [key, wanted] of merged) {
    const option = byKey.get(key);
    if (!option) {
      result.missing += 1;
      continue;
    }
    if (option.trackInventory && option.stock <= 0) {
      result.soldOut.push(option.productName);
      continue;
    }
    const quantity = option.trackInventory ? Math.min(wanted, option.stock) : wanted;
    if (quantity < wanted) result.reduced.push(option.productName);
    result.items.push({ option, quantity });
  }

  return result;
}
