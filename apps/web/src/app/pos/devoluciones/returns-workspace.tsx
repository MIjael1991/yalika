'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type OrderItem = {
  id: string;
  productName: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  discount: number;
  total: number;
  product: {
    trackInventory: boolean;
  };
  variant: {
    name: string;
  } | null;
};

export type Order = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  subtotal: number;
  discount: number;
  total: number;
  createdAt: string;
  items: OrderItem[];
};

type ReturnItem = {
  id: string;
  orderItemId: string;
  quantity: number;
  restockedQuantity: number;
};

export type ReturnRecord = {
  id: string;
  returnNumber: string;
  status: string;
  reason: string;
  totalAmount: number;
  orderId: string;
  createdAt: string;
  items: ReturnItem[];
  refunds: Array<{
    id: string;
    amount: number;
    method: string;
    status: string;
  }>;
};

type Payment = {
  id: string;
  method: string;
  amount: number;
  reference: string | null;
  status: string;
};

type ConfirmReturnResult = {
  return: ReturnRecord;
  inventoryEffects: Array<{
    product: string;
    type: string;
    detail: string;
  }>;
};

type RefundResult =
  | {
      refund: {
        id: string;
        amount: number;
        method: string;
      };
      summary: {
        refundedNow: number;
        remainingToRefund: number;
      };
    }
  | {
      id: string;
      amount: number;
      method: string;
    };

type CompletedResult = {
  returnNumber: string;
  orderNumber: string;
  amount: number;
  method: string;
  inventoryEffects: ConfirmReturnResult['inventoryEffects'];
};

const money = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
});

const reasonOptions = [
  ['customer_changed_mind', 'El cliente cambió de opinión'],
  ['wrong_item', 'Producto equivocado'],
  ['wrong_size_or_color', 'Talla o color incorrecto'],
  ['defective', 'Producto defectuoso'],
  ['damaged', 'Producto dañado'],
  ['incomplete', 'Producto incompleto'],
  ['quality_issue', 'Problema de calidad'],
  ['order_error', 'Error en la venta'],
  ['warranty', 'Garantía'],
  ['other', 'Otro motivo'],
] as const;

const conditionOptions = [
  ['sellable', 'En buen estado'],
  ['opened', 'Abierto'],
  ['damaged', 'Dañado'],
  ['defective', 'Defectuoso'],
  ['incomplete', 'Incompleto'],
  ['other', 'Otro'],
] as const;

const dispositionOptions = [
  ['restock', 'Regresar al inventario'],
  ['no_restock', 'No regresar al inventario'],
  ['quarantine', 'Enviar a revisión'],
  ['discard', 'Desechar'],
] as const;

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

function refundAmount(result: RefundResult) {
  return 'refund' in result ? result.refund.amount : result.amount;
}

function refundMethod(result: RefundResult) {
  return 'refund' in result ? result.refund.method : result.method;
}

