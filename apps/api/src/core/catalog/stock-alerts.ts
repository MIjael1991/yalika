/**
 * Alertas de inventario de productos vendibles (solo lectura, sin IA y sin internet).
 *
 * Es una función pura: el asistente del negocio puede llamarla tal cual. Reglas:
 * - Agotado: se controla inventario y no queda nada.
 * - Por agotarse: queda poco (igual o menos que el aviso del producto).
 * - Se agota pronto: al ritmo de venta de los últimos 90 días, alcanza para pocos días.
 * - Resagado: hay existencia y no se ha vendido nada en los últimos N días.
 * - Antigüedad: días desde la última entrada de mercancía (o desde que se creó).
 *   Sirve para ver lo nuevo y lo viejo, y para no dejar rezagado lo que llegó antes.
 * - Fecha límite (opcional): el negocio puede poner hasta cuándo conviene vender o
 *   retirar un producto; avisa unos días antes y después de la fecha.
 */

export type StockAlertSettings = {
  /** Días sin vender para considerar un producto resagado. */
  slowDays: number;
  /** Días desde la última entrada para considerar mercancía nueva. */
  newDays: number;
  /** Días desde la última entrada para considerar mercancía vieja. */
  agedDays: number;
  /** Aviso de "se agota pronto" cuando la existencia alcanza para menos días que esto. */
  coverDays: number;
  /** Cuántos días antes de la fecha límite se avisa. */
  deadlineWarnDays: number;
};

export const DEFAULT_STOCK_ALERT_SETTINGS: StockAlertSettings = {
  slowDays: 45,
  newDays: 14,
  agedDays: 90,
  coverDays: 7,
  deadlineWarnDays: 14,
};

export type StockAlertProduct = {
  id: string;
  name: string;
  sku: string | null;
  catalogId: string | null;
  categoryName: string | null;
  trackInventory: boolean;
  /** Existencia total (suma de tallas activas, o el stock del producto). */
  stock: number;
  lowStockAt: number;
  createdAt: Date;
  /** Fecha límite opcional para vender o retirar. */
  deadlineAt: Date | null;
  lastEntryAt: Date | null;
  lastSaleAt: Date | null;
  /** Piezas vendidas en los últimos 90 días. */
  sold90: number;
};

export type AgeBucket = 'new' | 'recent' | 'old' | 'very_old';

export type StockAlertKind =
  | 'out'
  | 'low'
  | 'soon_out'
  | 'slow'
  | 'deadline_passed'
  | 'deadline_soon';

export type StockAlertItem = {
  id: string;
  name: string;
  sku: string | null;
  catalogId: string | null;
  categoryName: string | null;
  stock: number;
  lowStockAt: number;
  /** Días desde la última entrada (o desde que se creó el producto). */
  ageDays: number;
  ageBucket: AgeBucket;
  /** Días desde la última venta; null si nunca se ha vendido. */
  daysSinceSale: number | null;
  sold90: number;
  /** Días que alcanza la existencia al ritmo de los últimos 90 días; null si no se vende. */
  coverDays: number | null;
  /** Días para la fecha límite (negativo: ya pasó); null si no tiene. */
  deadlineInDays: number | null;
  kinds: StockAlertKind[];
  /** Frase lista para mostrar o leer en voz alta. */
  message: string;
};

export type StockAlertReport = {
  settings: StockAlertSettings;
  generatedAt: string;
  totals: { products: number; withStock: number; withAlerts: number };
  out: StockAlertItem[];
  low: StockAlertItem[];
  soonOut: StockAlertItem[];
  slow: StockAlertItem[];
  deadline: StockAlertItem[];
  /** Todo lo que tiene existencia, del más viejo al más nuevo. */
  byAge: StockAlertItem[];
  newArrivals: StockAlertItem[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Días enteros transcurridos (nunca negativos). */
function daysBetween(from: Date, to: Date) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));
}

export const DEFAULT_ALERT_TIME_ZONE = 'America/Mexico_City';

