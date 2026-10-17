// Reporte de ventas por fechas: rangos, consulta y archivo CSV. Sin React, para poder probarlo.

export type ReportPreset = 'today' | 'yesterday' | 'last7' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'custom';

export const reportPresets: Array<{ id: Exclude<ReportPreset, 'custom'>; label: string }> = [
  { id: 'today', label: 'Hoy' },
  { id: 'yesterday', label: 'Ayer' },
  { id: 'last7', label: 'Últimos 7 días' },
  { id: 'lastWeek', label: 'Semana pasada' },
  { id: 'thisMonth', label: 'Este mes' },
  { id: 'lastMonth', label: 'Mes pasado' },
];

export type SalesReport = {
  range: { from: string; to: string };
  timeZone: string;
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
  byDay: Array<{ date: string; orders: number; gross: number; returnsAmount: number; net: number }>;
  topProducts: Array<{ name: string; sku: string | null; quantity: number; total: number }>;
  /** Detalle para Excel (el servidor lo limita a 5,000 filas por tabla). */
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
  products: Array<{ name: string; sku: string | null; quantity: number; total: number }>;
};

const pad = (value: number) => String(value).padStart(2, '0');

/** AAAA-MM-DD con la fecha local del dispositivo. */
export function toDayString(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  // Rechaza días que no existen (31 de febrero) en lugar de recorrerlos.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

export function presetRange(preset: Exclude<ReportPreset, 'custom'>, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const shift = (days: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);

  switch (preset) {
    case 'today':
      return { from: toDayString(today), to: toDayString(today) };
    case 'yesterday':
      return { from: toDayString(shift(-1)), to: toDayString(shift(-1)) };
    case 'last7':
      return { from: toDayString(shift(-6)), to: toDayString(today) };
    case 'lastWeek': {
      // Semana pasada completa, de lunes a domingo.
      const sinceMonday = (today.getDay() + 6) % 7;
      return { from: toDayString(shift(-sinceMonday - 7)), to: toDayString(shift(-sinceMonday - 1)) };
    }
    case 'thisMonth':
      return { from: toDayString(new Date(today.getFullYear(), today.getMonth(), 1)), to: toDayString(today) };
    case 'lastMonth':
      return {
        from: toDayString(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
        to: toDayString(new Date(today.getFullYear(), today.getMonth(), 0)),
      };
  }
}

/**
 * Convierte "del día A al día B" (ambos incluidos) en instantes para la API:
 * la medianoche local de A y la medianoche local del día siguiente a B.
 */
export type RangeResult = { error: string } | { query: string; days: number };

export function rangeToQuery(fromDay: string, toDay: string, timeZone?: string): RangeResult {
  const from = parseDay(fromDay);
  const to = parseDay(toDay);

  if (!from || !to) return { error: 'Escribe las dos fechas completas' };
  if (to.getTime() < from.getTime()) return { error: 'La fecha final no puede ser anterior a la inicial' };

  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1);
  const days = Math.round((end.getTime() - from.getTime()) / 86_400_000);
  if (days > 366) return { error: 'El reporte no puede abarcar más de un año' };

  const params = new URLSearchParams({
    from: from.toISOString(),
    to: end.toISOString(),
    tz: timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  return { query: params.toString(), days };
}

const methodLabels: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  other: 'Otro',
  return_credit: 'Crédito por cambio',
};
export const methodLabel = (method: string) => methodLabels[method] ?? method;

/** Texto de Excel/Sheets: comillas dobles y sin fórmulas ejecutables desde un nombre de producto. */
function cell(value: string | number | null | undefined) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return value.toFixed(2).replace(/\.00$/, '');
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function reportToCsv(report: SalesReport, fromDay: string, toDay: string) {
  const rows: Array<Array<string | number | null>> = [];
  const t = report.totals;

  rows.push(['Reporte de ventas', `${fromDay} a ${toDay}`]);
  rows.push([]);
  rows.push(['Resumen']);
  rows.push(['Ventas (tickets)', t.orders]);
  rows.push(['Venta bruta', t.gross]);
  rows.push(['Descuentos otorgados', t.discounts]);
  rows.push(['Devoluciones (cantidad)', t.returns]);
  rows.push(['Devoluciones (importe)', t.returnsAmount]);
  rows.push(['Venta neta', t.net]);
  rows.push(['Ticket promedio', t.averageTicket]);
  rows.push(['Piezas vendidas', t.units]);
  rows.push(['Dinero devuelto a clientes', t.refundedCash]);
  rows.push(['Cuentas por cobrar (cantidad)', t.pendingOrders]);
  rows.push(['Cuentas por cobrar (importe)', t.pendingAmount]);
  rows.push([]);
  rows.push(['Cobrado por método', 'Cobros', 'Importe']);
  for (const row of report.paymentsByMethod) rows.push([methodLabel(row.method), row.count, row.amount]);
  if (report.exchangeCredit > 0) rows.push(['Crédito por cambios (no es dinero)', '', report.exchangeCredit]);
  rows.push([]);
  rows.push(['Devuelto por método', 'Reembolsos', 'Importe']);
  for (const row of report.refundsByMethod) rows.push([methodLabel(row.method), row.count, row.amount]);
  rows.push([]);
  rows.push(['Día', 'Ventas', 'Venta bruta', 'Devoluciones', 'Venta neta']);
  for (const day of report.byDay) rows.push([day.date, day.orders, day.gross, day.returnsAmount, day.net]);
  rows.push([]);
  rows.push(['Producto', 'SKU', 'Piezas', 'Importe']);
  for (const product of report.topProducts) rows.push([product.name, product.sku, product.quantity, product.total]);

  // BOM para que Excel respete los acentos.
  return '﻿' + rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
