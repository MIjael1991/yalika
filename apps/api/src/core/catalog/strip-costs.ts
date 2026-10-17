/**
 * El cajero vende y cobra: no necesita ni debe ver cuánto le cuesta la
 * mercancía al negocio. Quita los costos de lo que se le devuelve (producto,
 * tallas y código de barras). El administrador recibe todo sin cambios.
 */
const COST_KEYS = new Set(['unitCost', 'averageCost', 'costPerPack']);

export function stripCosts<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => stripCosts(entry)) as unknown as T;
  }

  if (value instanceof Date) {
    return value;
  }

  if (value !== null && typeof value === 'object') {
    const clean: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(value)) {
      if (COST_KEYS.has(key)) continue;
      clean[key] = stripCosts(entry);
    }

    return clean as T;
  }

  return value;
}

export function forRole<T>(value: T, cashier: boolean): T {
  return cashier ? stripCosts(value) : value;
}
