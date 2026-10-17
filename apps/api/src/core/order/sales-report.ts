import { BadRequestException } from '@nestjs/common';

/**
 * Reporte de ventas por fechas (solo lectura).
 *
 * Reglas del reporte:
 * - Venta = pedido confirmado y pagado por completo, contado en el día en que se
 *   confirmó (o se creó, si no tiene fecha de confirmación).
 * - Devolución = devolución terminada, contada el día en que terminó. Incluye los
 *   cambios (el crédito del cambio sale de aquí, no del dinero de la caja).
 * - Dinero cobrado = pagos completados por método, el día en que se cobraron. El
 *   crédito por cambio (`return_credit`) no es dinero: se muestra aparte.
 * - Dinero devuelto = reembolsos completados por método, el día en que se hicieron.
 * - Venta neta = ventas − devoluciones.
 * - Los días se agrupan en la zona horaria del negocio, no en UTC.
 */

export const DEFAULT_REPORT_TIME_ZONE = 'America/Mexico_City';
export const MAX_REPORT_DAYS = 366;
/** Tope de renglones de detalle (para el Excel); los totales siempre usan todo. */
export const MAX_DETAIL_ROWS = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ReportOrder = {
  orderNumber?: string;
  customerName?: string | null;
  payments?: Array<{ method: string; amount: number; status: string }>;
  total: number;
  discount: number;
  confirmedAt: Date | null;
  createdAt: Date;
  items: Array<{
    productName: string;
    sku: string | null;
    quantity: number;
    total: number;
  }>;
};
export type ReportPayment = { method: string; amount: number; paidAt: Date };
export type ReportRefund = {
  method: string;
  amount: number;
  refundedAt: Date;
};
export type ReportReturn = {
  returnNumber?: string;
  reason?: string;
  orderNumber?: string;
  refunded?: number;
  type: string;
  totalAmount: number;
  completedAt: Date | null;
};
export type ReportPendingOrder = { total: number };

export type SalesReportInput = {
  orders: ReportOrder[];
  payments: ReportPayment[];
  refunds: ReportRefund[];
  returns: ReportReturn[];
  pendingOrders: ReportPendingOrder[];
  timeZone: string;
};

export type SalesReport = {
  timeZone: string;
  tickets: Array<{
    orderNumber: string;
    date: string;
    day: string;
    customer: string | null;
    discount: number;
    total: number;
    methods: Array<{ method: string; amount: number }>;
  }>;
  ticketsTruncated: boolean;
  returnsDetail: Array<{
    returnNumber: string;
    date: string;
    day: string;
    orderNumber: string;
    type: string;
    reason: string;
    amount: number;
    refunded: number;
  }>;
  products: Array<{
    name: string;
    sku: string | null;
    quantity: number;
    total: number;
  }>;
  totals: {
    orders: number;
    gross: number;
    discounts: number;
    returns: number;
    returnsAmount: number;
    net: number;
    averageTicket: number;
    units: number;
    refundedCash: number;
    pendingOrders: number;
    pendingAmount: number;
  };
  paymentsByMethod: Array<{ method: string; count: number; amount: number }>;
  refundsByMethod: Array<{ method: string; count: number; amount: number }>;
  exchangeCredit: number;
  byDay: Array<{
    date: string;
    orders: number;
    gross: number;
    returnsAmount: number;
    net: number;
  }>;
  topProducts: Array<{
    name: string;
    sku: string | null;
    quantity: number;
    total: number;
  }>;
};

const cents = (value: number) => Math.round((value + Number.EPSILON) * 100);
const money = (value: number) => value / 100;

export function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Día calendario (AAAA-MM-DD) de un instante en la zona horaria dada. */
export function dayKey(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Valida el rango recibido: `from` inclusivo y `to` exclusivo (instantes ISO).
 * El cliente manda la medianoche local del primer día y la medianoche local del
 * día siguiente al último.
 */
export function parseReportRange(
  fromRaw: string | undefined,
  toRaw: string | undefined,
  timeZoneRaw?: string,
) {
  if (!fromRaw || !toRaw) {
    throw new BadRequestException('Indica la fecha inicial y la final');
  }

  const from = new Date(fromRaw);
  const to = new Date(toRaw);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new BadRequestException('Las fechas del reporte no son válidas');
  }

  if (to.getTime() <= from.getTime()) {
    throw new BadRequestException(
      'La fecha final debe ser posterior a la inicial',
    );
  }

  if ((to.getTime() - from.getTime()) / DAY_MS > MAX_REPORT_DAYS + 1) {
    throw new BadRequestException(
      `El reporte no puede abarcar más de ${MAX_REPORT_DAYS} días`,
    );
  }

  const timeZone = timeZoneRaw?.trim() || DEFAULT_REPORT_TIME_ZONE;

  if (!isValidTimeZone(timeZone)) {
    throw new BadRequestException('La zona horaria no es válida');
  }

  return { from, to, timeZone };
}

