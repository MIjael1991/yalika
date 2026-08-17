'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

export type PendingOrder = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  total: number;
  createdAt: string;
};

type SplitPayment = {
  id: string;
  amount: number;
  method: string;
  status: string;
};

type OrderSplit = {
  id: string;
  label: string;
  status: string;
  subtotal: number;
  discount: number;
  total: number;
  payments: SplitPayment[];
};

type PaymentResult = {
  order: {
    id: string;
    orderNumber: string;
    total: number;
    paymentStatus: string;
  };
  summary: {
    remaining: number;
    changeAmount: number;
  };
  split: {
    id: string;
    status: string;
    totalPaid: number;
    remaining: number;
  } | null;
};

const money = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
});

function getErrorMessage(value: unknown) {
  if (typeof value === 'object' && value !== null && 'message' in value) {
    const message = (value as { message: unknown }).message;

    if (Array.isArray(message)) {
      return message.join('. ');
    }

    if (typeof message === 'string') {
      return message;
    }
  }

  return 'No fue posible completar la operación';
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/orion/${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    cache: 'no-store',
  });
  const body = await response.text();
  let payload: unknown = {};

  if (body) {
    try {
      payload = JSON.parse(body) as unknown;
    } catch {
      payload = { message: body };
    }
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(payload));
  }

  return payload as T;
}

function paidAmount(split: OrderSplit) {
  return split.payments
    .filter((payment) => payment.status === 'completed')
    .reduce((total, payment) => total + payment.amount, 0);
}

function splitRemaining(split: OrderSplit) {
  return Math.max(
    Math.round((split.total - paidAmount(split)) * 100) / 100,
    0,
  );
}