export function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Días hasta una fecha límite, por día calendario. La fecha límite se guarda como un
 * día (AAAA-MM-DD, al mediodía UTC) y "hoy" se toma en la hora del negocio, así que a
 * las 8 de la noche en México todavía es el mismo día.
 */
export function daysUntil(deadline: Date, now: Date, timeZone: string) {
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(now)
    .split('-')
    .map(Number);
  const today = Date.UTC(year, month - 1, day) / DAY_MS;
  const target =
    Date.UTC(
      deadline.getUTCFullYear(),
      deadline.getUTCMonth(),
      deadline.getUTCDate(),
    ) / DAY_MS;
  return Math.round(target - today);
}

export function normalizeSettings(
  input: Partial<Record<keyof StockAlertSettings, unknown>> = {},
): StockAlertSettings {
  const pick = (key: keyof StockAlertSettings, min: number, max: number) => {
    const value = Number(input[key]);
    return Number.isInteger(value) && value >= min && value <= max
      ? value
      : DEFAULT_STOCK_ALERT_SETTINGS[key];
  };

  const settings = {
    slowDays: pick('slowDays', 7, 365),
    newDays: pick('newDays', 1, 90),
    agedDays: pick('agedDays', 14, 730),
    coverDays: pick('coverDays', 1, 60),
    deadlineWarnDays: pick('deadlineWarnDays', 1, 90),
  };

  // "Viejo" siempre debe ser más viejo que "nuevo".
  if (settings.agedDays <= settings.newDays) {
    settings.agedDays = Math.max(
      settings.newDays + 1,
      DEFAULT_STOCK_ALERT_SETTINGS.agedDays,
    );
  }

  return settings;
}

function ageBucket(ageDays: number, settings: StockAlertSettings): AgeBucket {
  if (ageDays <= settings.newDays) return 'new';
  if (ageDays <= settings.slowDays) return 'recent';
  if (ageDays <= settings.agedDays) return 'old';
  return 'very_old';
}

function describe(item: Omit<StockAlertItem, 'message'>): string {
  const parts: string[] = [];

  if (item.kinds.includes('out')) parts.push('Agotado');
  else if (item.kinds.includes('low'))
    parts.push(`Quedan ${item.stock} (aviso en ${item.lowStockAt})`);

  if (item.kinds.includes('soon_out') && item.coverDays !== null)
    parts.push(
      `al ritmo actual alcanza para ${item.coverDays} ${item.coverDays === 1 ? 'día' : 'días'}`,
    );

  if (item.kinds.includes('slow'))
    parts.push(
      item.daysSinceSale === null
        ? `nunca se ha vendido (lleva ${item.ageDays} días en inventario)`
        : `lleva ${item.daysSinceSale} días sin venderse`,
    );

  if (item.kinds.includes('deadline_passed') && item.deadlineInDays !== null)
    parts.push(
      `pasó su fecha límite hace ${Math.abs(item.deadlineInDays)} ${Math.abs(item.deadlineInDays) === 1 ? 'día' : 'días'} y aún quedan ${item.stock}`,
    );
  else if (item.kinds.includes('deadline_soon') && item.deadlineInDays !== null)
    parts.push(
      item.deadlineInDays === 0
        ? `su fecha límite es hoy y quedan ${item.stock}`
        : `su fecha límite es en ${item.deadlineInDays} ${item.deadlineInDays === 1 ? 'día' : 'días'} y quedan ${item.stock}`,
    );

  const text = parts.join('; ');
  return `${item.name}: ${text.charAt(0).toUpperCase()}${text.slice(1)}`.replace(
    /: $/,
    '',
  );
}

