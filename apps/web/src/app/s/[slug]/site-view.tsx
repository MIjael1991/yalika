import { ProductGallery } from './product-gallery';
import { CatalogBrowser } from './catalog-browser';
import { SiteExtraSections } from './site-extra-sections';

type SiteSection = {
  id: string;
  type: string;
  title: string | null;
  enabled: boolean;
  sortOrder: number;
  layout: string;
  content?: unknown;
};

export type Site = {
  catalogId?: string | null;
  id: string;
  name: string;
  slug: string;
  template: string;
  status: string;
  primaryColor: string | null;
  accentColor: string | null;
  backgroundType: string;
  backgroundValue: string | null;
  logoUrl: string | null;
  heroImageUrl: string | null;
  heroTitle: string | null;
  heroSubtitle: string | null;
  heroButtonText: string | null;
  heroButtonUrl: string | null;
  announcementText: string | null;
  whatsappPhone: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
  extraLinkLabel: string | null;
  extraLinkUrl: string | null;
  company: {
    id: string;
    name: string;
  };
  sections: SiteSection[];
};

export type Product = {
  catalogId?: string | null;
  id: string;
  name: string;
  description: string | null;
  type: string;
  price: number;
  compareAtPrice: number | null;
  trackInventory: boolean;
  stock: number;
  status: string;
  featured: boolean;
  category: {
    id: string;
    name: string;
  } | null;
  images: Array<{
    id: string;
    url: string;
    isPrimary: boolean;
    sortOrder: number;
  }>;
  variants: Array<{
    id: string;
    name: string;
    price: number | null;
    stock: number;
    status: string;
  }>;
};

export type Promotion = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  discountValue: number | null;
  specialPrice: number | null;
  minimumPurchase: number | null;
  buyQuantity: number | null;
  getQuantity: number | null;
  rewardDescription: string | null;
  imageUrl: string | null;
  featured: boolean;
  scope: string;
  products: Array<{
    productId: string;
    product: {
      id: string;
      name: string;
    };
  }>;
};

export type StoreData = {
  site: Site | null;
  products: Product[];
  promotions: Promotion[];
};

const money = new Intl.NumberFormat(
  'es-MX',
  {
    style: 'currency',
    currency: 'MXN',
  },
);

function getPromotionLabel(
  promotion: Promotion,
) {
  if (
    promotion.type === 'percentage' &&
    promotion.discountValue
  ) {
    return `${promotion.discountValue}% menos`;
  }

  if (
    promotion.type === 'fixed' &&
    promotion.discountValue
  ) {
    return `${money.format(promotion.discountValue)} menos`;
  }

  if (
    promotion.type === 'special_price' &&
    promotion.specialPrice !== null
  ) {
    return `Ahora ${money.format(promotion.specialPrice)}`;
  }

  if (
    promotion.type === 'buy_x_get_y' &&
    promotion.buyQuantity &&
    promotion.getQuantity
  ) {
    return `Compra ${promotion.buyQuantity} + ${promotion.getQuantity} gratis`;
  }

  return 'Promoción especial';
}

function safeExternalUrl(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);

    return url.protocol === 'http:' ||
      url.protocol === 'https:'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function getWhatsappUrl(phone: string | null) {
  const digits = phone?.replace(/\D/g, '') ?? '';

  if (!digits) {
    return null;
  }

  const international =
    digits.length === 10
      ? `52${digits}`
      : digits;

  return `https://wa.me/${international}`;
}