export function PendingAccountsWorkspace({
  companyId,
  initialOrders,
  initialError,
}: {
  companyId: string;
  initialOrders: PendingOrder[];
  initialError: string;
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<PendingOrder>();
  const [splits, setSplits] = useState<OrderSplit[]>([]);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [receivedAmount, setReceivedAmount] = useState('');
  const [reference, setReference] = useState('');
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(initialError);
  const [completedOrderNumber, setCompletedOrderNumber] = useState('');

  const pendingOrders = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('es-MX');

    return orders.filter(
      (order) =>
        order.status === 'confirmed' &&
        ['pending', 'partial'].includes(order.paymentStatus) &&
        order.orderNumber.toLocaleLowerCase('es-MX').includes(normalized),
    );
  }, [orders, search]);

  const activeSplit = splits.find((split) => splitRemaining(split) > 0);
  const paidCount = splits.filter((split) => splitRemaining(split) <= 0).length;

  async function refreshOrders() {
    if (!companyId) {
      return;
    }

    const nextOrders = await apiRequest<PendingOrder[]>(
      `order/company/${companyId}`,
    );
    setOrders(nextOrders);
  }

  async function loadOrderSplits(order: PendingOrder) {
    setSelectedOrder(order);
    setSplits([]);
    setError('');
    setCompletedOrderNumber('');
    setLoading(true);

    try {
      const result = await apiRequest<OrderSplit[]>(
        `order-split/order/${order.id}`,
      );

      if (result.length === 0) {
        setError('Esta venta pendiente no tiene cuentas divididas');
        return;
      }

      setSplits(result);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'No se pudieron cargar las cuentas',
      );
    } finally {
      setLoading(false);
    }
  }

  async function recoverState() {
    if (!selectedOrder) {
      return;
    }

    try {
      const [nextSplits, order] = await Promise.all([
        apiRequest<OrderSplit[]>(`order-split/order/${selectedOrder.id}`),
        apiRequest<PendingOrder>(`order/${selectedOrder.id}`),
      ]);

      setSplits(nextSplits);

      if (order.paymentStatus === 'paid') {
        setCompletedOrderNumber(order.orderNumber);
        await refreshOrders();
      }
    } catch {
      // Conservamos el error original del pago; el usuario puede reintentar.
    }
  }

  async function payActiveSplit() {
    if (!selectedOrder || !activeSplit) {
      return;
    }

    const remaining = splitRemaining(activeSplit);
    const received = receivedAmount ? Number(receivedAmount) : undefined;

    if (
      paymentMethod === 'cash' &&
      received !== undefined &&
      (!Number.isFinite(received) || received < remaining)
    ) {
      setError('El efectivo recibido no cubre esta cuenta');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const payment = await apiRequest<PaymentResult>(
        `payment/order/${selectedOrder.id}`,
        {
          method: 'POST',
          body: JSON.stringify({
            method: paymentMethod,
            amount: remaining,
            orderSplitId: activeSplit.id,
            receivedAmount:
              paymentMethod === 'cash' && received !== undefined
                ? received
                : undefined,
            reference:
              paymentMethod !== 'cash' && reference.trim()
                ? reference.trim()
                : undefined,
          }),
        },
      );

      const nextSplits = splits.map((split) =>
        split.id === activeSplit.id
          ? {
              ...split,
              status: payment.split?.status ?? 'paid',
              payments: [
                ...split.payments,
                {
                  id: crypto.randomUUID(),
                  amount: remaining,
                  method: paymentMethod,
                  status: 'completed',
                },
              ],
            }
          : split,
      );

      setSplits(nextSplits);
      setReceivedAmount('');
      setReference('');

      if (payment.order.paymentStatus === 'paid') {
        setCompletedOrderNumber(payment.order.orderNumber);
        await refreshOrders();
      }
    } catch (paymentError) {
      setError(
        paymentError instanceof Error
          ? paymentError.message
          : 'No fue posible registrar el pago',
      );
      await recoverState();
    } finally {
      setProcessing(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#07101f] text-slate-100">
      <header className="border-b border-slate-800/80 bg-slate-950/70 px-4 py-4 md:px-6">
        <div className="mx-auto flex max-w-[1450px] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-400">
              ORION / Ventas
            </p>
            <h1 className="mt-1 text-2xl font-semibold">Cuentas pendientes</h1>
          </div>
          <Link
            href="/pos"
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-center text-sm font-semibold text-slate-200 hover:border-cyan-400/50"
          >
            ← Regresar a Punto de venta
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1450px] gap-5 p-4 md:p-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
                Recuperación
              </p>
              <h2 className="mt-1 text-lg font-semibold">Ventas sin terminar</h2>
            </div>
            <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-400">
              {pendingOrders.length}
            </span>
          </div>

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar folio…"
            className="mt-4 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 outline-none focus:border-cyan-400"
          />

          <div className="mt-4 max-h-[65vh] space-y-2 overflow-y-auto">
            {pendingOrders.map((order) => (
              <button
                key={order.id}
                type="button"
                onClick={() => void loadOrderSplits(order)}
                className={`w-full rounded-2xl border p-4 text-left ${
                  selectedOrder?.id === order.id
                    ? 'border-cyan-400/60 bg-cyan-400/10'
                    : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                }`}
              >
                <p className="truncate text-sm font-semibold">{order.orderNumber}</p>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-slate-500">
                    {order.paymentStatus === 'partial' ? 'Pago parcial' : 'Pendiente'}
                  </span>
                  <span className="font-semibold text-cyan-300">
                    {money.format(order.total)}
                  </span>
                </div>
              </button>
            ))}

            {pendingOrders.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">
                No hay cuentas divididas pendientes.
              </p>
            ) : null}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-5 md:p-6">
          {completedOrderNumber ? (
            <div className="flex min-h-[520px] flex-col items-center justify-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400 text-3xl font-bold text-slate-950">
                ✓
              </div>
              <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
                Cuenta completada
              </p>
              <h2 className="mt-2 text-2xl font-semibold">{completedOrderNumber}</h2>
              <p className="mt-3 text-sm text-slate-500">
                Todas las partes quedaron pagadas y auditadas.
              </p>
              <button
                type="button"
                onClick={() => {
                  setCompletedOrderNumber('');
                  setSelectedOrder(undefined);
                  setSplits([]);
                }}
                className="mt-7 h-12 rounded-xl bg-cyan-400 px-7 font-bold text-slate-950"
              >
                Revisar otra cuenta
              </button>
            </div>
          ) : selectedOrder && splits.length > 0 && activeSplit ? (
            <div>
              <div className="flex flex-col gap-3 border-b border-slate-800 pb-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
                    Cuenta dividida
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">{selectedOrder.orderNumber}</h2>
                  <p className="mt-2 text-sm text-slate-500">
                    {paidCount} de {splits.length} pagadas
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-950 px-5 py-3 text-right">
                  <p className="text-xs text-slate-500">Siguiente pago</p>
                  <p className="mt-1 text-2xl font-bold text-cyan-300">
                    {money.format(splitRemaining(activeSplit))}
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {splits.map((split) => {
                  const remaining = splitRemaining(split);

                  return (
                    <div
                      key={split.id}
                      className={`rounded-2xl border p-4 ${
                        remaining <= 0
                          ? 'border-emerald-500/30 bg-emerald-500/10'
                          : split.id === activeSplit.id
                            ? 'border-cyan-400/50 bg-cyan-400/10'
                            : 'border-slate-800 bg-slate-950/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">{split.label}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Pagado: {money.format(paidAmount(split))}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{money.format(split.total)}</p>
                          <p className={`mt-1 text-xs ${remaining <= 0 ? 'text-emerald-300' : 'text-slate-500'}`}>
                            {remaining <= 0 ? 'Pagada' : `Faltan ${money.format(remaining)}`}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 grid grid-cols-3 gap-2">
                {[
                  ['cash', 'Efectivo'],
                  ['card', 'Tarjeta'],
                  ['transfer', 'Transferencia'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    disabled={processing}
                    onClick={() => setPaymentMethod(value)}
                    className={`rounded-xl border px-2 py-3 text-xs font-semibold ${
                      paymentMethod === value
                        ? 'border-cyan-400 bg-cyan-400/10 text-cyan-300'
                        : 'border-slate-700 text-slate-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {paymentMethod === 'cash' ? (
                <div className="mt-4">
                  <label className="text-sm font-medium text-slate-300" htmlFor="pendingReceived">
                    Efectivo recibido (opcional)
                  </label>
                  <input
                    id="pendingReceived"
                    inputMode="decimal"
                    value={receivedAmount}
                    disabled={processing}
                    onChange={(event) => setReceivedAmount(event.target.value)}
                    placeholder={money.format(splitRemaining(activeSplit))}
                    className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 outline-none focus:border-cyan-400"
                  />
                  {receivedAmount && Number(receivedAmount) >= splitRemaining(activeSplit) ? (
                    <p className="mt-2 text-sm font-medium text-emerald-300">
                      Cambio: {money.format(Number(receivedAmount) - splitRemaining(activeSplit))}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="mt-4">
                  <label className="text-sm font-medium text-slate-300" htmlFor="pendingReference">
                    Referencia (opcional)
                  </label>
                  <input
                    id="pendingReference"
                    value={reference}
                    disabled={processing}
                    onChange={(event) => setReference(event.target.value)}
                    className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 outline-none focus:border-cyan-400"
                  />
                </div>
              )}

              {error ? (
                <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </p>
              ) : null}

              <button
                type="button"
                disabled={processing}
                onClick={() => void payActiveSplit()}
                className="mt-6 h-14 w-full rounded-2xl bg-cyan-400 font-bold text-slate-950 hover:bg-cyan-300 disabled:bg-slate-700 disabled:text-slate-500"
              >
                {processing
                  ? 'Registrando pago…'
                  : `Cobrar ${activeSplit.label} · ${money.format(splitRemaining(activeSplit))}`}
              </button>
            </div>
          ) : (
            <div className="flex min-h-[520px] flex-col items-center justify-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800 text-2xl text-slate-500">
                ≋
              </div>
              <h2 className="mt-5 text-xl font-semibold text-slate-300">
                Selecciona una cuenta pendiente
              </h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
                Aquí puedes continuar una venta dividida aunque el navegador o la computadora se hayan cerrado.
              </p>
              {loading ? (
                <p className="mt-4 text-sm text-cyan-300">Cargando cuentas…</p>
              ) : null}
              {error ? (
                <p className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </p>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