export function buildStockAlerts(
  products: StockAlertProduct[],
  settingsInput: Partial<Record<keyof StockAlertSettings, unknown>> = {},
  now: Date = new Date(),
  timeZone: string = DEFAULT_ALERT_TIME_ZONE,
): StockAlertReport {
  const settings = normalizeSettings(settingsInput);
  const report: StockAlertReport = {
    settings,
    generatedAt: now.toISOString(),
    totals: { products: 0, withStock: 0, withAlerts: 0 },
    out: [],
    low: [],
    soonOut: [],
    slow: [],
    deadline: [],
    byAge: [],
    newArrivals: [],
  };

  for (const product of products) {
    if (!product.trackInventory) continue;
    report.totals.products += 1;

    const stock = Math.max(0, product.stock);
    const hasStock = stock > 0;
    const entryDate = product.lastEntryAt ?? product.createdAt;
    const ageDays = daysBetween(entryDate, now);
    const daysSinceSale = product.lastSaleAt
      ? daysBetween(product.lastSaleAt, now)
      : null;

    // Ritmo de venta: ventana de hasta 90 días, pero no más larga que la vida del producto.
    const windowDays = Math.min(
      90,
      Math.max(14, daysBetween(product.createdAt, now)),
    );
    const dailyRate = product.sold90 > 0 ? product.sold90 / windowDays : 0;
    const coverDays =
      hasStock && dailyRate > 0 ? Math.floor(stock / dailyRate) : null;
    const deadlineInDays = product.deadlineAt
      ? daysUntil(product.deadlineAt, now, timeZone)
      : null;

    const kinds: StockAlertKind[] = [];

    if (!hasStock) {
      kinds.push('out');
    } else if (stock <= product.lowStockAt) {
      kinds.push('low');
    } else if (coverDays !== null && coverDays < settings.coverDays) {
      kinds.push('soon_out');
    }

    if (hasStock) {
      // Los días sin vender se cuentan desde lo más reciente entre la última venta y la
      // última entrada: si estuvo agotado y se repuso, el reloj empieza de nuevo, y lo
      // recién llegado todavía no tuvo oportunidad de venderse.
      const idleDays =
        daysSinceSale === null ? ageDays : Math.min(daysSinceSale, ageDays);
      if (idleDays >= settings.slowDays) kinds.push('slow');

      if (deadlineInDays !== null) {
        if (deadlineInDays < 0) kinds.push('deadline_passed');
        else if (deadlineInDays <= settings.deadlineWarnDays)
          kinds.push('deadline_soon');
      }
    }

    const base = {
      id: product.id,
      name: product.name,
      sku: product.sku,
      catalogId: product.catalogId,
      categoryName: product.categoryName,
      stock,
      lowStockAt: product.lowStockAt,
      ageDays,
      ageBucket: ageBucket(ageDays, settings),
      daysSinceSale,
      sold90: product.sold90,
      coverDays,
      deadlineInDays,
      kinds,
    };
    const item: StockAlertItem = { ...base, message: describe(base) };

    if (hasStock) {
      report.totals.withStock += 1;
      report.byAge.push(item);
      if (item.ageDays <= settings.newDays) report.newArrivals.push(item);
    }

    if (kinds.length > 0) report.totals.withAlerts += 1;
    if (kinds.includes('out')) report.out.push(item);
    if (kinds.includes('low')) report.low.push(item);
    if (kinds.includes('soon_out')) report.soonOut.push(item);
    if (kinds.includes('slow')) report.slow.push(item);
    if (kinds.includes('deadline_passed') || kinds.includes('deadline_soon'))
      report.deadline.push(item);
  }

  const byName = (a: StockAlertItem, b: StockAlertItem) =>
    a.name.localeCompare(b.name, 'es');

  report.out.sort(byName);
  report.low.sort((a, b) => a.stock - b.stock || byName(a, b));
  report.soonOut.sort(
    (a, b) => (a.coverDays ?? 0) - (b.coverDays ?? 0) || byName(a, b),
  );
  report.slow.sort(
    (a, b) =>
      (b.daysSinceSale ?? b.ageDays) - (a.daysSinceSale ?? a.ageDays) ||
      byName(a, b),
  );
  report.deadline.sort(
    (a, b) => (a.deadlineInDays ?? 0) - (b.deadlineInDays ?? 0) || byName(a, b),
  );
  report.byAge.sort((a, b) => b.ageDays - a.ageDays || byName(a, b));
  report.newArrivals.sort((a, b) => a.ageDays - b.ageDays || byName(a, b));

  return report;
}
