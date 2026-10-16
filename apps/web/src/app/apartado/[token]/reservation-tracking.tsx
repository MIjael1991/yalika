'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type PublicReservation = {
  reservationNumber: string;
  publicToken: string;
  status: string;
  holdExpiresAt: string | null;
  pickupDeadline: string | null;
  depositRequiredAmount: number;
  depositAmount: number;
  depositStatus: string;
  deliveryMode: string;
  items: Array<{
    productName: string;
    variant: string | null;
    quantity: number;
    unitPrice: number;
  }>;
  site: {
    name: string;
    slug: string;
    whatsappPhone: string | null;
  } | null;
};

const money = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
});

const labels: Record<string, string> = {
  hold: 'Esperando anticipo',
  deposit_reported: 'Anticipo reportado · esperando verificación',
  active: 'Apartado confirmado',
  review_expired: 'Fecha vencida · comunícate con la tienda',
  expired: 'Reserva vencida',
  released: 'Mercancía liberada',
  cancelled: 'Cancelado',
  converted: 'Convertido a venta',
  completed: 'Completado',
};

function yalekaWhatsappUrl(phone: string, message: string) {
  const digits = phone.replace(/\D/g, '');
  const international = digits.length === 10 ? `52${digits}` : digits;
  return `https://wa.me/${international}?text=${encodeURIComponent(message)}`;
}

function remainingSeconds(target: string | null) {
  if (!target) return null;
  return Math.max(
    Math.floor((new Date(target).getTime() - Date.now()) / 1000),
    0,
  );
}

