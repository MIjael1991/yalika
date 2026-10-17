// Excel para el contador a partir del reporte de ventas: resumen, por día / semana / mes,
// cobros por método, tickets, devoluciones y productos. Sin React, para poder probarlo.
import { buildWorkbook, type XCell, type XSheet } from "./yalika-xlsx-lite";
import { methodLabel, type SalesReport } from "./yalika-sales-report";

type DayRow = SalesReport["byDay"][number];

export type PeriodRow = {
  key: string;
  from: string;
  to: string;
  orders: number;
  gross: number;
  returnsAmount: number;
  net: number;
};

const cents = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100);
const fromCents = (value: number) => value / 100;

function parseUtcDay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function formatUtcDay(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function weekdayName(day: string) {
  const date = parseUtcDay(day);
  return date ? WEEKDAYS[date.getUTCDay()] : "";
}

/** Lunes de la semana de ese día (las semanas van de lunes a domingo). */
export function weekStart(day: string) {
  const date = parseUtcDay(day);
  if (!date) return day;
  const back = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - back);
  return formatUtcDay(date);
}

export function weekEnd(startDay: string) {
  const date = parseUtcDay(startDay);
  if (!date) return startDay;
  date.setUTCDate(date.getUTCDate() + 6);
  return formatUtcDay(date);
}

export function monthStart(day: string) {
  return `${day.slice(0, 7)}-01`;
}

export function monthEnd(day: string) {
  const date = parseUtcDay(monthStart(day));
  if (!date) return day;
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return formatUtcDay(date);
}

/** Junta los días en semanas (lunes a domingo) o meses. Las sumas se hacen en centavos. */
export function rollupDays(days: DayRow[], by: "week" | "month"): PeriodRow[] {
  const groups = new Map<string, { row: PeriodRow; gross: number; returns: number }>();

  for (const day of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    const start = by === "week" ? weekStart(day.date) : monthStart(day.date);
    let group = groups.get(start);
    if (!group) {
      group = {
        row: {
          key: by === "week" ? start : start.slice(0, 7),
          from: start,
          to: by === "week" ? weekEnd(start) : monthEnd(start),
          orders: 0,
          gross: 0,
          returnsAmount: 0,
          net: 0,
        },
        gross: 0,
        returns: 0,
      };
      groups.set(start, group);
    }
    group.row.orders += day.orders;
    group.gross += cents(day.gross);
    group.returns += cents(day.returnsAmount);
  }

  return [...groups.values()]
    .map(({ row, gross, returns }) => ({
      ...row,
      gross: fromCents(gross),
      returnsAmount: fromCents(returns),
      net: fromCents(gross - returns),
    }))
    .sort((a, b) => a.from.localeCompare(b.from));
}

function hourOf(iso: string, timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
  } catch {
    return "";
  }
}

const m = (v: number, f?: string, bold = false): XCell => ({ v, ...(f ? { f } : {}), s: bold ? "moneyBold" : "money" });
const n = (v: number, f?: string, bold = false): XCell => ({ v, ...(f ? { f } : {}), s: bold ? "intBold" : "int" });
const head = (...labels: string[]): XCell[] => labels.map((v) => ({ v, s: "head" as const }));
const label = (v: string, bold = false): XCell => (bold ? { v, s: "bold" } : v);

function totalsRow(first: string, columns: Array<{ col: string; value: number; money: boolean }>, startRow: number, endRow: number, width: number): XCell[] {
  const row: XCell[] = Array.from({ length: width }, () => null);
  row[0] = label(first, true);
  for (const { col, value, money } of columns) {
    const index = col.charCodeAt(0) - 65;
    const f = `SUM(${col}${startRow}:${col}${endRow})`;
    row[index] = money ? m(value, f, true) : n(value, f, true);
  }
  return row;
}

function periodSheet(name: string, firstHeader: string, rows: PeriodRow[], mode: "day" | "range"): XSheet {
  // Día: Día | Día de la semana | Ventas … (ventas en C). Semana/mes: Periodo | Desde | Hasta | Ventas … (ventas en D).
  const header =
    mode === "range"
      ? head(firstHeader, "Desde", "Hasta", "Ventas", "Venta bruta", "Devoluciones", "Venta neta")
      : head(firstHeader, "Día de la semana", "Ventas", "Venta bruta", "Devoluciones", "Venta neta");
  const oC = mode === "range" ? "D" : "C";
  const gC = String.fromCharCode(oC.charCodeAt(0) + 1);
  const rC = String.fromCharCode(oC.charCodeAt(0) + 2);
  const nC = String.fromCharCode(oC.charCodeAt(0) + 3);
  const out: XCell[][] = [header];

  rows.forEach((row, i) => {
    const r = i + 2;
    const money = [m(row.gross), m(row.returnsAmount), m(row.net, `${gC}${r}-${rC}${r}`)];
    out.push(
      mode === "range"
        ? [row.key, row.from, row.to, n(row.orders), ...money]
        : [row.key, weekdayName(row.key), n(row.orders), ...money],
    );
  });

  if (rows.length > 0) {
    const sum = (pick: (row: PeriodRow) => number) => fromCents(rows.reduce((acc, row) => acc + cents(pick(row)), 0));
    out.push(
      totalsRow(
        "Total",
        [
          { col: oC, value: rows.reduce((acc, row) => acc + row.orders, 0), money: false },
          { col: gC, value: sum((row) => row.gross), money: true },
          { col: rC, value: sum((row) => row.returnsAmount), money: true },
          { col: nC, value: sum((row) => row.net), money: true },
        ],
        2,
        rows.length + 1,
        header.length,
      ),
    );
  }
  return { name, rows: out, freeze: 1 };
}

