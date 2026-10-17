// Alertas de inventario en pantalla y en Excel. Sin React, para poder probarlo.
// Los tipos reflejan lo que responde GET catalog/product/company/:id/stock-alerts.
import { buildWorkbook, type XCell, type XSheet } from "./yalika-xlsx-lite";

export type StockAlertSettings = {
  slowDays: number;
  newDays: number;
  agedDays: number;
  coverDays: number;
  deadlineWarnDays: number;
};

export const DEFAULT_ALERT_SETTINGS: StockAlertSettings = {
  slowDays: 45,
  newDays: 14,
  agedDays: 90,
  coverDays: 7,
  deadlineWarnDays: 14,
};

export type AlertKind = "out" | "low" | "soon_out" | "slow" | "deadline_passed" | "deadline_soon";
export type AgeBucket = "new" | "recent" | "old" | "very_old";

export type AlertItem = {
  id: string;
  name: string;
  sku: string | null;
  catalogId: string | null;
  categoryName: string | null;
  stock: number;
  lowStockAt: number;
  ageDays: number;
  ageBucket: AgeBucket;
  daysSinceSale: number | null;
  sold90: number;
  coverDays: number | null;
  deadlineInDays: number | null;
  kinds: AlertKind[];
  message: string;
};

export type StockAlertReport = {
  settings: StockAlertSettings;
  generatedAt: string;
  totals: { products: number; withStock: number; withAlerts: number };
  out: AlertItem[];
  low: AlertItem[];
  soonOut: AlertItem[];
  slow: AlertItem[];
  deadline: AlertItem[];
  byAge: AlertItem[];
  newArrivals: AlertItem[];
};

export type SectionId = "out" | "low" | "soonOut" | "slow" | "deadline" | "newArrivals" | "byAge";

export const alertSections: Array<{ id: SectionId; label: string; hint: string }> = [
  { id: "out", label: "Agotados", hint: "No queda nada. Hay que reponer o dar de baja." },
  { id: "low", label: "Por agotarse", hint: "Queda igual o menos que el aviso de cada producto." },
  { id: "soonOut", label: "Se agotan pronto", hint: "Al ritmo de venta reciente no alcanza para muchos días." },
  { id: "slow", label: "Resagados", hint: "Tienen existencia y llevan mucho sin venderse. Candidatos a promoción." },
  { id: "deadline", label: "Fecha límite", hint: "Productos con fecha para venderse o retirarse que ya llega o ya pasó." },
  { id: "newArrivals", label: "Llegó nuevo", hint: "Entró mercancía hace poco. Vale la pena exhibirla." },
  { id: "byAge", label: "Por antigüedad", hint: "Todo lo que tiene existencia, del más viejo al más nuevo." },
];

export const ageLabel: Record<AgeBucket, string> = {
  new: "Nuevo",
  recent: "Reciente",
  old: "Viejo",
  very_old: "Muy viejo",
};

export const kindLabel: Record<AlertKind, string> = {
  out: "Agotado",
  low: "Por agotarse",
  soon_out: "Se agota pronto",
  slow: "Resagado",
  deadline_passed: "Pasó su fecha límite",
  deadline_soon: "Fecha límite cerca",
};

/** Valida lo que haya quedado guardado en el dispositivo; lo inválido vuelve al valor normal. */
export function normalizeAlertSettings(input: unknown): StockAlertSettings {
  const source = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const pick = (key: keyof StockAlertSettings, min: number, max: number) => {
    const value = Number(source[key]);
    return Number.isInteger(value) && value >= min && value <= max ? value : DEFAULT_ALERT_SETTINGS[key];
  };
  const settings = {
    slowDays: pick("slowDays", 7, 365),
    newDays: pick("newDays", 1, 90),
    agedDays: pick("agedDays", 14, 730),
    coverDays: pick("coverDays", 1, 60),
    deadlineWarnDays: pick("deadlineWarnDays", 1, 90),
  };
  if (settings.agedDays <= settings.newDays) settings.agedDays = Math.max(settings.newDays + 1, DEFAULT_ALERT_SETTINGS.agedDays);
  return settings;
}

export function alertsQuery(settings: StockAlertSettings, timeZone?: string) {
  const params = new URLSearchParams({
    slowDays: String(settings.slowDays),
    newDays: String(settings.newDays),
    agedDays: String(settings.agedDays),
    coverDays: String(settings.coverDays),
    deadlineWarnDays: String(settings.deadlineWarnDays),
  });
  if (timeZone) params.set("tz", timeZone);
  return params.toString();
}

/** Deja solo los productos del negocio elegido ("" = todos, "none" = sin negocio asignado). */
export function filterByCatalog(report: StockAlertReport, catalogId: string): StockAlertReport {
  if (!catalogId) return report;
  const keep = (item: AlertItem) => (catalogId === "none" ? !item.catalogId : item.catalogId === catalogId);
  const pick = (items: AlertItem[]) => items.filter(keep);
  const byAge = pick(report.byAge);
  const all = new Set([...pick(report.out), ...pick(report.low), ...pick(report.soonOut), ...pick(report.slow), ...pick(report.deadline)].map((i) => i.id));
  return {
    ...report,
    totals: { products: report.totals.products, withStock: byAge.length, withAlerts: all.size },
    out: pick(report.out),
    low: pick(report.low),
    soonOut: pick(report.soonOut),
    slow: pick(report.slow),
    deadline: pick(report.deadline),
    byAge,
    newArrivals: pick(report.newArrivals),
  };
}

