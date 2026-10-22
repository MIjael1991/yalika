'use client';

import Link from 'next/link';
import QRCode from 'qrcode';
import { useEffect, useMemo, useState } from 'react';
import { ReturnsLogPanel } from './returns-log-panel';
import { SalesReportPanel } from './sales-report-panel';

type OrderItemSummary = {
  id: string;
  productName: string;
  sku: string | null;
  quantity: number;
};

export type OrderSummary = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  total: number;
  createdAt: string;
  confirmedAt: string | null;
  customer: {
    name: string;
  } | null;
  items: OrderItemSummary[];
};

export type ReturnSummary = {
  id: string;
  orderId: string;
  status: string;
  createdAt: string;
  returnNumber?: string;
  type?: string;
  reason?: string;
  totalAmount?: number;
  completedAt?: string | null;
  order?: { orderNumber: string } | null;
  authorizedBy?: { id: string; name: string } | null;
  items: Array<{
    orderItemId: string;
    quantity: number;
  }>;
  refunds: Array<{
    amount: number;
    status: string;
    refundedAt: string;
    method?: string;
    processedBy?: { id: string; name: string } | null;
  }>;
};

type Ticket = {
  orderNumber: string;
  status: string;
  paymentStatus: string;
  benefitClaim: {
    siteSlug: string;
    orderId: string;
    token: string;
  } | null;
  date: string;
  business: {
    name: string;
  };
  customer: {
    name: string;
    phone: string | null;
  } | null;
  items: Array<{
    name: string;
    variant: string | null;
    sku: string | null;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    discount: number;
    total: number;
  }>;
  totals: {
    subtotal: number;
    discount: number;
    total: number;
    paid: number;
    remaining: number;
    change: number;
  };
  payments: Array<{
    method: string;
    amount: number;
    receivedAmount: number | null;
    change: number;
    reference: string | null;
    paidAt: string;
  }>;
};

const money = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
});

const paymentLabels: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
};

function getErrorMessage(value: unknown) {
  if (
    value &&
    typeof value === 'object' &&
    'message' in value &&
    typeof value.message === 'string'
  ) {
    return value.message;
  }

  return 'No fue posible consultar la venta';
}

async function apiRequest<T>(path: string) {
  const response = await fetch(`/api/yalika/${path}`, {
    cache: 'no-store',
  });
  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new Error(getErrorMessage(payload));
  }

  return payload as T;
}