function getStoreLanguage(
  products: Product[],
  template: string,
) {
  const counts = products.reduce<Record<string, number>>(
    (values, product) => ({
      ...values,
      [product.type]: (values[product.type] ?? 0) + 1,
    }),
    {},
  );
  const foodCount = (counts.food ?? 0) + (counts.beverage ?? 0);

  if (foodCount > products.length / 2) {
    return {
      navLabel: 'Menú',
      title: 'Nuestro menú',
      featuredTitle: 'Favoritos del menú',
      itemLabel: 'el menú',
    };
  }

  if ((counts.service ?? 0) > products.length / 2) {
    return {
      navLabel: 'Servicios',
      title: 'Nuestros servicios',
      featuredTitle: 'Servicios recomendados',
      itemLabel: 'los servicios',
    };
  }

  if ((counts.design ?? 0) > products.length / 2) {
    return {
      navLabel: 'Diseños',
      title: 'Nuestros diseños',
      featuredTitle: 'Diseños destacados',
      itemLabel: 'los diseños',
    };
  }

  if (
    template === 'boutique_elegant' ||
    template === 'artisan_warm'
  ) {
    return {
      navLabel: 'Colección',
      title: 'Nuestra colección',
      featuredTitle: 'Piezas destacadas',
      itemLabel: 'la colección',
    };
  }

  return {
    navLabel: 'Catálogo',
    title: 'Nuestro catálogo',
    featuredTitle: 'Lo más recomendado',
    itemLabel: 'el catálogo',
  };
}

