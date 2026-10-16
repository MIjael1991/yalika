'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';

type Variant = {
  id: string;
  name: string;
  price: number;
  available: number;
};

type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  available: number | null;
  variants: Variant[];
  category: { id: string; name: string } | null;
};

type Catalog = {
  site: {
    name: string;
    slug: string;
    whatsappPhone: string | null;
  };
  policy: {
    enabled: boolean;
    depositRequired: boolean;
    depositType: string;
    depositValue: number;
    holdMinutes: number;
    activeDays: number;
  };
  products: Product[];
};

type Reservation = {
  publicToken: string;
  reservationNumber: string;
  holdExpiresAt: string | null;
  pickupDeadline: string | null;
  depositRequiredAmount: number;
  status: string;
};

const money = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
});

function getMessage(value: unknown) {
  if (typeof value === 'object' && value !== null && 'message' in value) {
    const message = (value as { message: unknown }).message;
    if (Array.isArray(message)) return message.join('. ');
    if (typeof message === 'string') return message;
  }
  return 'No fue posible completar la solicitud';
}

function yalikaWhatsappUrl(phone: string, message: string) {
  const digits = phone.replace(/\D/g, '');
  const international = digits.length === 10 ? `52${digits}` : digits;
  return `https://wa.me/${international}?text=${encodeURIComponent(message)}`;
}