export function SalesHistoryWorkspace({
  companyId,
  isCashier,
  initialOrders,
  initialReturns,
  initialError,
}: {
  companyId: string;
  isCashier: boolean;
  initialOrders: OrderSummary[];
  initialReturns: ReturnSummary[];
  initialError: string;
}) {
  const [search, setSearch] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [ticket, setTicket] = useState<Ticket>();
  const [ticketQr, setTicketQr] = useState({
    orderId: '',
    dataUrl: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);

  const paidOrders = useMemo(
    () =>
      initialOrders.filter(
        (order) =>
          order.status === 'confirmed' && order.paymentStatus === 'paid',
      ),
    [initialOrders],
  );

  const completedReturns = useMemo(
    () => initialReturns.filter((record) => record.status === 'completed'),
    [initialReturns],
  );

  function returnedQuantity(orderId: string, orderItemId: string) {
    return completedReturns
      .filter((record) => record.orderId === orderId)
      .flatMap((record) => record.items)
      .filter((item) => item.orderItemId === orderItemId)
      .reduce((total, item) => total + item.quantity, 0);
  }

  function isFullyReturned(order: OrderSummary) {
    return (
      order.items.length > 0 &&
      order.items.every(
        (item) => returnedQuantity(order.id, item.id) >= item.quantity,
      )
    );
  }

  function refundedForOrder(orderId: string) {
    return completedReturns
      .filter((record) => record.orderId === orderId)
      .flatMap((record) => record.refunds)
      .filter((refund) => refund.status === 'completed')
      .reduce((total, refund) => total + refund.amount, 0);
  }

  const filteredOrders = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('es-MX');

    return paidOrders.filter((order) =>
      [
        order.orderNumber,
        order.customer?.name,
        ...order.items.flatMap((item) => [item.productName, item.sku]),
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('es-MX')
        .includes(normalized),
    );
  }, [paidOrders, search]);

  const todayKey = new Date().toLocaleDateString('en-CA');
  const todayOrders = paidOrders.filter(
    (order) =>
      new Date(order.confirmedAt ?? order.createdAt).toLocaleDateString(
        'en-CA',
      ) === todayKey,
  );
  const todayTotal = todayOrders.reduce(
    (total, order) => total + order.total,
    0,
  );
  const todayRefundTotal = completedReturns
    .flatMap((record) => record.refunds)
    .filter(
      (refund) =>
        refund.status === 'completed' &&
        new Date(refund.refundedAt).toLocaleDateString('en-CA') === todayKey,
    )
    .reduce((total, refund) => total + refund.amount, 0);
  const todayNetTotal = todayTotal - todayRefundTotal;
  const selectedOrder = paidOrders.find((order) => order.id === selectedOrderId);
  const selectedRefunded = selectedOrder
    ? refundedForOrder(selectedOrder.id)
    : 0;
  const selectedFullyReturned = selectedOrder
    ? isFullyReturned(selectedOrder)
    : false;

  useEffect(() => {
    const claim = ticket?.benefitClaim;

    if (!claim) {
      return;
    }

    const url = `${window.location.origin}/r/${claim.siteSlug}?ticket=${encodeURIComponent(
      claim.orderId,
    )}&token=${encodeURIComponent(claim.token)}`;
    let cancelled = false;

    void QRCode.toDataURL(url, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: 'H',
    }).then((dataUrl) => {
      if (!cancelled) {
        setTicketQr({
          orderId: claim.orderId,
          dataUrl,
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [ticket?.benefitClaim]);

  const ticketQrDataUrl =
    ticket?.benefitClaim?.orderId === ticketQr.orderId
      ? ticketQr.dataUrl
      : '';

  async function selectOrder(order: OrderSummary) {
    setSelectedOrderId(order.id);
    setTicket(undefined);
    setLoading(true);
    setError('');

    try {
      const result = await apiRequest<{ ticket: Ticket }>(
        `order/${order.id}/ticket`,
      );
      setTicket(result.ticket);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No fue posible consultar la venta',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#07101f] text-slate-100">
      <header className="border-b border-slate-800/80 bg-slate-950/70 px-4 py-4 md:px-6">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-400">
              Yalika / Ventas
            </p>
            <h1 className="mt-1 text-2xl font-semibold">Historial de ventas</h1>
          </div>
          <Link
            href="/pos"
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-center text-sm font-semibold text-slate-200 hover:border-cyan-400/50"
          >
            ← Regresar a Punto de venta
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] p-4 md:p-6">
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs text-slate-500">Cobros registrados hoy</p>
            <p className="mt-2 text-2xl font-bold text-cyan-300">
              {todayOrders.length}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs text-slate-500">Venta neta hoy</p>
            <p className="mt-2 text-2xl font-bold text-emerald-300">
              {money.format(todayNetTotal)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs text-slate-500">Reembolsado hoy</p>
            <p className="mt-2 text-2xl font-bold text-amber-300">
              {money.format(todayRefundTotal)}
            </p>
          </div>
        </div>

        {!isCashier && companyId ? <SalesReportPanel companyId={companyId} /> : null}
        {!isCashier ? <ReturnsLogPanel returns={initialReturns} /> : null}

        <div className="grid gap-5 xl:grid-cols-[minmax(360px,0.8fr)_minmax(0,1.2fr)]">
          <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
            <h2 className="text-lg font-semibold">Buscar comprobante</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Aquí aparecen únicamente las ventas con cobro completado. Las
              ventas canceladas antes de pagar no forman parte del historial.
            </p>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Folio, producto, SKU o cliente…"
              className="mt-4 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 outline-none placeholder:text-slate-600 focus:border-cyan-400"
            />

            <div className="mt-4 max-h-[62vh] space-y-2 overflow-y-auto pr-1">
              {filteredOrders.map((order) => (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => void selectOrder(order)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    selectedOrderId === order.id
                      ? 'border-cyan-400/60 bg-cyan-400/10'
                      : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">
                        {order.orderNumber}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {new Date(
                          order.confirmedAt ?? order.createdAt,
                        ).toLocaleString('es-MX')}
                      </p>
                    </div>
                    <p className="font-semibold text-cyan-300">
                      {money.format(order.total)}
                    </p>
                  </div>
                  <p className="mt-3 truncate text-xs text-slate-400">
                    {order.items
                      .map((item) => `${item.quantity} × ${item.productName}`)
                      .join(', ')}
                  </p>
                  {isFullyReturned(order) ? (
                    <p className="mt-2 text-xs font-semibold text-amber-300">
                      Anulada y reembolsada
                    </p>
                  ) : refundedForOrder(order.id) > 0 ? (
                    <p className="mt-2 text-xs font-semibold text-amber-300">
                      Devolución parcial · {money.format(refundedForOrder(order.id))}
                    </p>
                  ) : null}
                </button>
              ))}

              {filteredOrders.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">
                  No encontramos una venta pagada.
                </p>
              ) : null}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-900 p-5 md:p-6">
            {loading ? (
              <div className="flex min-h-[520px] items-center justify-center text-slate-400">
                Consultando venta…
              </div>
            ) : ticket ? (
              <div data-print-ticket>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
                  Comprobante guardado
                </p>
                <h2 className="mt-2 break-all text-2xl font-semibold">
                  {ticket.orderNumber}
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  {ticket.business.name} ·{' '}
                  {new Date(ticket.date).toLocaleString('es-MX')}
                </p>

                <div className="mt-6 space-y-3 border-y border-slate-800 py-5 text-sm">
                  {ticket.items.map((item, index) => (
                    <div
                      key={`${item.sku ?? item.name}-${index}`}
                      className="flex justify-between gap-4"
                    >
                      <div>
                        <p>{item.quantity} × {item.name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {item.variant ?? item.sku ?? 'Producto'}
                        </p>
                      </div>
                      <span>{money.format(item.total)}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-5 space-y-2 text-sm">
                  <div className="flex justify-between text-slate-400">
                    <span>Subtotal</span>
                    <span>{money.format(ticket.totals.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-300">
                    <span>Descuentos</span>
                    <span>− {money.format(ticket.totals.discount)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-800 pt-4 text-lg font-bold">
                    <span>Total pagado</span>
                    <span>{money.format(ticket.totals.paid)}</span>
                  </div>
                  {ticket.totals.change > 0 ? (
                    <div className="flex justify-between rounded-xl bg-amber-400/10 px-3 py-3 font-semibold text-amber-300">
                      <span>Cambio entregado</span>
                      <span>{money.format(ticket.totals.change)}</span>
                    </div>
                  ) : null}
                </div>

                <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm">
                  <p className="font-semibold text-slate-300">Pago</p>
                  {ticket.payments.map((payment, index) => (
                    <p key={`${payment.paidAt}-${index}`} className="mt-2 text-slate-400">
                      {paymentLabels[payment.method] ?? payment.method} ·{' '}
                      {money.format(payment.amount)}
                      {payment.reference ? ` · ${payment.reference}` : ''}
                    </p>
                  ))}
                </div>

                {ticket.benefitClaim ? (
                  <div className="mt-5 text-center">
                    {ticketQrDataUrl ? (
                      <img
                        src={ticketQrDataUrl}
                        alt="QR único de esta compra pagada"
                        className="mx-auto h-44 w-44 rounded-xl bg-white p-2"
                      />
                    ) : (
                      <div className="mx-auto flex h-44 w-44 items-center justify-center rounded-xl bg-white p-4 text-xs text-slate-600">
                        Preparando QR…
                      </div>
                    )}
                    <p className="mx-auto mt-3 max-w-sm text-xs leading-5 text-slate-400">
                      El cliente puede escanear este ticket pagado para registrar
                      o consultar sus beneficios.
                    </p>
                  </div>
                ) : null}

                {selectedRefunded > 0 ? (
                  <div className="mt-5 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-200">
                    <p className="font-semibold">
                      {selectedFullyReturned
                        ? 'Venta anulada y reembolsada'
                        : 'Esta venta tiene una devolución parcial'}
                    </p>
                    <p className="mt-1">
                      Reembolsado: {money.format(selectedRefunded)}. El movimiento permanece visible por auditoría.
                    </p>
                  </div>
                ) : null}

                <div className="mt-6 grid gap-3 sm:grid-cols-2 print:hidden">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="h-12 rounded-xl bg-cyan-400 font-bold text-slate-950 hover:bg-cyan-300"
                  >
                    Reimprimir comprobante
                  </button>
                  {selectedFullyReturned ? (
                    <span className="flex h-12 items-center justify-center rounded-xl border border-slate-800 bg-slate-950/50 font-semibold text-slate-500">
                      Devuelta por completo
                    </span>
                  ) : (
                    <Link
                      href={`/pos/devoluciones?orderId=${encodeURIComponent(selectedOrderId)}`}
                      className="flex h-12 items-center justify-center rounded-xl border border-slate-700 font-semibold text-slate-300 hover:bg-slate-800"
                    >
                      Procesar devolución autorizada
                    </Link>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex min-h-[520px] flex-col items-center justify-center text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800 text-2xl text-slate-500">
                  ▤
                </div>
                <h2 className="mt-5 text-xl font-semibold text-slate-300">
                  Selecciona una venta
                </h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
                  Consulta productos, pago, cambio y vuelve a imprimir el comprobante.
                </p>
                {error ? (
                  <p className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                    {error}
                  </p>
                ) : null}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