function ProductGrid({
  products,
  variant,
  accentColor,
}: {
  products: Product[];
  variant: string;
  accentColor: string;
}) {
  const minimal =
    variant === 'minimal_catalog';
  const social =
    variant === 'social_vibrant';

  if (products.length === 0) {
    return (
      <div
        className={`rounded-3xl border border-dashed p-10 text-center text-sm ${
          minimal
            ? 'border-slate-300 text-slate-500'
            : 'border-white/20 text-white/60'
        }`}
      >
        Muy pronto encontrarás aquí nuestros productos.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((product) => {
        const activeVariants = product.variants.filter(
          (item) => item.status === 'active',
        );
        const hasVariants = product.variants.length > 0;
        const totalStock = hasVariants
          ? activeVariants.reduce(
              (total, item) => total + item.stock,
              0,
            )
          : product.stock;
        const availablePrices = activeVariants.map(
          (item) => item.price ?? product.price,
        );
        const displayedPrice =
          availablePrices.length > 0
            ? Math.min(...availablePrices)
            : product.price;
        const hasDifferentPrices = availablePrices.some(
          (price) => price !== displayedPrice,
        );

        return (
          <article
            key={product.id}
            className={`group overflow-hidden ${
              minimal
                ? 'border-b border-slate-200 bg-white pb-5'
                : social
                  ? 'rounded-[2rem] bg-white p-2 text-slate-950 shadow-xl shadow-purple-950/20'
                  : 'rounded-3xl border border-white/10 bg-white/10 p-2 backdrop-blur'
            }`}
          >
            <div
              className={`relative aspect-[4/5] overflow-hidden bg-gradient-to-br from-slate-200 to-slate-400 ${
                minimal
                  ? ''
                  : 'rounded-[1.4rem]'
              }`}
            >
              {product.images.length > 0 ? (
                <ProductGallery
                  images={product.images}
                  productName={product.name}
                />
              ) : (
                <div className="flex h-full items-center justify-center px-4 text-center text-xs text-slate-500">
                  {product.name}
                </div>
              )}
              {product.compareAtPrice ? (
                <span className="absolute left-3 top-3 rounded-full bg-red-500 px-2.5 py-1 text-[10px] font-bold text-white">
                  Oferta
                </span>
              ) : null}
            </div>
            <div
              className={
                minimal
                  ? 'pt-4'
                  : 'px-2 pb-2 pt-3'
              }
            >
              <p className="text-sm font-semibold sm:text-base">
                {product.name}
              </p>
              {product.category ? (
                <p
                  className={`mt-1 text-[11px] ${
                    minimal
                      ? 'text-slate-400'
                      : social
                        ? 'text-slate-500'
                        : 'text-white/50'
                  }`}
                >
                  {product.category.name}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-baseline gap-2">
                <span
                  className="font-bold"
                  style={{
                    color: accentColor,
                  }}
                >
                  {hasDifferentPrices ? 'Desde ' : ''}
                  {money.format(displayedPrice)}
                </span>
                {product.compareAtPrice ? (
                  <span
                    className={`text-xs line-through ${
                      minimal || social
                        ? 'text-slate-400'
                        : 'text-white/40'
                    }`}
                  >
                    {money.format(
                      product.compareAtPrice,
                    )}
                  </span>
                ) : null}
              </div>
              {product.trackInventory ? (
                <p
                  className={`mt-2 text-[11px] ${
                    totalStock > 0
                      ? minimal || social
                        ? 'text-emerald-600'
                        : 'text-emerald-300'
                      : 'text-red-400'
                  }`}
                >
                  {totalStock > 0
                    ? hasVariants
                      ? `${totalStock} disponibles entre opciones`
                      : `${totalStock} disponibles`
                    : 'Agotado'}
                </p>
              ) : null}
              {activeVariants.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {activeVariants.map((item) => (
                    <span
                      key={item.id}
                      className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${
                        item.stock > 0
                          ? minimal || social
                            ? 'border-slate-300 text-slate-600'
                            : 'border-white/20 text-white/75'
                          : minimal || social
                            ? 'border-red-200 text-red-400 line-through'
                            : 'border-red-300/20 text-red-300/60 line-through'
                      }`}
                    >
                      {item.name}
                      {' · '}
                      {item.stock > 0
                        ? item.stock
                        : 'Agotado'}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function Promotions({
  promotions,
  variant,
  accentColor,
}: {
  promotions: Promotion[];
  variant: string;
  accentColor: string;
}) {
  if (promotions.length === 0) {
    return null;
  }

  const minimal =
    variant === 'minimal_catalog';

  return (
    <section
      id="promotions"
      className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16"
    >
      <p
        className={`text-xs font-bold uppercase tracking-[0.28em] ${
          minimal
            ? 'text-slate-500'
            : 'text-white/60'
        }`}
      >
        Aprovecha hoy
      </p>
      <h2 className="mt-2 text-3xl font-bold sm:text-4xl">
        Promociones
      </h2>
      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {promotions.map((promotion) => (
          <article
            key={promotion.id}
            className={`relative min-h-64 overflow-hidden rounded-3xl border p-6 ${
              minimal
                ? 'border-slate-200 bg-slate-100'
                : 'border-white/10 bg-black/20'
            }`}
          >
            {promotion.imageUrl ? (
              <img
                src={promotion.imageUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-30"
              />
            ) : null}
            <div className="relative flex min-h-52 flex-col justify-between">
              <span
                className="w-fit rounded-full px-3 py-1.5 text-xs font-bold"
                style={{
                  backgroundColor: accentColor,
                  color: minimal
                    ? '#ffffff'
                    : '#111827',
                }}
              >
                {getPromotionLabel(promotion)}
              </span>
              <div>
                <h3 className="text-2xl font-bold">
                  {promotion.title}
                </h3>
                {promotion.description ? (
                  <p
                    className={`mt-2 text-sm leading-6 ${
                      minimal
                        ? 'text-slate-600'
                        : 'text-white/70'
                    }`}
                  >
                    {promotion.description}
                  </p>
                ) : null}
                <p
                  className={`mt-3 text-xs font-semibold ${
                    minimal
                      ? 'text-slate-500'
                      : 'text-white/60'
                  }`}
                >
                  {promotion.scope === 'selected_products'
                    ? `Aplica en: ${promotion.products
                        .slice(0, 3)
                        .map(
                          (item) =>
                            item.product.name,
                        )
                        .join(', ')}${promotion.products.length > 3 ? ` y ${promotion.products.length - 3} más` : ''}`
                    : 'Aplica en toda la tienda'}
                </p>
                {promotion.minimumPurchase ? (
                  <p
                    className={`mt-2 text-xs font-bold ${
                      minimal
                        ? 'text-slate-700'
                        : 'text-amber-200'
                    }`}
                  >
                    Compra mínima: {money.format(promotion.minimumPurchase)}
                  </p>
                ) : null}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function SiteView({site, products, promotions}: StoreData) {
  if (!site) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
        <div className="text-center">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-cyan-400">
            YALEKA
          </p>
          <h1 className="mt-4 text-3xl font-semibold">
            Sitio no encontrado
          </h1>
        </div>
      </main>
    );
  }

  const variant = [
    'boutique_elegant',
    'social_vibrant',
    'minimal_catalog',
    'artisan_warm',
    'punk_rock',
    'dark_neon',
    'vacation_bright',
  ].includes(site.template)
    ? site.template
    : 'boutique_elegant';
  const storeLanguage = getStoreLanguage(
    products,
    variant,
  );
  // Destacados sólo cuando el propietario los marcó expresamente.
  const featuredProducts = products.filter((product) => product.featured).slice(0, 4);
  const minimal =
    variant === 'minimal_catalog';
  const social =
    variant === 'social_vibrant';
  const artisan =
    variant === 'artisan_warm';
  const punk = variant === 'punk_rock';
  const dark = variant === 'dark_neon';
  const vacation =
    variant === 'vacation_bright';
  const primaryColor =
    site.primaryColor ??
    (minimal ? '#f8fafc' : '#0c0a09');
  const accentColor =
    site.accentColor ??
    (minimal ? '#111827' : '#d6b46a');
  const heroStyle = site.heroImageUrl
    ? {
        backgroundImage: `linear-gradient(${minimal ? 'rgba(255,255,255,.18), rgba(255,255,255,.82)' : 'rgba(0,0,0,.2), rgba(0,0,0,.72)'}), url("${site.heroImageUrl}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : undefined;
  const whatsappUrl = getWhatsappUrl(
    site.whatsappPhone,
  );
  const socialLinks = [
    {
      label: 'Facebook',
      url: safeExternalUrl(site.facebookUrl),
    },
    {
      label: 'Instagram',
      url: safeExternalUrl(site.instagramUrl),
    },
    {
      label: 'TikTok',
      url: safeExternalUrl(site.tiktokUrl),
    },
    {
      label: site.extraLinkLabel || 'Más información',
      url: safeExternalUrl(site.extraLinkUrl),
    },
  ].filter(
    (link): link is { label: string; url: string } =>
      Boolean(link.url),
  );

  return (
    <main
      className={`min-h-screen pb-20 sm:pb-0 ${
        minimal
          ? 'text-slate-950'
          : 'text-white'
      }`}
      style={{
        background: social
          ? `linear-gradient(145deg, ${primaryColor}, #7e22ce 45%, #f97316)`
          : artisan
            ? `linear-gradient(145deg, ${primaryColor}, #78350f)`
            : punk
              ? `linear-gradient(145deg, ${primaryColor}, #18181b 55%, #450a0a)`
              : dark
                ? `radial-gradient(circle at top right, #4c1d95 0, ${primaryColor} 45%, #020617 100%)`
                : vacation
                  ? `linear-gradient(145deg, ${primaryColor}, #06b6d4 55%, #fbbf24)`
                  : primaryColor,
      }}
    >
      {site.announcementText ? (
        <div
          className="px-4 py-2.5 text-center text-xs font-bold sm:text-sm"
          style={{
            backgroundColor: accentColor,
            color: minimal ? '#ffffff' : '#111827',
          }}
        >
          {site.announcementText}
        </div>
      ) : null}
      <nav
        className={`sticky top-0 z-40 border-b px-4 backdrop-blur-xl sm:px-6 ${
          minimal
            ? 'border-slate-200 bg-white/85'
            : 'border-white/10 bg-black/25'
        }`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4">
          <a
            href="#top"
            className="flex min-w-0 items-center gap-3"
          >
            {site.logoUrl ? (
              <img
                src={site.logoUrl}
                alt={site.name}
                className="h-10 max-w-36 object-contain"
              />
            ) : (
              <span className="truncate font-bold tracking-[0.16em]">
                {site.name}
              </span>
            )}
          </a>
          <div className="flex items-center gap-4 text-xs font-semibold sm:text-sm">
            <a href="#top" className="hidden md:inline">
              Inicio
            </a>
            {promotions.length > 0 ? (
              <a href="#promotions" className="hidden sm:inline">
                Promociones
              </a>
            ) : null}
            {whatsappUrl || socialLinks.length > 0 ? (
              <a href="#contact" className="hidden sm:inline">
                Contacto
              </a>
            ) : null}
            <a
              href="#catalog"
              className="rounded-full px-4 py-2"
              style={{
                backgroundColor: accentColor,
                color: minimal
                  ? '#ffffff'
                  : '#111827',
              }}
            >
              {storeLanguage.navLabel}
            </a>
          </div>
        </div>
      </nav>

      <section
        id="top"
        className={`relative flex min-h-[78vh] items-end overflow-hidden px-4 py-14 sm:px-6 sm:py-20 ${
          minimal
            ? 'lg:items-center'
            : social
              ? 'items-center text-center'
              : ''
        }`}
        style={heroStyle}
      >
        {!site.heroImageUrl && social ? (
          <div className="absolute -right-24 top-16 h-80 w-80 rounded-full bg-yellow-300/30 blur-3xl" />
        ) : null}
        {!site.heroImageUrl && vacation ? (
          <>
            <div className="absolute -left-16 top-20 h-52 w-52 rounded-full bg-yellow-200/35 blur-2xl" />
            <div className="absolute -right-16 bottom-10 h-64 w-64 rounded-full bg-cyan-100/25 blur-3xl" />
          </>
        ) : null}
        <div
          className={`relative mx-auto w-full max-w-7xl ${
              social || vacation
              ? 'flex justify-center'
              : ''
          }`}
        >
          <div
            className={`max-w-3xl ${
              social || vacation
                ? 'rounded-[2.5rem] border border-white/20 bg-white/10 p-8 backdrop-blur sm:p-12'
                : minimal
                  ? 'rounded-3xl bg-white/80 p-7 shadow-2xl backdrop-blur sm:p-12'
                  : artisan
                    ? 'rounded-[3rem] border border-amber-200/20 bg-black/25 p-8 backdrop-blur sm:p-12'
                    : punk
                      ? 'border-l-4 border-red-500 bg-black/45 p-8 shadow-2xl backdrop-blur sm:p-12'
                      : dark
                        ? 'rounded-[2rem] border border-cyan-300/25 bg-slate-950/55 p-8 shadow-[0_0_60px_rgba(34,211,238,.15)] backdrop-blur sm:p-12'
                    : ''
            }`}
          >
            <p
              className={`text-xs font-bold uppercase tracking-[0.32em] ${
                minimal
                  ? 'text-slate-500'
                  : 'text-white/65'
              }`}
            >
              {site.company.name}
            </p>
            <h1
              className={`mt-5 text-5xl font-bold leading-[.95] tracking-tight sm:text-7xl ${
                variant ===
                'boutique_elegant'
                  ? 'font-serif'
                  : punk
                    ? 'uppercase italic'
                  : ''
              }`}
            >
              {site.heroTitle ?? site.name}
            </h1>
            {site.heroSubtitle ? (
              <p
                className={`mt-6 max-w-2xl text-base leading-7 sm:text-lg ${
                  minimal
                    ? 'text-slate-600'
                    : social || vacation
                      ? 'mx-auto text-white/85'
                      : 'text-white/70'
                }`}
              >
                {site.heroSubtitle}
              </p>
            ) : null}
            <a
              href={
                site.heroButtonUrl ??
                '#catalog'
              }
              className="mt-8 inline-flex rounded-full px-6 py-3 text-sm font-bold shadow-lg transition hover:-translate-y-0.5"
              style={{
                backgroundColor: accentColor,
                color: minimal
                  ? '#ffffff'
                  : '#111827',
              }}
            >
              {site.heroButtonText ??
                `Ver ${storeLanguage.navLabel.toLocaleLowerCase('es-MX')}`}
            </a>
          </div>
        </div>
      </section>

      <SiteExtraSections sections={site.sections} accentColor={accentColor} />

      {featuredProducts.length > 0 ? (
        <section
          id="featured"
          className={`px-4 py-12 sm:px-6 sm:py-16 ${
            minimal ? 'bg-slate-50' : 'bg-white/5'
          }`}
        >
          <div className="mx-auto max-w-7xl">
            <div className="mb-7 flex items-end justify-between gap-4">
              <div>
                <p
                  className={`text-xs font-bold uppercase tracking-[0.28em] ${
                    minimal ? 'text-slate-500' : 'text-white/60'
                  }`}
                >
                  Para conocer primero
                </p>
                <h2 className="mt-2 text-3xl font-bold sm:text-4xl">
                  {storeLanguage.featuredTitle}
                </h2>
              </div>
              {products.length > featuredProducts.length ? (
                <a
                  href="#catalog"
                  className="shrink-0 rounded-full border border-current/20 px-4 py-2 text-xs font-bold"
                >
                  Ver todo
                </a>
              ) : null}
            </div>
            <ProductGrid
              products={featuredProducts}
              variant={variant}
              accentColor={accentColor}
            />
          </div>
        </section>
      ) : null}

      <Promotions
        promotions={promotions}
        variant={variant}
        accentColor={accentColor}
      />

      <section
        id="catalog"
        className={`px-4 py-14 sm:px-6 sm:py-20 ${
          minimal
            ? 'bg-white'
            : 'bg-black/10'
        }`}
      >
        <div className="mx-auto max-w-7xl">
          <p
            className={`text-xs font-bold uppercase tracking-[0.28em] ${
              minimal
                ? 'text-slate-500'
                : 'text-white/60'
            }`}
          >
            Descubre
          </p>
          <div className="mb-8 mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="text-3xl font-bold sm:text-5xl">
              {storeLanguage.title}
            </h2>
            <p
              className={`text-sm ${
                minimal
                  ? 'text-slate-500'
                  : 'text-white/60'
              }`}
            >
              Existencias actualizadas por Yaleka
            </p>
          </div>
          <CatalogBrowser
            products={products}
            variant={variant}
            accentColor={accentColor}
            itemLabel={storeLanguage.itemLabel}
            whatsappUrl={whatsappUrl}
            businessName={site.name}
          />
        </div>
      </section>

      <footer
        id="contact"
        className={`border-t px-4 py-8 text-center text-xs sm:px-6 ${
          minimal
            ? 'border-slate-200 bg-white text-slate-500'
            : 'border-white/10 text-white/50'
        }`}
      >
        <p className="text-sm font-bold">{site.name}</p>
        {whatsappUrl || socialLinks.length > 0 ? (
          <div className="mx-auto mt-5 flex max-w-2xl flex-wrap justify-center gap-2">
            {whatsappUrl ? (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-current/20 px-4 py-2 font-semibold"
              >
                WhatsApp
              </a>
            ) : null}
            {socialLinks.map((link) => (
              <a
                key={`${link.label}-${link.url}`}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-current/20 px-4 py-2 font-semibold"
              >
                {link.label}
              </a>
            ))}
          </div>
        ) : null}
        <p className="mt-2">
          Sitio conectado con Yaleka
        </p>
      </footer>
      {whatsappUrl ? (
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noreferrer"
          className="fixed bottom-24 left-4 z-40 rounded-full bg-emerald-500 px-4 py-3 text-sm font-bold text-white shadow-2xl transition hover:-translate-y-1 sm:bottom-5 sm:left-5 sm:px-5"
          aria-label="Abrir WhatsApp"
        >
          WhatsApp
        </a>
      ) : null}
      <nav
        aria-label="Navegación móvil"
        className={`fixed inset-x-0 bottom-0 z-50 grid h-16 border-t backdrop-blur-xl sm:hidden ${
          promotions.length > 0 ? 'grid-cols-4' : 'grid-cols-3'
        } ${
          minimal
            ? 'border-slate-200 bg-white/95 text-slate-700'
            : 'border-white/10 bg-slate-950/95 text-white/75'
        }`}
      >
        <a
          href="#top"
          className="flex flex-col items-center justify-center gap-1 text-[11px] font-bold"
        >
          <span className="text-base">⌂</span>
          Inicio
        </a>
        <a
          href="#catalog"
          className="flex flex-col items-center justify-center gap-1 text-[11px] font-bold"
        >
          <span className="text-base">▦</span>
          {storeLanguage.navLabel}
        </a>
        {promotions.length > 0 ? (
          <a
            href="#promotions"
            className="flex flex-col items-center justify-center gap-1 text-[11px] font-bold"
          >
            <span className="text-base">%</span>
            Promos
          </a>
        ) : null}
        <a
          href="#contact"
          className="flex flex-col items-center justify-center gap-1 text-[11px] font-bold"
        >
          <span className="text-base">●</span>
          Contacto
        </a>
      </nav>
    </main>
  );
}
