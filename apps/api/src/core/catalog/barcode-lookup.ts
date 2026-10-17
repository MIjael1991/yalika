/**
 * Sugerencia de nombre para un código de barras comercial desconocido, con la base
 * pública Open Food Facts. Solo es una ayuda para dar de alta: la persona siempre
 * revisa el nombre y pone su propio precio. Si no hay internet o no existe, no pasa nada.
 */
export type PublicBarcodeSuggestion = {
  found: boolean;
  name?: string;
  source?: 'openfoodfacts';
};

type FetchLike = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string> },
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

const CODE = /^\d{8,14}$/;

export async function lookupOpenFoodFacts(
  code: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  timeoutMs = 3500,
): Promise<PublicBarcodeSuggestion> {
  const value = code.trim();
  if (!CODE.test(value)) return { found: false };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(
      `https://world.openfoodfacts.org/api/v2/product/${value}.json?fields=product_name,product_name_es,brands,quantity`,
      { signal: controller.signal, headers: { 'User-Agent': 'Yalika-POS/1.0' } },
    );
    if (!response.ok) return { found: false };

    const payload = (await response.json()) as {
      status?: number;
      product?: {
        product_name?: string;
        product_name_es?: string;
        brands?: string;
        quantity?: string;
      };
    };
    const product = payload?.status === 1 ? payload.product : undefined;
    const base = (product?.product_name_es || product?.product_name || '').trim();
    if (!product || !base) return { found: false };

    const brand = (product.brands ?? '').split(',')[0]?.trim();
    const quantity = (product.quantity ?? '').trim();
    let name = base;
    if (brand && !name.toLowerCase().includes(brand.toLowerCase())) name = `${brand} ${name}`;
    if (quantity && !name.toLowerCase().includes(quantity.toLowerCase())) name = `${name} ${quantity}`;

    return { found: true, name: name.slice(0, 160), source: 'openfoodfacts' };
  } catch {
    return { found: false };
  } finally {
    clearTimeout(timer);
  }
}