function groupByMethod(rows: Array<{ method: string; amount: number }>) {
  const groups = new Map<string, { count: number; cents: number }>();

  for (const row of rows) {
    const group = groups.get(row.method) ?? { count: 0, cents: 0 };
    group.count += 1;
    group.cents += cents(row.amount);
    groups.set(row.method, group);
  }

  return Array.from(groups, ([method, group]) => ({
    method,
    count: group.count,
    amount: money(group.cents),
  })).sort((a, b) => b.amount - a.amount || a.method.localeCompare(b.method));
}

export function buildSalesReport(input: SalesReportInput): SalesReport {
  const { timeZone } = input;

  let grossCents = 0;
  let discountCents = 0;
  let units = 0;
  const days = new Map<
    string,
    { orders: number; gross: number; returns: number }
  >();
  const products = new Map<
    string,
    { name: string; sku: string | null; quantity: number; cents: number }
  >();

  const day = (key: string) => {
    const current = days.get(key) ?? { orders: 0, gross: 0, returns: 0 };
    days.set(key, current);
    return current;
  };

  for (const order of input.orders) {
    const total = cents(order.total);
    grossCents += total;
    discountCents += cents(order.discount);

    const entry = day(dayKey(order.confirmedAt ?? order.createdAt, timeZone));
    entry.orders += 1;
    entry.gross += total;

    for (const item of order.items) {
      units += item.quantity;
      const key = item.sku ? `sku:${item.sku}` : `name:${item.productName}`;
      const product = products.get(key) ?? {
        name: item.productName,
        sku: item.sku,
        quantity: 0,
        cents: 0,
      };
      product.quantity += item.quantity;
      product.cents += cents(item.total);
      products.set(key, product);
    }
  }

  let returnsCents = 0;

  for (const record of input.returns) {
    const amount = cents(record.totalAmount);
    returnsCents += amount;

    if (record.completedAt) {
      day(dayKey(record.completedAt, timeZone)).returns += amount;
    }
  }

  const realPayments = input.payments.filter(
    (payment) => payment.method !== 'return_credit',
  );
  const exchangeCreditCents = input.payments
    .filter((payment) => payment.method === 'return_credit')
    .reduce((total, payment) => total + cents(payment.amount), 0);
  const refundedCents = input.refunds.reduce(
    (total, refund) => total + cents(refund.amount),
    0,
  );
  const pendingCents = input.pendingOrders.reduce(
    (total, order) => total + cents(order.total),
    0,
  );
  const orderCount = input.orders.length;

  const allProducts = Array.from(products.values())
    .map((product) => ({
      name: product.name,
      sku: product.sku,
      quantity: product.quantity,
      total: money(product.cents),
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  const allTickets = input.orders
    .map((order) => {
      const when = order.confirmedAt ?? order.createdAt;
      return {
        orderNumber: order.orderNumber ?? '',
        date: when.toISOString(),
        day: dayKey(when, timeZone),
        customer: order.customerName ?? null,
        discount: money(cents(order.discount)),
        total: money(cents(order.total)),
        methods: groupByMethod(
          (order.payments ?? []).filter(
            (payment) => payment.status === 'completed',
          ),
        ).map(({ method, amount }) => ({ method, amount })),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const allReturns = input.returns
    .filter((record) => record.completedAt)
    .map((record) => ({
      returnNumber: record.returnNumber ?? '',
      date: (record.completedAt as Date).toISOString(),
      day: dayKey(record.completedAt as Date, timeZone),
      orderNumber: record.orderNumber ?? '',
      type: record.type,
      reason: record.reason ?? '',
      amount: money(cents(record.totalAmount)),
      refunded: money(cents(record.refunded ?? 0)),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    timeZone,
    tickets: allTickets.slice(0, MAX_DETAIL_ROWS),
    ticketsTruncated: allTickets.length > MAX_DETAIL_ROWS,
    returnsDetail: allReturns.slice(0, MAX_DETAIL_ROWS),
    products: allProducts.slice(0, MAX_DETAIL_ROWS),
    totals: {
      orders: orderCount,
      gross: money(grossCents),
      discounts: money(discountCents),
      returns: input.returns.length,
      returnsAmount: money(returnsCents),
      net: money(grossCents - returnsCents),
      averageTicket:
        orderCount > 0 ? money(Math.round(grossCents / orderCount)) : 0,
      units,
      refundedCash: money(refundedCents),
      pendingOrders: input.pendingOrders.length,
      pendingAmount: money(pendingCents),
    },
    paymentsByMethod: groupByMethod(realPayments),
    refundsByMethod: groupByMethod(input.refunds),
    exchangeCredit: money(exchangeCreditCents),
    byDay: Array.from(days, ([date, value]) => ({
      date,
      orders: value.orders,
      gross: money(value.gross),
      returnsAmount: money(value.returns),
      net: money(value.gross - value.returns),
    })).sort((a, b) => a.date.localeCompare(b.date)),
    topProducts: allProducts.slice(0, 10),
  };
}