export function firstSectionWithItems(report: StockAlertReport): SectionId {
  const order: SectionId[] = ["out", "deadline", "low", "soonOut", "slow", "newArrivals", "byAge"];
  return order.find((id) => report[id].length > 0) ?? "out";
}

/** Fecha límite en texto corto: "en 3 días", "hoy", "hace 2 días". */
export function deadlineText(days: number | null) {
  if (days === null) return "";
  if (days === 0) return "hoy";
  const n = Math.abs(days);
  const unit = n === 1 ? "día" : "días";
  return days > 0 ? `en ${n} ${unit}` : `hace ${n} ${unit}`;
}

const head = (...labels: string[]): XCell[] => labels.map((v) => ({ v, s: "head" as const }));
const int = (v: number | null): XCell => (v === null ? null : { v, s: "int" });

export function stockWorkbookSheets(
  report: StockAlertReport,
  catalogName: (id: string | null) => string,
  filterLabel: string,
  now: Date = new Date(),
): XSheet[] {
  const s = report.settings;
  const base = (item: AlertItem): XCell[] => [item.name, item.sku ?? "", catalogName(item.catalogId), item.categoryName ?? "", int(item.stock)];

  const summary: XCell[][] = [
    [{ v: "Alertas de inventario", s: "title" }],
    ["Generado", now.toISOString().slice(0, 16).replace("T", " ") + " UTC"],
    ["Negocio", filterLabel || "Todos"],
    [],
    [{ v: "Resumen", s: "bold" }],
    ["Productos con inventario controlado", int(report.totals.products)],
    ["Con existencia", int(report.totals.withStock)],
    ["Con alguna alerta", int(report.totals.withAlerts)],
    ...alertSections.filter((x) => x.id !== "byAge").map((x): XCell[] => [x.label, int(report[x.id].length)]),
    [],
    [{ v: "Reglas usadas", s: "bold" }],
    ["Resagado: días sin venderse", int(s.slowDays)],
    ["Nuevo: llegó hace máximo (días)", int(s.newDays)],
    ["Viejo: más de (días)", int(s.agedDays)],
    ["Se agota pronto: alcanza para menos de (días)", int(s.coverDays)],
    ["Avisar la fecha límite con (días)", int(s.deadlineWarnDays)],
    [],
    [{ v: "El ritmo de venta usa los últimos 90 días. La antigüedad cuenta desde la última entrada de mercancía.", s: "note" }],
  ];

  const restock = new Map<string, AlertItem>();
  for (const item of [...report.out, ...report.low, ...report.soonOut]) if (!restock.has(item.id)) restock.set(item.id, item);
  const restockRows: XCell[][] = [head("Producto", "SKU", "Negocio", "Categoría", "Existencia", "Aviso en", "Vendido (90 días)", "Alcanza (días)", "Estado")];
  [...restock.values()]
    .sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name, "es"))
    .forEach((item) =>
      restockRows.push([...base(item), int(item.lowStockAt), int(item.sold90), int(item.coverDays), item.kinds.filter((k) => k === "out" || k === "low" || k === "soon_out").map((k) => kindLabel[k]).join(" · ")]),
    );

  const slowRows: XCell[][] = [head("Producto", "SKU", "Negocio", "Categoría", "Existencia", "Días sin venderse", "Días en inventario", "Vendido (90 días)")];
  report.slow.forEach((item) => slowRows.push([...base(item), item.daysSinceSale === null ? "Nunca" : int(item.daysSinceSale), int(item.ageDays), int(item.sold90)]));

  const deadlineRows: XCell[][] = [head("Producto", "SKU", "Negocio", "Categoría", "Existencia", "Días para la fecha límite", "Estado")];
  report.deadline.forEach((item) =>
    deadlineRows.push([...base(item), int(item.deadlineInDays), item.kinds.includes("deadline_passed") ? kindLabel.deadline_passed : kindLabel.deadline_soon]),
  );

  const ageRows: XCell[][] = [head("Producto", "SKU", "Negocio", "Categoría", "Existencia", "Días desde la última entrada", "Antigüedad", "Días sin venderse", "Vendido (90 días)")];
  report.byAge.forEach((item) =>
    ageRows.push([...base(item), int(item.ageDays), ageLabel[item.ageBucket], item.daysSinceSale === null ? "Nunca" : int(item.daysSinceSale), int(item.sold90)]),
  );

  const newRows: XCell[][] = [head("Producto", "SKU", "Negocio", "Categoría", "Existencia", "Días desde que llegó")];
  report.newArrivals.forEach((item) => newRows.push([...base(item), int(item.ageDays)]));

  return [
    { name: "Resumen", rows: summary, widths: [46, 22] },
    { name: "Por reponer", rows: restockRows, freeze: 1, filterHeaderRow: 1 },
    { name: "Resagados", rows: slowRows, freeze: 1, filterHeaderRow: 1 },
    { name: "Fecha límite", rows: deadlineRows, freeze: 1, filterHeaderRow: 1 },
    { name: "Antigüedad", rows: ageRows, freeze: 1, filterHeaderRow: 1 },
    { name: "Llegó nuevo", rows: newRows, freeze: 1, filterHeaderRow: 1 },
  ];
}

export function stockWorkbook(report: StockAlertReport, catalogName: (id: string | null) => string, filterLabel: string, now: Date = new Date()) {
  return buildWorkbook(stockWorkbookSheets(report, catalogName, filterLabel, now));
}
