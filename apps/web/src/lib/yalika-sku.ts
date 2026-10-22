// Códigos (SKU) del catálogo: sugerencia con ejemplo claro y revisión de repetidos.
// Función pura (sin React) para poder probarla.

export type SkuOwner = { name: string; sku: string | null; variants: Array<{ name: string; sku: string | null }> };

const norm = (value: string) => value.trim().toLocaleLowerCase('es-MX');

/** Letras iniciales (sin acentos) para el prefijo: "Boutique Luna" → "BOU". */
export function skuPrefix(source: string) {
  const letters = source.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]/g, '').toUpperCase();
  return letters.slice(0, 3).padEnd(3, 'X').slice(0, 3);
}

/** Todos los códigos ya usados (productos y tallas), en minúsculas, con el nombre de quien lo usa. */
export function takenSkus(products: SkuOwner[]) {
  const taken = new Map<string, string>();
  for (const product of products) {
    if (product.sku?.trim()) taken.set(norm(product.sku), product.name);
    for (const variant of product.variants) {
      if (variant.sku?.trim()) taken.set(norm(variant.sku), `${product.name} (${variant.name})`);
    }
  }
  return taken;
}

/** Nombre de quien ya usa el código o alguno de los de sus tallas; null si está libre. */
export function skuClash(sku: string, sizes: string[], taken: Map<string, string>) {
  const base = sku.trim();
  if (!base) return null;
  const candidates = [base, ...sizes.map((size) => `${base}-${size}`)];
  for (const candidate of candidates) {
    const owner = taken.get(norm(candidate));
    if (owner) return { code: candidate, owner };
  }
  return null;
}

/** Siguiente código libre: PREFIJO-001, PREFIJO-002… (revisa también PREFIJO-001-M, etc.). */
export function suggestSku(source: string, sizes: string[], taken: Map<string, string>) {
  const prefix = skuPrefix(source);
  for (let n = 1; n < 100000; n += 1) {
    const code = `${prefix}-${String(n).padStart(3, '0')}`;
    if (!skuClash(code, sizes, taken)) return code;
  }
  return `${prefix}-${Date.now()}`;
}
