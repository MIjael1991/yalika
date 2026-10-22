'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';

import { api } from './reservation-api';
import { ReservationPolicyForm, type ReservationPolicy } from './reservation-policy-form';

type ReservationItem = {
  id: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  unitPriceSnapshot: number;
  productNameSnapshot: string;
  variantSnapshot: string | null;
};

export type ReservationRecord = {
  id: string;
  reservationNumber: string;
  publicToken: string;
  status: string;
  source: string;
  holdExpiresAt: string | null;
  pickupDeadline: string | null;
  depositRequiredAmount: number;
  depositAmount: number;
  depositStatus: string;
  depositMethod: string | null;
  depositReference: string | null;
  contactName: string;
  contactPhone: string;
  deliveryMode: string;
  notes: string | null;
  orderId: string | null;
  createdAt: string;
  items: ReservationItem[];
};

export type { ReservationPolicy } from './reservation-policy-form';

type PaymentResult = {
  order: {
    id: string;
    orderNumber: string;
    total: number;
    paymentStatus: string;
  };
  summary: {
    totalPaid: number;
    remaining: number;
  };
};

const money = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
});

const statusText: Record<string, string> = {
  hold: 'Esperando anticipo',
  deposit_reported: 'Anticipo reportado',
  active: 'Apartado activo',
  review_expired: 'Vencido · revisar',
  released: 'Liberado',
  expired: 'Vencido y liberado',
  cancelled: 'Cancelado',
  converted: 'Convertido a venta',
  completed: 'Completado',
};

function yalikaWhatsappUrl(phone: string, message: string) {
  const digits = phone.replace(/\D/g, '');
  const international = digits.length === 10 ? `52${digits}` : digits;
  return `https://wa.me/${international}?text=${encodeURIComponent(message)}`;
}

