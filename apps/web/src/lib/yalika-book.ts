// Estilo de las hojas de cálculo: el mismo aspecto en pantalla, en Excel y en PDF.
import { isFormula, parseNumber } from "./yalika-calc";
export type NumFmt = "money" | "int" | "dec" | "pct";
export type Align = "l" | "c" | "r";
export type CellFmt = { b?: true; a?: Align; n?: NumFmt; f?: number };
export type FmtGrid = (CellFmt | null)[][];
export type ThemeId = "yalika" | "sobrio" | "plano";
export type Theme = { id: ThemeId; label: string; hint: string; head: string; headText: string; zebra: string; line: string; total: string; accent: string };
export const THEMES: Theme[] = [
  { id: "yalika", label: "Yalika", hint: "Encabezado verde azulado, filas alternadas, líneas suaves y totales resaltados.", head: "0F4C5C", headText: "FFFFFF", zebra: "EEF6F7", line: "D3E2E5", total: "D9EBEE", accent: "0F4C5C" },
  { id: "sobrio", label: "Sobrio", hint: "Gris grafito, ideal para imprimir en blanco y negro.", head: "3A3F47", headText: "FFFFFF", zebra: "F3F4F6", line: "D9DCE1", total: "E4E6EA", accent: "3A3F47" },
  { id: "plano", label: "Sin estilo", hint: "Solo los datos, sin colores. Encabezado en negritas.", head: "FFFFFF", headText: "000000", zebra: "FFFFFF", line: "FFFFFF", total: "FFFFFF", accent: "000000" },
];
export const theme = (id: ThemeId) => THEMES.find((t) => t.id === id) ?? THEMES[0];
// Colores de relleno suaves que la persona puede poner a una celda (el índice se guarda en CellFmt.f).
export const FILLS = [
  { name: "Amarillo", hex: "FFF1BF" },
  { name: "Verde", hex: "D8F0DF" },
  { name: "Azul", hex: "D6E8FA" },
  { name: "Rojo", hex: "F9D9D9" },
  { name: "Morado", hex: "E5DDF5" },
  { name: "Gris", hex: "E3E6EA" },
];
export const NUM_FORMATS: { id: NumFmt | ""; label: string }[] = [
  { id: "", label: "Automático" },
  { id: "money", label: "Moneda ($1,250.50)" },
  { id: "int", label: "Entero (1,250)" },
  { id: "dec", label: "Dos decimales (1,250.50)" },
  { id: "pct", label: "Porcentaje (12.5%)" },
];
export function groups(n: number, digits: number) {
  const s = Math.abs(n).toFixed(digits),
    [int, dec] = s.split("."),
    withCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (n < 0 && Number(s) !== 0 ? "-" : "") + withCommas + (dec ? "." + dec : "");
}
export function formatNumber(n: number, f?: NumFmt) {
  if (f === "money") return (n < 0 && Number(Math.abs(n).toFixed(2)) !== 0 ? "-$" : "$") + groups(Math.abs(n), 2);
  if (f === "int") return groups(n, 0);
  if (f === "dec") return groups(n, 2);
  if (f === "pct") return groups(n, 1) + "%";
  return null;
}
// El primer texto de la fila empieza con «Total»: se resalta como fila de totales.
export const isTotalRow = (row: string[]) => /^\s*total(es)?\b/i.test(row.find((c) => c.trim() !== "") ?? "");
export type Look = { head: boolean; total: boolean; zebra: boolean; fill?: string; color?: string; bold: boolean; align?: Align; n?: NumFmt };
export function look(themeId: ThemeId, header: boolean, r: number, row: string[], f: CellFmt | null | undefined): Look {
  const styled = themeId !== "plano",
    head = header && r === 0,
    total = styled && !head && isTotalRow(row),
    zebra = styled && !head && !total && (r - (header ? 1 : 0)) % 2 === 1,
    t = theme(themeId),
    custom = f?.f !== undefined ? FILLS[f.f]?.hex : undefined;
  return {
    head,
    total,
    zebra,
    fill: custom ?? (head && styled ? t.head : total ? t.total : zebra ? t.zebra : undefined),
    color: head && styled && custom === undefined ? t.headText : undefined,
    bold: head || total || !!f?.b,
    align: f?.a,
    n: f?.n,
  };
}
// Lo que se ve en la celda (y en el PDF): el resultado, con formato de número si lo tiene.
export function shownText(v: number | string | { error: string } | undefined, raw: string, n?: NumFmt) {
  if (v === undefined) return "";
  if (typeof v === "object") return v.error;
  if (typeof v === "number") return (n ? formatNumber(v, n) : null) ?? String(Number(v.toPrecision(12)));
  if (n && !isFormula(raw)) {
    const num = parseNumber(raw);
    if (num !== null) return formatNumber(num, n) ?? v;
  }
  return v;
}
export const emptyFmt = (rows: string[][]): FmtGrid => rows.map((r) => r.map(() => null));
// Ajusta el formato al tamaño de la hoja (filas y columnas añadidas o quitadas).
export function fitFmt(fmt: FmtGrid | undefined, rows: string[][]): FmtGrid {
  return rows.map((r, i) => r.map((_, j) => fmt?.[i]?.[j] ?? null));
}
export function setFmt(fmt: FmtGrid, cells: [number, number][], change: Partial<CellFmt> | null): FmtGrid {
  const hit = new Set(cells.map(([r, c]) => r + "," + c));
  return fmt.map((row, r) =>
    row.map((cell, c) => {
      if (!hit.has(r + "," + c)) return cell;
      if (!change) return null;
      const next: CellFmt = { ...cell };
      for (const k of Object.keys(change) as (keyof CellFmt)[]) {
        if (change[k] === undefined || change[k] === (false as unknown)) delete next[k];
        else (next as Record<string, unknown>)[k] = change[k];
      }
      return Object.keys(next).length ? next : null;
    }),
  );
}
