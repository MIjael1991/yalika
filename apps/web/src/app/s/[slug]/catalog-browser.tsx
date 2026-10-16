'use client';

import { useMemo, useState } from 'react';

import { ProductGallery } from './product-gallery';

export type StorefrontProduct = {
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

const money = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
});

function totalAvailable(product: StorefrontProduct) {
  const activeVariants = product.variants.filter(
    (variant) => variant.status === 'active',
  );

  return activeVariants.length > 0
    ? activeVariants.reduce(
        (total, variant) => total + variant.stock,
        0,
      )
    : product.stock;
}

export function CatalogBrowser({
  products,
  variant,
  accentColor,
  itemLabel,
  whatsappUrl,
  businessName,
}: {
  products: StorefrontProduct[];
  variant: string;
  accentColor: string;
  itemLabel: string;
  whatsappUrl: string | null;
  businessName: string;
}) {
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [selectedVariants, setSelectedVariants] = useState<
    Record<string, string>
  >({});
  const minimal = variant === 'minimal_catalog';
  const social = variant === 'social_vibrant';
  const categories = useMemo(() => {
    const values = new Map<string, string>();

    for (const product of products) {
      if (product.category) {
        values.set(product.category.id, product.category.name);
      }
    }

    return Array.from(values, ([id, name]) => ({ id, name })).sort(
      (left, right) => left.name.localeCompare(right.name, 'es'),
    );
  }, [products]);
  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('es-MX');

    return products
      .filter((product) => {
        const matchesCategory =
          categoryId === 'all' || product.category?.id === categoryId;
        const searchable = [
          product.name,
          product.description,
          product.category?.name,
          ...product.variants.map((variantItem) => variantItem.name),
        ]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase('es-MX');

        return matchesCategory && searchable.includes(normalizedQuery);
      })
      .sort(
        (left, right) =>
          Number(right.featured) - Number(left.featured) ||
          Number(totalAvailable(right) > 0) -
            Number(totalAvailable(left) > 0) ||
          left.name.localeCompare(right.name, 'es'),
      );
  }, [categoryId, products, query]);

  return (
    <div>
      <div
        className={`sticky top-16 z-30 -mx-4 border-y px-4 py-3 backdrop-blur-xl sm:mx-0 sm:rounded-2xl sm:border sm:px-4 ${
          minimal
            ? 'border-slate-200 bg-white/90'
            : 'border-white/10 bg-slate-950/75'
        }`}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Buscar en {itemLabel}</span>
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm opacity-50">
              Buscar
            </span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Nombre, categoría u opción`}
              className={`h-12 w-full rounded-xl border pl-20 pr-4 text-sm outline-none transition focus:ring-2 ${
                minimal
                  ? 'border-slate-200 bg-slate-50 text-slate-950 focus:border-slate-400 focus:ring-slate-200'
                  : 'border-white/10 bg-white/10 text-white placeholder:text-white/40 focus:border-white/30 focus:ring-white/10'
              }`}
            />
          </label>
          <div className="flex gap-2 overflow-x-auto pb-1 lg:max-w-[55%] lg:pb-0">
            <button
              type="button"
              onClick={() => setCategoryId('all')}
              className={`shrink-0 rounded-full border px-4 py-2.5 text-xs font-bold transition ${
                categoryId === 'all'
                  ? 'border-transparent text-slate-950'
                  : minimal
                    ? 'border-slate-200 text-slate-600'
                    : 'border-white/15 text-white/70'
              }`}
              style={
                categoryId === 'all'
                  ? { backgroundColor: accentColor }
                  : undefined
              }
            >
              Todo
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setCategoryId(category.id)}
                className={`shrink-0 rounded-full border px-4 py-2.5 text-xs font-bold transition ${
                  categoryId === category.id
                    ? 'border-transparent text-slate-950'
                    : minimal
                      ? 'border-slate-200 text-slate-600'
                      : 'border-white/15 text-white/70'
                }`}
                style={
                  categoryId === category.id
                    ? { backgroundColor: accentColor }
                    : undefined
                }
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-5 mt-5 flex items-center justify-between gap-3 text-xs">
        <p className={minimal ? 'text-slate-500' : 'text-white/55'}>
          {filteredProducts.length}{' '}
          {filteredProducts.length === 1 ? 'resultado' : 'resultados'}
        </p>
        {query || categoryId !== 'all' ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setCategoryId('all');
            }}
            className="font-bold underline underline-offset-4"
          >
            Limpiar búsqueda
          </button>
        ) : null}
      </div>

      {filteredProducts.length === 0 ? (
        <div
          className={`rounded-3xl border border-dashed p-12 text-center ${
            minimal
              ? 'border-slate-300 bg-slate-50 text-slate-500'
              : 'border-white/15 bg-white/5 text-white/60'
          }`}
        >
          <p className="font-semibold">No encontramos coincidencias</p>
          <p className="mt-2 text-sm">
            Prueba otra palabra o selecciona Todo.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
          {filteredProducts.map((product) => {
            const activeVariants = product.variants.filter(
              (variantItem) => variantItem.status === 'active',
            );
            const availableVariants = activeVariants.filter(
              (variantItem) => variantItem.stock > 0,
            );
            const selectedVariant =
              activeVariants.find(
                (variantItem) =>
                  variantItem.id === selectedVariants[product.id] &&
                  variantItem.stock > 0,
              ) ??
              (availableVariants.length === 1
                ? availableVariants[0]
                : undefined);
            const available = totalAvailable(product);
            const prices = activeVariants.map(
              (variantItem) => variantItem.price ?? product.price,
            );
            const displayedPrice = selectedVariant
              ? selectedVariant.price ?? product.price
              : prices.length > 0
                ? Math.min(...prices)
                : product.price;
            const hasDifferentPrices =
              !selectedVariant &&
              prices.some((price) => price !== displayedPrice);
            const needsVariantSelection =
              availableVariants.length > 1 && !selectedVariant;
            const requestText = [
              `Hola, vi ${product.name} en la página de ${businessName}.`,
              selectedVariant
                ? `Me interesa la opción ${selectedVariant.name}.`
                : null,
              `Precio mostrado: ${money.format(displayedPrice)}.`,
              '¿Me confirmas disponibilidad y cómo puedo pedirlo?',
            ]
              .filter(Boolean)
              .join(' ');
            const requestUrl = whatsappUrl
              ? `${whatsappUrl}?text=${encodeURIComponent(requestText)}`
              : null;

            return (
              <article
                key={product.id}
                className={`group flex min-h-full flex-col overflow-hidden transition duration-300 hover:-translate-y-1 ${
                  minimal
                    ? 'border-b border-slate-200 bg-white pb-5'
                    : social
                      ? 'rounded-[2rem] bg-white p-2 text-slate-950 shadow-xl shadow-purple-950/20'
                      : 'rounded-3xl border border-white/10 bg-white/10 p-2 backdrop-blur hover:border-white/25'
                }`}
              >
                <div
                  className={`relative aspect-[4/5] overflow-hidden bg-gradient-to-br from-slate-200 to-slate-400 ${
                    minimal ? '' : 'rounded-[1.4rem]'
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
                  {product.featured ? (
                    <span className="absolute left-3 top-3 rounded-full bg-slate-950/80 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur">
                      Recomendado
                    </span>
                  ) : product.compareAtPrice ? (
                    <span className="absolute left-3 top-3 rounded-full bg-red-500 px-2.5 py-1 text-[10px] font-bold text-white">
                      Oferta
                    </span>
                  ) : null}
                </div>
                <div
                  className={`flex flex-1 flex-col ${
                    minimal ? 'pt-4' : 'px-2 pb-2 pt-3'
                  }`}
                >
                  <p className="text-sm font-semibold sm:text-base">
                    {product.name}
                  </p>
                  {product.description ? (
                    <p
                      className={`mt-1 line-clamp-2 text-xs leading-5 ${
                        minimal || social
                          ? 'text-slate-500'
                          : 'text-white/55'
                      }`}
                    >
                      {product.description}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-baseline gap-2">
                    <span className="font-bold" style={{ color: accentColor }}>
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
                        {money.format(product.compareAtPrice)}
                      </span>
                    ) : null}
                  </div>
                  {product.trackInventory ? (
                    <p
                      className={`mt-2 text-[11px] font-semibold ${
                        available > 0
                          ? minimal || social
                            ? 'text-emerald-600'
                            : 'text-emerald-300'
                          : 'text-red-400'
                      }`}
                    >
                      {available > 0
                        ? available <= 3
                          ? `Últimas ${available} disponibles`
                          : `${available} disponibles`
                        : 'Agotado'}
                    </p>
                  ) : null}
                  {activeVariants.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {activeVariants.map((variantItem) => (
                        <button
                          key={variantItem.id}
                          type="button"
                          disabled={variantItem.stock <= 0}
                          onClick={() =>
                            setSelectedVariants((current) => ({
                              ...current,
                              [product.id]: variantItem.id,
                            }))
                          }
                          className={`rounded-full border px-2 py-1 text-[10px] font-semibold transition ${
                            selectedVariant?.id === variantItem.id
                              ? 'border-transparent text-slate-950'
                              : variantItem.stock > 0
                              ? minimal || social
                                  ? 'border-slate-300 text-slate-600 hover:border-slate-500'
                                  : 'border-white/20 text-white/75 hover:border-white/40'
                              : minimal || social
                                ? 'border-red-200 text-red-400 line-through'
                                : 'border-red-300/20 text-red-300/60 line-through'
                          }`}
                          style={
                            selectedVariant?.id === variantItem.id
                              ? { backgroundColor: accentColor }
                              : undefined
                          }
                        >
                          {variantItem.name} ·{' '}
                          {variantItem.stock > 0
                            ? variantItem.stock
                            : 'Agotado'}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {requestUrl && (!product.trackInventory || available > 0) ? (
                    needsVariantSelection ? (
                      <p
                        className={`mt-auto pt-4 text-center text-[11px] font-semibold ${
                          minimal || social
                            ? 'text-amber-700'
                            : 'text-amber-200'
                        }`}
                      >
                        Elige una talla u opción para consultar
                      </p>
                    ) : (
                      <a
                        href={requestUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-auto flex min-h-11 items-center justify-center rounded-xl px-3 py-2.5 text-center text-xs font-bold text-slate-950 transition hover:brightness-110"
                        style={{ backgroundColor: accentColor }}
                      >
                        Consultar o pedir por WhatsApp
                      </a>
                    )
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
