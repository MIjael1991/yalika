/**
 * Cómo se ve el inventario en la página pública. Un solo lugar para todas las plantillas.
 * `stock` que llega del API ya es lo que se puede vender: existencia menos lo apartado.
 */
export const LOW_STOCK_LIMIT = 5;

type StockVariant = { status?: string; stock: number };
export type StockSource = {
  trackInventory: boolean;
  stock: number;
  variants?: StockVariant[];
};

export type StockInfo = {
  /** untracked: no se controla inventario (servicios, por encargo); nunca se marca agotado. */
  state: 'untracked' | 'out' | 'low' | 'ok';
  available: number;
  label: string | null;
};

export function availableUnits(product: Pick<StockSource, 'stock' | 'variants'>) {
  const variants = (product.variants ?? []).filter((variant) => (variant.status ?? 'active') === 'active');
  const total = variants.length > 0 ? variants.reduce((sum, variant) => sum + variant.stock, 0) : product.stock;
  return Math.max(Math.floor(Number.isFinite(total) ? total : 0), 0);
}

export function stockInfo(product: StockSource): StockInfo {
  const available = availableUnits(product);
  if (!product.trackInventory) return { state: 'untracked', available, label: null };
  if (available <= 0) return { state: 'out', available: 0, label: 'Agotado' };
  if (available <= LOW_STOCK_LIMIT) {
    return { state: 'low', available, label: available === 1 ? 'Queda 1' : `Quedan ${available}` };
  }
  return { state: 'ok', available, label: 'Disponible' };
}

export function isSoldOut(product: StockSource) {
  return stockInfo(product).state === 'out';
}