export function ReservableCatalog({
  slug,
  initialData,
  initialError,
}: {
  slug: string;
  initialData: unknown;
  initialError: string;
}) {
  const data = initialData as Catalog | null;
  const [selected, setSelected] = useState<Product>();
  const [variantId, setVariantId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [deliveryMode, setDeliveryMode] = useState('arrange');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  const [created, setCreated] = useState<Reservation>();

  const chosenVariant = useMemo(
    () => selected?.variants.find((item) => item.id === variantId),
    [selected, variantId],
  );

  if (!data) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#07111f] p-6 text-white">
        <div className="max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
          <h1 className="text-2xl font-black">Apartados</h1>
          <p className="mt-3 text-slate-400">{error || 'No disponible.'}</p>
        </div>
      </main>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    if (selected.variants.length && !variantId) {
      setError('Selecciona talla, color o variante.');
      return;
    }

    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      setError('La cantidad debe ser una pieza o más.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const operationId = crypto.randomUUID();
      const response = await fetch('/api/yalika/reservation/public/hold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteSlug: slug,
          operationId,
          contactName: name,
          contactPhone: phone,
          deliveryMode,
          items: [
            {
              productId: selected.id,
              variantId: variantId || undefined,
              quantity: qty,
            },
          ],
        }),
      });
      const text = await response.text();
      let body: unknown = {};
      if (text) {
        try {
          body = JSON.parse(text) as unknown;
        } catch {
          body = { message: text };
        }
      }
      if (!response.ok) throw new Error(getMessage(body));
      setCreated(body as Reservation);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible apartar');
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top,#12324e,#07111f_55%)] p-5 text-white">
        <div className="w-full max-w-xl rounded-[2rem] border border-cyan-300/20 bg-slate-950/75 p-7 shadow-2xl backdrop-blur">
          <div className="inline-flex rounded-full bg-emerald-300/15 px-3 py-1 text-xs font-black text-emerald-200">
            MERCANCÍA SEPARADA TEMPORALMENTE
          </div>
          <h1 className="mt-4 text-3xl font-black">Tu apartado está listo</h1>
          <p className="mt-2 text-slate-400">
            {created.reservationNumber}. Guarda este enlace para consultar su estado.
          </p>
          {created.holdExpiresAt ? (
            <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4">
              <strong className="text-amber-200">
                Tienes un tiempo limitado para confirmar el anticipo.
              </strong>
              <p className="mt-1 text-sm text-slate-300">
                Anticipo solicitado: {money.format(created.depositRequiredAmount)}
              </p>
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4 text-emerald-100">
              Este negocio no exige anticipo para activar el apartado.
            </div>
          )}
          <Link
            href={`/apartado/${created.publicToken}`}
            className="mt-6 block rounded-2xl bg-cyan-300 px-5 py-4 text-center font-black text-slate-950"
          >
            Ver mi apartado
          </Link>
          {data.site.whatsappPhone ? (
            <a
              href={yalikaWhatsappUrl(data.site.whatsappPhone, `Hola, hice el apartado ${created.reservationNumber}. Producto: ${selected?.name ?? 'artículo'}. Cantidad: ${quantity}. Anticipo: ${money.format(created.depositRequiredAmount)}. Entrega: ${deliveryMode}.`)}
              target="_blank"
              rel="noreferrer"
              className="mt-3 block rounded-2xl bg-emerald-500 px-5 py-4 text-center font-black text-white"
            >
              Enviar folio por WhatsApp
            </a>
          ) : null}
          <Link
            href={`/s/${slug}`}
            className="mt-3 block text-center text-sm font-bold text-slate-400"
          >
            Volver a la tienda
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f7f5] text-slate-950">
      <header className="sticky top-0 z-30 border-b border-black/5 bg-white/90 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-700">
              Yalika · Apartados
            </p>
            <h1 className="font-black">{data.site.name}</h1>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/s/${slug}`}
              className="rounded-full border border-black/10 px-4 py-2 text-sm font-bold"
            >
              Tienda
            </Link>
            {data.site.whatsappPhone ? (
              <a
                href={yalikaWhatsappUrl(data.site.whatsappPhone, `Hola, estoy viendo los apartados de ${data.site.name}. Quiero confirmar disponibilidad.`)}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-black text-white"
              >
                WhatsApp
              </a>
            ) : null}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-10">
        <div className="rounded-[2rem] bg-slate-950 p-7 text-white md:p-10">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">
            Compra con tranquilidad
          </p>
          <h2 className="mt-3 max-w-3xl text-3xl font-black md:text-5xl">
            Aparta lo que te gusta antes de que se termine.
          </h2>
          <p className="mt-4 max-w-2xl text-slate-300">
            {data.policy.enabled
              ? `La tienda conserva tu artículo durante ${data.policy.holdMinutes} minutos mientras confirmas el anticipo.`
              : 'Los apartados están desactivados por el momento. Puedes consultar disponibilidad por WhatsApp.'}
          </p>
        </div>

        {error ? (
          <div className="mt-5 rounded-2xl bg-rose-50 p-4 text-sm font-bold text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.products.map((product) => {
            const available = product.variants.length
              ? product.variants.reduce((sum, v) => sum + v.available, 0)
              : product.available ?? 0;
            return (
              <article
                key={product.id}
                className="overflow-hidden rounded-[1.7rem] border border-black/5 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]"
              >
                <div className="aspect-[4/3] bg-gradient-to-br from-slate-100 to-slate-200">
                  {product.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="h-full w-full object-contain p-3"
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-5xl">◫</div>
                  )}
                </div>
                <div className="p-5">
                  <p className="text-xs font-bold text-slate-400">
                    {product.category?.name ?? 'Producto'}
                  </p>
                  <h3 className="mt-1 text-lg font-black">{product.name}</h3>
                  <p className="mt-2 text-xl font-black text-cyan-700">
                    {money.format(product.price)}
                  </p>
                  <p
                    className={`mt-2 text-xs font-bold ${
                      available > 0 ? 'text-emerald-600' : 'text-amber-600'
                    }`}
                  >
                    {available > 0
                      ? available <= 2
                        ? 'Pocas piezas'
                        : 'Disponible'
                      : 'Apartado o agotado por el momento'}
                  </p>
                  {available > 0 && data.policy.enabled ? (
                    <button
                      onClick={() => {
                        setSelected(product);
                        setVariantId(product.variants.length === 1 ? product.variants[0].id : '');
                        setQuantity('1');
                        setError('');
                      }}
                      className="mt-4 w-full rounded-2xl bg-slate-950 px-4 py-3 font-black text-white"
                    >
                      Apartar
                    </button>
                  ) : data.site.whatsappPhone ? (
                    <a
                      href={yalikaWhatsappUrl(data.site.whatsappPhone, `Hola, quiero consultar disponibilidad de ${product.name} en ${data.site.name}.`)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 block w-full rounded-2xl bg-emerald-500 px-4 py-3 text-center font-black text-white"
                    >
                      Consultar por WhatsApp
                    </a>
                  ) : (
                    <button disabled className="mt-4 w-full rounded-2xl bg-slate-200 px-4 py-3 font-black text-slate-500">No disponible</button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {selected ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <form
            onSubmit={submit}
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-cyan-700">
                  Apartar
                </p>
                <h2 className="mt-1 text-2xl font-black">{selected.name}</h2>
              </div>
              <button
                type="button"
                onClick={() => setSelected(undefined)}
                className="rounded-full bg-slate-100 px-3 py-2 font-black"
              >
                ×
              </button>
            </div>

            {selected.variants.length ? (
              <label className="mt-5 block text-sm font-bold">
                Talla / color / variante
                <select
                  value={variantId}
                  onChange={(e) => setVariantId(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 p-3"
                >
                  <option value="">Selecciona…</option>
                  {selected.variants.map((variant) => (
                    <option
                      key={variant.id}
                      value={variant.id}
                      disabled={variant.available <= 0}
                    >
                      {variant.name} · {money.format(variant.price)} ·{' '}
                      {variant.available > 0 ? 'Disponible' : 'No disponible'}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="mt-4 block text-sm font-bold">
              Cantidad
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 p-3"
              />
            </label>
            <label className="mt-4 block text-sm font-bold">
              Tu nombre
              <input
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 p-3"
              />
            </label>
            <label className="mt-4 block text-sm font-bold">
              Teléfono / WhatsApp
              <input
                required
                maxLength={40}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 p-3"
              />
            </label>
            <label className="mt-4 block text-sm font-bold">
              ¿Cómo quieres recibirlo?
              <select
                value={deliveryMode}
                onChange={(e) => setDeliveryMode(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 p-3"
              >
                <option value="arrange">Acordar con la tienda</option>
                <option value="pickup">Recoger en tienda</option>
                <option value="delivery">Envío a domicilio</option>
              </select>
            </label>

            <div className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-950">
              <strong>No es una venta todavía.</strong> Al confirmar, Yalika
              separa temporalmente el artículo. Si no se confirma el anticipo
              dentro del plazo, vuelve a estar disponible.
            </div>

            <button
              disabled={busy}
              className="mt-5 w-full rounded-2xl bg-cyan-500 px-5 py-4 font-black text-white disabled:opacity-60"
            >
              {busy
                ? 'Apartando…'
                : `Apartar ${
                    chosenVariant
                      ? money.format(chosenVariant.price)
                      : money.format(selected.price)
                  }`}
            </button>
          </form>
        </div>
      ) : null}
    </main>
  );
}