export function ReturnsWorkspace({
  companyId,
  authorizedUserId,
  initialOrders,
  initialReturns,
  initialError,
}: {
  companyId: string;
  authorizedUserId: string;
  initialOrders: Order[];
  initialReturns: ReturnRecord[];
  initialError: string;
}) {
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState(initialOrders);
  const [returns, setReturns] = useState(initialReturns);
  const [search, setSearch] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('customer_changed_mind');
  const [condition, setCondition] = useState('sellable');
  const [disposition, setDisposition] = useState('restock');
  const [notes, setNotes] = useState('');
  const [refundMethodValue, setRefundMethodValue] = useState('cash');
  const [paymentId, setPaymentId] = useState('');
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(initialError);
  const [result, setResult] = useState<CompletedResult>();
  const [pendingReturn, setPendingReturn] = useState<ReturnRecord>();
  const [returnOperationId, setReturnOperationId] = useState('');
  const [refundOperationId, setRefundOperationId] = useState('');
  const requestedOrderId = searchParams.get('orderId') ?? '';

  const paidOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.status === 'confirmed' && order.paymentStatus === 'paid',
      ),
    [orders],
  );

  const filteredOrders = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('es-MX');

    return paidOrders.filter((order) => {
      const searchable = [
        order.orderNumber,
        ...order.items.flatMap((item) => [item.productName, item.sku]),
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('es-MX');

      return searchable.includes(normalized);
    });
  }, [paidOrders, search]);

  const selectedOrder = orders.find((order) => order.id === selectedOrderId);

  function returnedQuantity(orderItemId: string) {
    return returns
      .filter((returnRecord) => returnRecord.status === 'completed')
      .flatMap((returnRecord) => returnRecord.items)
      .filter((item) => item.orderItemId === orderItemId)
      .reduce((total, item) => total + item.quantity, 0);
  }

  function remainingReturnQuantity(order: Order) {
    return order.items.reduce(
      (total, item) =>
        total + Math.max(item.quantity - returnedQuantity(item.id), 0),
      0,
    );
  }

  function activeReturnForOrder(orderId: string) {
    return returns.find(
      (returnRecord) =>
        returnRecord.orderId === orderId &&
        ['draft', 'processing'].includes(returnRecord.status),
    );
  }

  const selectedItems = selectedOrder?.items.filter(
    (item) => Number(quantities[item.id] ?? 0) > 0,
  ) ?? [];

  const estimatedRefund = selectedItems.reduce((total, item) => {
    const quantity = Number(quantities[item.id] ?? 0);
    return total + (item.total / item.quantity) * quantity;
  }, 0);

  async function refreshData() {
    if (!companyId) {
      return;
    }

    const [nextOrders, nextReturns] = await Promise.all([
      apiRequest<Order[]>(`order/company/${companyId}`),
      apiRequest<ReturnRecord[]>(`return/company/${companyId}`),
    ]);

    setOrders(nextOrders);
    setReturns(nextReturns);
  }

  async function selectOrder(order: Order) {
    const activeReturn = activeReturnForOrder(order.id);

    if (activeReturn) {
      setSelectedOrderId(order.id);
      setPendingReturn(activeReturn);
      setResult(undefined);
      setError('');
      return;
    }

    setPendingReturn(undefined);
    setSelectedOrderId(order.id);
    setQuantities({});
    setPayments([]);
    setResult(undefined);
    setError('');
    setReturnOperationId('');
    setRefundOperationId('');
    setLoadingPayments(true);

    try {
      const orderPayments = await apiRequest<Payment[]>(
        `payment/order/${order.id}`,
      );
      setPayments(orderPayments);

      const originalMethod = orderPayments[0]?.method;
      const nextMethod = ['cash', 'card', 'transfer'].includes(originalMethod)
        ? originalMethod
        : 'cash';

      setRefundMethodValue(nextMethod);
      setPaymentId(
        nextMethod === 'card'
          ? orderPayments.find((payment) => payment.method === 'card')?.id ?? ''
          : '',
      );
    } catch (paymentError) {
      setError(
        paymentError instanceof Error
          ? paymentError.message
          : 'No se pudieron consultar los pagos',
      );
    } finally {
      setLoadingPayments(false);
    }
  }

  useEffect(() => {
    if (!requestedOrderId || selectedOrderId) {
      return;
    }

    const requestedOrder = orders.find((order) => order.id === requestedOrderId);

    if (requestedOrder) {
      const timer = window.setTimeout(() => {
        void selectOrder(requestedOrder);
      }, 0);

      return () => window.clearTimeout(timer);
    }
    // The URL request is handled once; subsequent selections belong to the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, requestedOrderId, selectedOrderId]);
  async function cancelPendingReturn() {
    if (!pendingReturn) {
      return;
    }

    setProcessing(true);
    setError('');

    try {
      await apiRequest<ReturnRecord>(`return/${pendingReturn.id}/cancel`, {
        method: 'POST',
      });
      await refreshData();
      setPendingReturn(undefined);
      setSelectedOrderId('');
    } catch (cancelError) {
      setError(
        cancelError instanceof Error
          ? cancelError.message
          : 'No fue posible cancelar la devolución pendiente',
      );
    } finally {
      setProcessing(false);
    }
  }

  function updateCondition(nextCondition: string) {
    setCondition(nextCondition);
    setDisposition(nextCondition === 'sellable' ? 'restock' : 'no_restock');
  }

  function updateRefundMethod(nextMethod: string) {
    setRefundMethodValue(nextMethod);
    setPaymentId(
      nextMethod === 'card'
        ? payments.find((payment) => payment.method === 'card')?.id ?? ''
        : '',
    );
  }

  async function processReturn(event: FormEvent) {
    event.preventDefault();

    if (!selectedOrder || !companyId || !authorizedUserId) {
      setError('Configura la caja y selecciona una venta');
      return;
    }

    if (selectedItems.length === 0) {
      setError('Selecciona al menos una cantidad para devolver');
      return;
    }

    if (disposition === 'restock' && condition !== 'sellable') {
      setError('Solo un producto en buen estado puede regresar al inventario');
      return;
    }

    if (refundMethodValue === 'card' && !paymentId) {
      setError('Selecciona el pago original de tarjeta');
      return;
    }

    for (const item of selectedItems) {
      const quantity = Number(quantities[item.id]);
      const available = item.quantity - returnedQuantity(item.id);

      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > available) {
        setError(`La cantidad de ${item.productName} no es válida`);
        return;
      }

      if (disposition === 'restock' && !item.product.trackInventory) {
        setError(`${item.productName} no controla inventario`);
        return;
      }
    }

    const nextReturnOperationId =
      returnOperationId || crypto.randomUUID();
    const nextRefundOperationId =
      refundOperationId || crypto.randomUUID();

    setReturnOperationId(nextReturnOperationId);
    setRefundOperationId(nextRefundOperationId);
    setProcessing(true);
    setError('');

    try {
      const created = await apiRequest<ReturnRecord>('return', {
        method: 'POST',
        body: JSON.stringify({
          companyId,
          orderId: selectedOrder.id,
          authorizedById: authorizedUserId,
          type: 'return',
          reason,
          notes: notes.trim() || undefined,
          operationId: nextReturnOperationId,
          items: selectedItems.map((item) => ({
            orderItemId: item.id,
            quantity: Number(quantities[item.id]),
            condition,
            disposition,
          })),
        }),
      });

      const confirmed =
        created.status === 'completed'
          ? {
              return: created,
              inventoryEffects: [] as ConfirmReturnResult['inventoryEffects'],
            }
          : await apiRequest<ConfirmReturnResult>(
              `return/${created.id}/confirm`,
              { method: 'POST' },
            );

      const refunded = await apiRequest<RefundResult>(
        `return/${confirmed.return.id}/refund`,
        {
          method: 'POST',
          body: JSON.stringify({
            processedById: authorizedUserId,
            method: refundMethodValue,
            paymentId: refundMethodValue === 'card' ? paymentId : undefined,
            notes: 'Reembolso procesado desde ORION Punto de Venta',
            operationId: nextRefundOperationId,
          }),
        },
      );

      setResult({
        returnNumber: confirmed.return.returnNumber,
        orderNumber: selectedOrder.orderNumber,
        amount: refundAmount(refunded),
        method: refundMethod(refunded),
        inventoryEffects: confirmed.inventoryEffects,
      });
      setQuantities({});
      setReturnOperationId('');
      setRefundOperationId('');
      await refreshData();
    } catch (processError) {
      setError(
        processError instanceof Error
          ? processError.message
          : 'No fue posible procesar la devolución',
      );
    } finally {
      setProcessing(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#07101f] text-slate-100">
      <header className="border-b border-slate-800/80 bg-slate-950/70 px-4 py-4 md:px-6">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-400">
              ORION / Postventa
            </p>
            <h1 className="mt-1 text-2xl font-semibold">Devoluciones</h1>
          </div>

          <Link
            href="/pos"
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-center text-sm font-semibold text-slate-200 hover:border-cyan-400/50"
          >
            ← Regresar a Punto de venta
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-5 p-4 md:p-6 xl:grid-cols-[minmax(360px,0.8fr)_minmax(0,1.2fr)]">
        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
                Ventas pagadas
              </p>
              <h2 className="mt-1 text-lg font-semibold">Buscar venta</h2>
            </div>
            <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-400">
              {filteredOrders.length}
            </span>
          </div>

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Folio, producto o SKU…"
            className="mt-4 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 outline-none placeholder:text-slate-600 focus:border-cyan-400"
          />

          <div className="mt-4 max-h-[65vh] space-y-2 overflow-y-auto pr-1">
            {filteredOrders.map((order) => {
              const activeReturn = activeReturnForOrder(order.id);
              const remaining = remainingReturnQuantity(order);
              const fullyReturned = remaining <= 0.000001;

              return (
                <button
                  key={order.id}
                  type="button"
                  disabled={fullyReturned}
                  onClick={() => void selectOrder(order)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    selectedOrderId === order.id
                      ? 'border-cyan-400/60 bg-cyan-400/10'
                      : fullyReturned
                        ? 'cursor-not-allowed border-slate-800 bg-slate-950/40 opacity-65'
                        : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">
                        {order.orderNumber}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {new Date(order.createdAt).toLocaleString('es-MX')}
                      </p>
                    </div>
                    <p className="font-semibold text-cyan-300">
                      {money.format(order.total)}
                    </p>
                  </div>
                  <p className="mt-3 truncate text-xs text-slate-400">
                    {order.items.map((item) => item.productName).join(', ')}
                  </p>
                  {activeReturn ? (
                    <p className="mt-2 text-xs font-medium text-amber-300">
                      Devolución pendiente
                    </p>
                  ) : fullyReturned ? (
                    <p className="mt-2 text-xs font-medium text-emerald-300">
                      Devuelta por completo
                    </p>
                  ) : (
                    <p className="mt-2 text-xs font-medium text-slate-500">
                      {remaining} {remaining === 1 ? 'unidad disponible' : 'unidades disponibles'} para devolver
                    </p>
                  )}
                </button>
              );
            })}

            {filteredOrders.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">
                No encontramos una venta pagada.
              </p>
            ) : null}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-5 md:p-6">
          {result ? (
            <div className="flex min-h-[520px] flex-col items-center justify-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400 text-3xl font-bold text-slate-950">
                ✓
              </div>
              <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
                Devolución completada
              </p>
              <h2 className="mt-2 text-2xl font-semibold">{result.returnNumber}</h2>
              <p className="mt-2 text-sm text-slate-400">
                Venta original: {result.orderNumber}
              </p>
              <p className="mt-5 text-sm text-slate-400">Reembolso procesado</p>
              <p className="mt-1 text-4xl font-bold text-white">
                {money.format(result.amount)}
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Método: {result.method}
              </p>

              {result.inventoryEffects.length > 0 ? (
                <div className="mt-6 w-full max-w-lg space-y-2 text-left">
                  {result.inventoryEffects.map((effect, index) => (
                    <div
                      key={`${effect.product}-${index}`}
                      className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"
                    >
                      <p className="font-semibold">{effect.product}</p>
                      <p className="mt-1 text-emerald-300/80">{effect.detail}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => {
                  setResult(undefined);
                  setSelectedOrderId('');
                  setError('');
                }}
                className="mt-7 h-12 rounded-xl bg-cyan-400 px-8 font-bold text-slate-950 hover:bg-cyan-300"
              >
                Devolver otra venta
              </button>
            </div>
          ) : pendingReturn ? (
            <div className="flex min-h-[520px] flex-col items-center justify-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-400 text-2xl font-bold text-slate-950">
                !
              </div>
              <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
                Devolución interrumpida
              </p>
              <h2 className="mt-2 text-2xl font-semibold">
                {pendingReturn.returnNumber}
              </h2>
              <p className="mt-3 max-w-md text-sm leading-6 text-slate-400">
                Esta devolución quedó en borrador antes de afectar el inventario. Puedes cancelarla de forma segura y comenzar nuevamente.
              </p>
              {error ? (
                <p className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </p>
              ) : null}
              <button
                type="button"
                disabled={processing}
                onClick={() => void cancelPendingReturn()}
                className="mt-7 h-12 rounded-xl border border-amber-400/40 bg-amber-400/10 px-7 font-bold text-amber-200 hover:bg-amber-400/20 disabled:opacity-50"
              >
                {processing ? 'Cancelando…' : 'Cancelar y volver a comenzar'}
              </button>
            </div>
          ) : selectedOrder ? (
            <form onSubmit={(event) => void processReturn(event)}>
              <div className="flex flex-col gap-3 border-b border-slate-800 pb-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
                    Venta seleccionada
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">
                    {selectedOrder.orderNumber}
                  </h2>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-xs text-slate-500">Total pagado</p>
                  <p className="mt-1 text-xl font-bold text-white">
                    {money.format(selectedOrder.total)}
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                <p className="text-sm font-semibold text-slate-300">
                  Cantidades a devolver
                </p>
                {selectedOrder.items.map((item) => {
                  const available = Math.max(
                    item.quantity - returnedQuantity(item.id),
                    0,
                  );

                  return (
                    <div
                      key={item.id}
                      className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 sm:grid-cols-[1fr_120px] sm:items-center"
                    >
                      <div>
                        <p className="font-medium text-white">{item.productName}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {item.variant?.name ?? item.sku ?? 'Sin variante'} · Comprado: {item.quantity} · Disponible: {available}
                        </p>
                        <p className="mt-2 text-sm font-semibold text-cyan-300">
                          {money.format(item.total / item.quantity)} netos por unidad
                        </p>
                      </div>
                      <input
                        aria-label={`Cantidad de ${item.productName}`}
                        type="number"
                        min="0"
                        max={available}
                        step="1"
                        disabled={available <= 0 || processing}
                        value={quantities[item.id] ?? ''}
                        onChange={(event) => {
                          setQuantities((current) => ({
                            ...current,
                            [item.id]: event.target.value,
                          }));
                          setError('');
                        }}
                        placeholder="0"
                        className="h-12 rounded-xl border border-slate-700 bg-slate-900 px-3 text-center font-semibold outline-none focus:border-cyan-400 disabled:opacity-40"
                      />
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="text-sm font-medium text-slate-300">
                  Motivo
                  <select
                    value={reason}
                    disabled={processing}
                    onChange={(event) => setReason(event.target.value)}
                    className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:border-cyan-400"
                  >
                    {reasonOptions.map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-medium text-slate-300">
                  Estado del producto
                  <select
                    value={condition}
                    disabled={processing}
                    onChange={(event) => updateCondition(event.target.value)}
                    className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:border-cyan-400"
                  >
                    {conditionOptions.map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-medium text-slate-300">
                  Destino
                  <select
                    value={disposition}
                    disabled={processing}
                    onChange={(event) => setDisposition(event.target.value)}
                    className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:border-cyan-400"
                  >
                    {dispositionOptions.map(([value, label]) => (
                      <option
                        key={value}
                        value={value}
                        disabled={value === 'restock' && condition !== 'sellable'}
                      >
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-medium text-slate-300">
                  Método de reembolso
                  <select
                    value={refundMethodValue}
                    disabled={loadingPayments || processing}
                    onChange={(event) => updateRefundMethod(event.target.value)}
                    className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:border-cyan-400"
                  >
                    <option value="cash">Efectivo</option>
                    <option value="card">Tarjeta</option>
                    <option value="transfer">Transferencia</option>
                  </select>
                </label>
              </div>

              {refundMethodValue === 'card' ? (
                <label className="mt-4 block text-sm font-medium text-slate-300">
                  Pago original de tarjeta
                  <select
                    required
                    value={paymentId}
                    disabled={processing}
                    onChange={(event) => setPaymentId(event.target.value)}
                    className="mt-2 h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:border-cyan-400"
                  >
                    <option value="">Seleccionar pago</option>
                    {payments
                      .filter((payment) => payment.method === 'card')
                      .map((payment) => (
                        <option key={payment.id} value={payment.id}>
                          {money.format(payment.amount)} {payment.reference ? `· ${payment.reference}` : ''}
                        </option>
                      ))}
                  </select>
                </label>
              ) : null}

              <label className="mt-4 block text-sm font-medium text-slate-300">
                Notas (opcional)
                <textarea
                  value={notes}
                  disabled={processing}
                  onChange={(event) => setNotes(event.target.value)}
                  maxLength={1000}
                  rows={3}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm outline-none focus:border-cyan-400"
                />
              </label>

              {error ? (
                <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </p>
              ) : null}

              <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs text-slate-500">Reembolso estimado</p>
                  <p className="mt-1 text-2xl font-bold text-cyan-300">
                    {money.format(estimatedRefund)}
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={processing || loadingPayments || selectedItems.length === 0}
                  className="h-12 rounded-xl bg-cyan-400 px-6 font-bold text-slate-950 hover:bg-cyan-300 disabled:bg-slate-700 disabled:text-slate-500"
                >
                  {processing ? 'Procesando…' : 'Confirmar y reembolsar'}
                </button>
              </div>
            </form>
          ) : (
            <div className="flex min-h-[520px] flex-col items-center justify-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800 text-2xl text-slate-500">
                ↩
              </div>
              <h2 className="mt-5 text-xl font-semibold text-slate-300">
                Selecciona una venta
              </h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
                Busca el folio o producto. ORION mostrará únicamente las cantidades que todavía pueden devolverse.
              </p>
              {!companyId || !authorizedUserId ? (
                <p className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                  Falta configurar la empresa o el usuario autorizador en la caja.
                </p>
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