export function salesWorkbookSheets(report: SalesReport, fromDay: string, toDay: string, now: Date = new Date()): XSheet[] {
  const t = report.totals;
  const days = report.byDay;
  const tz = report.timeZone;

  // --- Resumen ---
  const summary: XCell[][] = [
    [{ v: "Reporte de ventas", s: "title" }],
    ["Periodo", `${fromDay} a ${toDay}`],
    ["Zona horaria", tz],
    ["Generado", now.toISOString().slice(0, 16).replace("T", " ") + " UTC"],
    [],
    [{ v: "Venta", s: "bold" }],
    ["Ventas (tickets)", n(t.orders)], // fila 7
    ["Venta bruta", m(t.gross)], // 8
    ["Devoluciones (importe)", m(t.returnsAmount)], // 9
    ["Venta neta", m(fromCents(cents(t.gross) - cents(t.returnsAmount)), "B8-B9", true)], // 10
    ["Ticket promedio", m(t.orders > 0 ? t.averageTicket : 0, "IF(B7=0,0,B8/B7)")], // 11
    ["Descuentos otorgados", m(t.discounts)], // 12
    ["Piezas vendidas", n(t.units)], // 13
    ["Devoluciones (cantidad)", n(t.returns)], // 14
    [],
    [{ v: "Dinero", s: "bold" }],
    ["Dinero devuelto a clientes", m(t.refundedCash)],
    ["Crédito por cambios aplicado (no es dinero)", m(report.exchangeCredit)],
    ["Cuentas por cobrar (cantidad)", n(t.pendingOrders)],
    ["Cuentas por cobrar (importe)", m(t.pendingAmount)],
    [],
    [{ v: "La venta cuenta cuando el ticket queda confirmado y pagado por completo. Las devoluciones restan el día en que se terminaron.", s: "note" }],
    [{ v: "Los precios son los de venta; este reporte no calcula IVA.", s: "note" }],
  ];

  // --- Por día / semana / mes ---
  const dayRows: PeriodRow[] = days.map((d) => ({ key: d.date, from: d.date, to: d.date, orders: d.orders, gross: d.gross, returnsAmount: d.returnsAmount, net: d.net }));
  const daySheet = periodSheet("Por día", "Día", dayRows, "day");

  const weekSheet = periodSheet("Por semana", "Semana (lunes)", rollupDays(days, "week"), "range");
  const monthSheet = periodSheet("Por mes", "Mes", rollupDays(days, "month"), "range");

  // --- Cobros por método ---
  const refundMap = new Map(report.refundsByMethod.map((row) => [row.method, row]));
  const methods = [...new Set([...report.paymentsByMethod.map((row) => row.method), ...report.refundsByMethod.map((row) => row.method)])];
  const payRows: XCell[][] = [head("Método", "Cobros", "Cobrado", "Reembolsos", "Devuelto", "Cobro neto")];
  methods.forEach((method, i) => {
    const r = i + 2;
    const paid = report.paymentsByMethod.find((row) => row.method === method);
    const refunded = refundMap.get(method);
    payRows.push([
      methodLabel(method),
      n(paid?.count ?? 0),
      m(paid?.amount ?? 0),
      n(refunded?.count ?? 0),
      m(refunded?.amount ?? 0),
      m(fromCents(cents(paid?.amount ?? 0) - cents(refunded?.amount ?? 0)), `C${r}-E${r}`),
    ]);
  });
  if (methods.length > 0) {
    const totalPaid = report.paymentsByMethod.reduce((acc, row) => acc + cents(row.amount), 0);
    const totalRefunded = report.refundsByMethod.reduce((acc, row) => acc + cents(row.amount), 0);
    const last = methods.length + 1;
    payRows.push([
      label("Total", true),
      n(report.paymentsByMethod.reduce((a, r) => a + r.count, 0), `SUM(B2:B${last})`, true),
      m(fromCents(totalPaid), `SUM(C2:C${last})`, true),
      n(report.refundsByMethod.reduce((a, r) => a + r.count, 0), `SUM(D2:D${last})`, true),
      m(fromCents(totalRefunded), `SUM(E2:E${last})`, true),
      m(fromCents(totalPaid - totalRefunded), `SUM(F2:F${last})`, true),
    ]);
  }
  if (report.exchangeCredit > 0) {
    payRows.push([]);
    payRows.push([{ v: `Crédito por cambios aplicado: ${report.exchangeCredit.toFixed(2)} (no entra como dinero cobrado).`, s: "note" }]);
  }

  // --- Tickets ---
  const ticketMethods = [...new Set(report.tickets.flatMap((ticket) => ticket.methods.map((row) => row.method)))];
  const ticketHeader = head("Folio", "Fecha", "Hora", "Cliente", "Descuento", "Total", ...ticketMethods.map((x) => methodLabel(x)));
  const ticketRows: XCell[][] = [ticketHeader];
  report.tickets.forEach((ticket) => {
    const byMethod = new Map(ticket.methods.map((row) => [row.method, row.amount]));
    ticketRows.push([
      ticket.orderNumber,
      ticket.day,
      hourOf(ticket.date, tz),
      ticket.customer ?? "",
      m(ticket.discount),
      m(ticket.total),
      ...ticketMethods.map((method) => (byMethod.has(method) ? m(byMethod.get(method) as number) : null)),
    ]);
  });
  if (report.tickets.length > 0) {
    const last = report.tickets.length + 1;
    const total = (pick: (t: SalesReport["tickets"][number]) => number) => fromCents(report.tickets.reduce((acc, ticket) => acc + cents(pick(ticket)), 0));
    const row: XCell[] = Array.from({ length: ticketHeader.length }, () => null);
    row[0] = label("Total", true);
    row[4] = m(total((x) => x.discount), `SUM(E2:E${last})`, true);
    row[5] = m(total((x) => x.total), `SUM(F2:F${last})`, true);
    ticketMethods.forEach((method, i) => {
      const col = String.fromCharCode(71 + i); // G, H, …
      row[6 + i] = m(total((x) => x.methods.find((p) => p.method === method)?.amount ?? 0), `SUM(${col}2:${col}${last})`, true);
    });
    ticketRows.push(row);
  }
  if (report.ticketsTruncated) {
    ticketRows.push([]);
    ticketRows.push([{ v: "Aviso: el detalle se cortó en 5,000 tickets. Elige un rango más corto para ver todos.", s: "note" }]);
  }

  // --- Devoluciones ---
  const retRows: XCell[][] = [head("Folio devolución", "Fecha", "Ticket", "Tipo", "Motivo", "Importe", "Dinero devuelto")];
  report.returnsDetail.forEach((row) => {
    retRows.push([row.returnNumber, row.day, row.orderNumber, row.type === "exchange" ? "Cambio" : row.type === "refund" ? "Reembolso" : row.type, row.reason, m(row.amount), m(row.refunded)]);
  });
  if (report.returnsDetail.length > 0) {
    const last = report.returnsDetail.length + 1;
    const total = (pick: (r: SalesReport["returnsDetail"][number]) => number) => fromCents(report.returnsDetail.reduce((acc, r) => acc + cents(pick(r)), 0));
    retRows.push([label("Total", true), null, null, null, null, m(total((r) => r.amount), `SUM(F2:F${last})`, true), m(total((r) => r.refunded), `SUM(G2:G${last})`, true)]);
  }

  // --- Productos ---
  const prodRows: XCell[][] = [head("Producto", "SKU", "Piezas", "Importe")];
  report.products.forEach((p) => prodRows.push([p.name, p.sku ?? "", n(p.quantity), m(p.total)]));
  if (report.products.length > 0) {
    const last = report.products.length + 1;
    prodRows.push([
      label("Total", true),
      null,
      n(report.products.reduce((a, p) => a + p.quantity, 0), `SUM(C2:C${last})`, true),
      m(fromCents(report.products.reduce((a, p) => a + cents(p.total), 0)), `SUM(D2:D${last})`, true),
    ]);
  }

  return [
    { name: "Resumen", rows: summary, widths: [44, 22] },
    daySheet,
    weekSheet,
    monthSheet,
    { name: "Cobros por método", rows: payRows, freeze: 1 },
    { name: "Tickets", rows: ticketRows, freeze: 1, filterHeaderRow: 1 },
    { name: "Devoluciones", rows: retRows, freeze: 1 },
    { name: "Productos", rows: prodRows, freeze: 1, filterHeaderRow: 1 },
  ];
}

export function salesWorkbook(report: SalesReport, fromDay: string, toDay: string, now: Date = new Date()) {
  return buildWorkbook(salesWorkbookSheets(report, fromDay, toDay, now));
}
