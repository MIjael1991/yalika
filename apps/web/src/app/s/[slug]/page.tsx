import { SiteView, type Site, type Product, type Promotion, type StoreData } from './site-view';
import { ShowcaseStorefront } from './showcase-storefront';
import { ThemedStorefront } from './themed-storefront';
import { PRESET_BY_ID } from './template-presets';
const apiUrl = (
  process.env.YALIKA_API_URL ??
  'http://localhost:3000'
).replace(/\/+$/, '');

async function getApi<T>(path: string) {
  try {
    const response = await fetch(
      `${apiUrl}/${path}`,
      {
        cache: 'no-store',
      },
    );

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function getStoreData(
  slug: string,
): Promise<StoreData> {
  const site = await getApi<Site>(
    `site/public/${encodeURIComponent(slug)}`,
  );

  if (!site) {
    return {
      site: null,
      products: [],
      promotions: [],
    };
  }

  const [products, promotions] =
    await Promise.all([
      getApi<Product[]>(
        `catalog/public/company/${encodeURIComponent(site.company.id)}`,
      ),
      getApi<Promotion[]>(
        `promotion/public/company/${encodeURIComponent(site.company.id)}`,
      ),
    ]);

  return {
    site,
    products: (products ?? []).filter(
      (product) =>
        product.status === 'active' && (!site.catalogId || product.catalogId === site.catalogId),
    ),
    promotions: promotions ?? [],
  };
}

export default async function PublicSitePage({params}:{params:Promise<{slug:string}>}) {
  const {slug}=await params;
  const data = await getStoreData(slug);

  if (data.site && PRESET_BY_ID[data.site.template]) {
    return <ThemedStorefront site={data.site} products={data.products} promotions={data.promotions} />;
  }

  if (
    data.site &&
    (data.site.template === 'yaleka_cherry_nails' ||
      data.site.template === 'yaleka_luna_boutique' ||
      data.site.template === 'yaleka_prisma_papeleria')
  ) {
    return (
      <ShowcaseStorefront
        site={data.site}
        products={data.products}
        promotions={data.promotions}
      />
    );
  }

  return <SiteView {...data} />;
}