function clock(seconds: number | null) {
  if (seconds === null) return '';
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function ReservationTracking({ token }: { token: string }) {
  const [record, setRecord] = useState<PublicReservation>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('transfer');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  async function load() {
    try {
      const response = await fetch(
        `/api/orion/reservation/public/${encodeURIComponent(token)}`,
        { cache: 'no-store' },
      );
      const text = await response.text();
      const body = text ? (JSON.parse(text) as unknown) : {};
      if (!response.ok) {
        const message =
          typeof body === 'object' &&
          body !== null &&
          'message' in body &&
          typeof (body as { message: unknown }).message === 'string'
            ? (body as { message: string }).message
            : 'No fue posible consultar el apartado';
        throw new Error(message);
      }
      const next = body as PublicReservation;
      setRecord(next);
      if (!amount && next.depositRequiredAmount > 0) {
        setAmount(String(next.depositRequiredAmount));
      }
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No disponible');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const seconds = useMemo(
    () => remainingSeconds(record?.holdExpiresAt ?? null),
    [record?.holdExpiresAt, tick],
  );

  async function report(event: FormEvent) {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Escribe la cantidad que reportas.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        `/api/orion/reservation/public/${encodeURIComponent(token)}/report-deposit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: value,
            method,
            reference: reference.trim() || undefined,
          }),
        },
      );
      const text = await response.text();
      const body = text ? (JSON.parse(text) as unknown) : {};
      if (!response.ok) {
        throw new Error(
          typeof body === 'object' &&
            body !== null &&
            'message' in body &&
            typeof (body as { message: unknown }).message === 'string'
            ? (body as { message: string }).message
            : 'No fue posible reportar',
        );
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible reportar');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#07111f] text-white">
        Consultando apartado…
      </main>
    );
  }

  if (!record) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#07111f] p-5 text-white">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
          <h1 className="text-2xl font-black">No pudimos abrir el apartado</h1>
          <p className="mt-3 text-slate-400">{error}</p>
        </div>
      </main>
    );
  }

  const total = record.items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0,
  );

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#113758,#07111f_55%)] p-4 text-white md:p-8">
      <div className="mx-auto max-w-2xl">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">
              Yaleka · Apartado
            </p>
            <h1 className="mt-1 text-2xl font-black">
              {record.site?.name ?? 'Mi apartado'}
            </h1>
          </div>
          {record.site?.whatsappPhone ? (
            <a
              href={yalekaWhatsappUrl(record.site.whatsappPhone, `Hola, quiero consultar mi apartado ${record.reservationNumber}. Productos: ${record.items.map((item) => `${item.quantity} x ${item.productName}${item.variant ? ` (${item.variant})` : ''}`).join(', ')}. Importe total: ${money.format(total)}. Estado: ${labels[record.status] ?? record.status}.`)}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-emerald-400 px-4 py-2 text-sm font-black text-slate-950"
            >
              WhatsApp
            </a>
          ) : null}
        </header>

        <section className="mt-6 rounded-[2rem] border border-white/10 bg-slate-950/75 p-6 shadow-2xl backdrop-blur md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="rounded-full bg-cyan-300/15 px-3 py-1 text-xs font-black text-cyan-100">
              {labels[record.status] ?? record.status}
            </span>
            <span className="text-xs font-bold text-slate-500">
              {record.reservationNumber}
            </span>
          </div>

          {record.status === 'hold' && seconds !== null ? (
            <div className="mt-6 rounded-3xl border border-amber-300/20 bg-amber-300/10 p-5">
              <p className="text-sm font-bold text-amber-100">
                Tiempo para confirmar tu anticipo
              </p>
              <p className="mt-2 text-4xl font-black tabular-nums text-amber-200">
                {clock(seconds)}
              </p>
              <p className="mt-2 text-xs text-amber-100/70">
                Si el tiempo termina sin confirmación, la mercancía vuelve a
                estar disponible.
              </p>
            </div>
          ) : null}

          <div className="mt-6 grid gap-3">
            {record.items.map((item, index) => (
              <div
                key={`${item.productName}-${index}`}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <strong>{item.productName}</strong>
                    <p className="mt-1 text-xs text-slate-400">
                      {item.variant ? `${item.variant} · ` : ''}
                      {item.quantity} pieza(s)
                    </p>
                  </div>
                  <strong>{money.format(item.unitPrice * item.quantity)}</strong>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 rounded-2xl bg-white/[0.04] p-4 text-sm">
            <span className="text-slate-400">Total estimado</span>
            <strong className="text-right">{money.format(total)}</strong>
            <span className="text-slate-400">Anticipo solicitado</span>
            <strong className="text-right">
              {money.format(record.depositRequiredAmount)}
            </strong>
            <span className="text-slate-400">Anticipo reportado/confirmado</span>
            <strong className="text-right text-emerald-300">
              {money.format(record.depositAmount)}
            </strong>
          </div>

          {record.pickupDeadline ? (
            <div className="mt-4 rounded-2xl border border-emerald-300/15 bg-emerald-300/5 p-4 text-sm">
              Recoger o acordar entrega antes de:{' '}
              <strong>
                {new Intl.DateTimeFormat('es-MX', {
                  dateStyle: 'full',
                  timeStyle: 'short',
                }).format(new Date(record.pickupDeadline))}
              </strong>
            </div>
          ) : null}

          {['hold', 'deposit_reported'].includes(record.status) &&
          record.depositRequiredAmount > 0 ? (
            <form
              onSubmit={report}
              className="mt-6 rounded-3xl border border-white/10 bg-white/[0.035] p-5"
            >
              <h2 className="font-black">Ya hice el anticipo</h2>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                Reportarlo no significa que esté confirmado. La tienda debe
                verificarlo antes de activar el apartado.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-400">
                  Cantidad
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 p-3 text-white"
                  />
                </label>
                <label className="text-xs font-bold text-slate-400">
                  Forma
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 p-3 text-white"
                  >
                    <option value="transfer">Transferencia</option>
                    <option value="cash">Efectivo</option>
                    <option value="card">Tarjeta</option>
                    <option value="other">Otro</option>
                  </select>
                </label>
              </div>
              <label className="mt-3 block text-xs font-bold text-slate-400">
                Referencia opcional
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 p-3 text-white"
                />
              </label>
              <button
                disabled={busy || record.status === 'deposit_reported'}
                className="mt-4 w-full rounded-2xl bg-cyan-300 px-5 py-3 font-black text-slate-950 disabled:opacity-50"
              >
                {record.status === 'deposit_reported'
                  ? 'Esperando verificación de la tienda'
                  : busy
                    ? 'Enviando…'
                    : 'Reportar anticipo'}
              </button>
            </form>
          ) : null}

          {error ? (
            <p className="mt-4 rounded-xl bg-rose-400/10 p-3 text-sm text-rose-200">
              {error}
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