function dateLabel(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function sumReservation(record: ReservationRecord) {
  return record.items.reduce(
    (total, item) => total + item.unitPriceSnapshot * item.quantity,
    0,
  );
}

export function ReservationWorkspace({
  companyId,
  isCashier = false,
  initialReservations,
  initialPolicy,
  initialError,
}: {
  companyId: string;
  /** El cajero cobra y atiende; extender, liberar y cambiar reglas es del administrador. */
  isCashier?: boolean;
  initialReservations: ReservationRecord[];
  initialPolicy: ReservationPolicy;
  initialError: string;
}) {
  const [reservations, setReservations] = useState(initialReservations);
  const [error, setError] = useState(initialError);
  const [busyId, setBusyId] = useState('');
  const [filter, setFilter] = useState('open');
  const [depositEditor, setDepositEditor] = useState<ReservationRecord>();
  const [depositAmount, setDepositAmount] = useState('');
  const [depositMethod, setDepositMethod] = useState('transfer');
  const [depositReference, setDepositReference] = useState('');

  const visible = useMemo(() => {
    if (filter === 'all') return reservations;
    if (filter === 'open') {
      return reservations.filter((item) =>
        ['hold', 'deposit_reported', 'active', 'review_expired', 'converted'].includes(
          item.status,
        ),
      );
    }
    return reservations.filter((item) => item.status === filter);
  }, [reservations, filter]);

  const counts = useMemo(
    () => ({
      waiting: reservations.filter((r) =>
        ['hold', 'deposit_reported'].includes(r.status),
      ).length,
      active: reservations.filter((r) => r.status === 'active').length,
      review: reservations.filter((r) => r.status === 'review_expired').length,
      converted: reservations.filter((r) => r.status === 'converted').length,
    }),
    [reservations],
  );

  async function refresh() {
    const next = await api<ReservationRecord[]>(
      `reservation/company/${companyId}`,
    );
    setReservations(next);
  }

  async function confirmDeposit(event: FormEvent) {
    event.preventDefault();
    if (!depositEditor) return;
    const amount = Number(depositAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Escribe el anticipo realmente confirmado.');
      return;
    }

    setBusyId(depositEditor.id);
    setError('');
    try {
      await api(
        `reservation/${depositEditor.id}/confirm-deposit`,
        {
          method: 'POST',
          body: JSON.stringify({
            amount,
            method: depositMethod,
            reference: depositReference.trim() || undefined,
          }),
        },
      );
      setDepositEditor(undefined);
      setDepositAmount('');
      setDepositReference('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible confirmar');
    } finally {
      setBusyId('');
    }
  }

  async function act(
    item: ReservationRecord,
    action: 'extend' | 'release',
  ) {
    setBusyId(item.id);
    setError('');
    try {
      await api(`reservation/${item.id}/${action}`, {
        method: 'POST',
        body:
          action === 'extend'
            ? JSON.stringify({ days: 1 })
            : JSON.stringify({
                reason: 'Liberado manualmente desde Apartados',
              }),
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible actualizar');
    } finally {
      setBusyId('');
    }
  }

  async function convertToSale(item: ReservationRecord) {
    setBusyId(item.id);
    setError('');
    try {
      const order = await api<{
        id: string;
        orderNumber: string;
      }>('order', {
        method: 'POST',
        body: JSON.stringify({
          companyId,
          reservationId: item.id,
          source: 'web',
          orderType:
            item.deliveryMode === 'delivery' ? 'delivery' : 'pickup',
          notes: `Venta originada por apartado ${item.reservationNumber}`,
          items: item.items.map((line) => ({
            productId: line.productId,
            variantId: line.variantId ?? undefined,
            quantity: line.quantity,
          })),
        }),
      });

      await api(`order/${order.id}/confirm`, { method: 'POST' });

      if (item.depositStatus === 'confirmed' && item.depositAmount > 0) {
        const payment = await api<PaymentResult>(
          `payment/order/${order.id}`,
          {
            method: 'POST',
            body: JSON.stringify({
              method: item.depositMethod ?? 'other',
              amount: item.depositAmount,
              reference: item.depositReference ?? undefined,
              notes: `Anticipo del apartado ${item.reservationNumber}`,
            }),
          },
        );

        if (payment.order.paymentStatus === 'paid') {
          await api(`reservation/${item.id}/complete`, {
            method: 'POST',
          });
        }
      }

      await refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'No fue posible convertir el apartado en venta',
      );
    } finally {
      setBusyId('');
    }
  }

  async function collectBalance(item: ReservationRecord) {
    if (!item.orderId) return;
    setBusyId(item.id);
    setError('');
    try {
      const order = await api<{
        id: string;
        orderNumber: string;
        total: number;
        paymentStatus: string;
      }>(`order/${item.orderId}`);
      const payments = await api<Array<{ amount: number; status: string }>>(
        `payment/order/${item.orderId}`,
      );
      const paid = payments
        .filter((p) => p.status === 'completed')
        .reduce((sum, p) => sum + p.amount, 0);
      const remaining =
        Math.round(Math.max(order.total - paid, 0) * 100) / 100;

      if (remaining > 0) {
        const result = await api<PaymentResult>(
          `payment/order/${item.orderId}`,
          {
            method: 'POST',
            body: JSON.stringify({
              method: 'cash',
              amount: remaining,
              receivedAmount: remaining,
              notes: `Saldo de apartado ${item.reservationNumber}`,
            }),
          },
        );
        if (result.order.paymentStatus !== 'paid') {
          throw new Error('La venta todavía conserva saldo pendiente');
        }
      }

      await api(`reservation/${item.id}/complete`, {
        method: 'POST',
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible cobrar el saldo');
    } finally {
      setBusyId('');
    }
  }

  return (
    <main className="min-h-screen bg-[#06111f] px-4 py-6 text-slate-100 md:px-7">
      <div className="mx-auto max-w-[1500px]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-400">
              Comercio · R9A
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight">
              Apartados
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Separa mercancía sin confundirla con una venta. Yalika libera
              automáticamente los apartados sin anticipo cuando vence su tiempo.
            </p>
          </div>
          <Link
            href="/sites/studio"
            className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-100"
          >
            Configurar mi página
          </Link>
        </div>

        {error ? (
          <div className="mt-5 rounded-2xl border border-red-400/25 bg-red-400/10 p-4 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Esperando anticipo', counts.waiting, 'text-amber-300'],
            ['Activos', counts.active, 'text-emerald-300'],
            ['Requieren revisión', counts.review, 'text-rose-300'],
            ['Convertidos a venta', counts.converted, 'text-cyan-300'],
          ].map(([label, value, color]) => (
            <div
              key={String(label)}
              className="rounded-3xl border border-white/10 bg-white/[0.045] p-5 shadow-xl"
            >
              <p className="text-sm text-slate-400">{label}</p>
              <p className={`mt-2 text-3xl font-black ${color}`}>{value}</p>
            </div>
          ))}
        </section>

        <div className="mt-6 grid gap-6 xl:grid-cols-[330px_1fr]">
          <ReservationPolicyForm
            companyId={companyId}
            initialPolicy={initialPolicy}
            readOnly={isCashier}
          />

          <section>
            <div className="flex flex-wrap gap-2">
              {[
                ['open', 'Abiertos'],
                ['hold', 'Esperando'],
                ['active', 'Activos'],
                ['review_expired', 'Revisión'],
                ['converted', 'Por cobrar'],
                ['completed', 'Completados'],
                ['all', 'Todos'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`rounded-xl px-4 py-2 text-sm font-bold ${
                    filter === key
                      ? 'bg-cyan-300 text-slate-950'
                      : 'border border-white/10 bg-white/5 text-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-4 grid gap-4">
              {visible.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.025] p-10 text-center text-slate-400">
                  No hay apartados en esta vista.
                </div>
              ) : (
                visible.map((item) => {
                  const total = sumReservation(item);
                  const remaining = Math.max(
                    Math.round((total - item.depositAmount) * 100) / 100,
                    0,
                  );
                  return (
                    <article
                      key={item.id}
                      className="rounded-3xl border border-white/10 bg-slate-900/65 p-5 shadow-xl"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold">
                              {statusText[item.status] ?? item.status}
                            </span>
                            <span className="text-xs text-slate-500">
                              {item.reservationNumber}
                            </span>
                          </div>
                          <h3 className="mt-3 text-xl font-black">
                            {item.contactName}
                          </h3>
                          <p className="mt-1 text-sm text-slate-400">
                            {item.contactPhone} ·{' '}
                            {item.deliveryMode === 'delivery'
                              ? 'Envío'
                              : item.deliveryMode === 'pickup'
                                ? 'Recoger'
                                : 'Acordar entrega'}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-right text-sm">
                          <span className="text-slate-500">Total</span>
                          <strong>{money.format(total)}</strong>
                          <span className="text-slate-500">Anticipo</span>
                          <strong className="text-emerald-300">
                            {money.format(item.depositAmount)}
                          </strong>
                          <span className="text-slate-500">Restante</span>
                          <strong>{money.format(remaining)}</strong>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-2 md:grid-cols-2">
                        {item.items.map((line) => (
                          <div
                            key={line.id}
                            className="rounded-2xl border border-white/8 bg-white/[0.035] p-3"
                          >
                            <strong className="text-sm">
                              {line.productNameSnapshot}
                            </strong>
                            <p className="mt-1 text-xs text-slate-400">
                              {line.variantSnapshot
                                ? `${line.variantSnapshot} · `
                                : ''}
                              {line.quantity} ×{' '}
                              {money.format(line.unitPriceSnapshot)}
                            </p>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
                        <div>
                          Reserva temporal:{' '}
                          <strong className="text-slate-200">
                            {dateLabel(item.holdExpiresAt)}
                          </strong>
                        </div>
                        <div>
                          Recoger antes:{' '}
                          <strong className="text-slate-200">
                            {dateLabel(item.pickupDeadline)}
                          </strong>
                        </div>
                      </div>

                      <div className="mt-5 flex flex-wrap gap-2">
                        {['hold', 'deposit_reported'].includes(item.status) ? (
                          <button
                            disabled={busyId === item.id}
                            onClick={() => {
                              setDepositEditor(item);
                              setDepositAmount(
                                String(
                                  item.depositAmount ||
                                    item.depositRequiredAmount,
                                ),
                              );
                              setDepositMethod(
                                item.depositMethod ?? 'transfer',
                              );
                              setDepositReference(
                                item.depositReference ?? '',
                              );
                            }}
                            className="rounded-xl bg-emerald-300 px-4 py-2 text-sm font-black text-slate-950"
                          >
                            Confirmar anticipo
                          </button>
                        ) : null}

                        {['active', 'review_expired'].includes(item.status) ? (
                          <>
                            <button
                              disabled={busyId === item.id}
                              onClick={() => void convertToSale(item)}
                              className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-black text-slate-950"
                            >
                              Convertir a venta
                            </button>
                            {isCashier ? null : (
                              <button
                                disabled={busyId === item.id}
                                onClick={() => void act(item, 'extend')}
                                className="rounded-xl border border-violet-300/30 bg-violet-300/10 px-4 py-2 text-sm font-bold text-violet-100"
                              >
                                +1 día
                              </button>
                            )}
                          </>
                        ) : null}

                        {item.status === 'converted' && item.orderId ? (
                          <button
                            disabled={busyId === item.id}
                            onClick={() => void collectBalance(item)}
                            className="rounded-xl bg-emerald-300 px-4 py-2 text-sm font-black text-slate-950"
                          >
                            Cobrar saldo en efectivo
                          </button>
                        ) : null}

                        {!isCashier &&
                        ['hold', 'deposit_reported', 'active', 'review_expired'].includes(
                          item.status,
                        ) ? (
                          <button
                            disabled={busyId === item.id}
                            onClick={() => void act(item, 'release')}
                            className="rounded-xl border border-rose-300/25 bg-rose-300/10 px-4 py-2 text-sm font-bold text-rose-100"
                          >
                            Liberar
                          </button>
                        ) : null}

                        <a
                          href={yalikaWhatsappUrl(item.contactPhone, `Hola ${item.contactName}, te escribimos sobre tu apartado ${item.reservationNumber}. Productos: ${item.items.map((line) => `${line.quantity} x ${line.productNameSnapshot}${line.variantSnapshot ? ` (${line.variantSnapshot})` : ''}`).join(', ')}. Importe: ${money.format(sumReservation(item))}. Anticipo: ${money.format(item.depositAmount)}. Estado: ${statusText[item.status] ?? item.status}.`)}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold"
                        >
                          WhatsApp
                        </a>
                        <Link
                          href={`/apartado/${item.publicToken}`}
                          target="_blank"
                          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold"
                        >
                          Ver como cliente
                        </Link>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </div>

      {depositEditor ? (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/85 p-4 backdrop-blur-sm">
          <form
            onSubmit={confirmDeposit}
            className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl"
          >
            <h2 className="text-xl font-black">Confirmar anticipo</h2>
            <p className="mt-2 text-sm text-slate-400">
              Verifica el dinero antes de confirmar. Reportar un depósito desde
              la web no equivale a recibirlo.
            </p>
            <label className="mt-5 block text-xs font-bold uppercase text-slate-500">
              Cantidad confirmada
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 p-3 text-white"
              />
            </label>
            <label className="mt-3 block text-xs font-bold uppercase text-slate-500">
              Forma
              <select
                value={depositMethod}
                onChange={(e) => setDepositMethod(e.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 p-3 text-white"
              >
                <option value="transfer">Transferencia</option>
                <option value="cash">Efectivo</option>
                <option value="card">Tarjeta</option>
                <option value="other">Otro</option>
              </select>
            </label>
            <label className="mt-3 block text-xs font-bold uppercase text-slate-500">
              Referencia
              <input
                value={depositReference}
                onChange={(e) => setDepositReference(e.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 p-3 text-white"
              />
            </label>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDepositEditor(undefined)}
                className="rounded-xl border border-white/10 px-4 py-3 font-bold"
              >
                Cancelar
              </button>
              <button className="rounded-xl bg-emerald-300 px-4 py-3 font-black text-slate-950">
                Confirmar
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}
