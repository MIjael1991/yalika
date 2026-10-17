// Hojas de cálculo: lee Excel (.xlsx) y CSV en el navegador y las pasa a PDF o CSV.
// Por omisión solo se leen los valores que Excel dejó guardados. Con { rich: true } (pantalla Hoja de cálculo) también se
// conservan el formato básico y las fórmulas que Yalika sabe calcular con el mismo resultado que dejó Excel.
import { unzipSync } from "fflate";
import { look, theme, type Align, type CellFmt, type FmtGrid, type NumFmt, type ThemeId } from "./yalika-book";
import { MAX_GRID_COLS, MAX_GRID_ROWS, calc, parseNumber, showValue } from "./yalika-calc";
import { csvCell } from "./yalika-records";
export type Sheet = { name: string; rows: string[][]; fmt?: FmtGrid };
export type SheetResult = { sheets: Sheet[]; warning: string; formulas?: number };
export const MAX_SHEET_BYTES = 20 * 1024 * 1024;
export const MAX_ROWS = 5000;
export const MAX_COLS = 100;
const MAX_CELL = 1000;
function entities(s: string) {
  const cp = (n: number) => (n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : "");
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => cp(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => cp(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
const text = (xml: string) =>
  entities([...xml.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map((m) => m[1]).join(""));
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, MAX_CELL);
function colIndex(ref: string) {
  let n = 0;
  for (const ch of /^[A-Z]+/.exec(ref)?.[0] ?? "") n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}
// Fecha de Excel (días desde 1899-12-30) a AAAA-MM-DD.
export function excelDate(serial: number) {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return String(serial);
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000),
    frac = serial - Math.floor(serial),
    day = d.toISOString().slice(0, 10);
  if (!frac) return day;
  const mins = Math.round(frac * 1440);
  return day + " " + String(Math.floor(mins / 60) % 24).padStart(2, "0") + ":" + String(mins % 60).padStart(2, "0");
}
function dateStyles(styles: string) {
  const custom = new Map<number, string>();
  for (const m of styles.matchAll(/<numFmt\s[^>]*?numFmtId="(\d+)"[^>]*?formatCode="([^"]*)"/g)) custom.set(Number(m[1]), m[2]);
  const isDate = (id: number) =>
    (id >= 14 && id <= 22) ||
    (id >= 45 && id <= 47) ||
    (custom.has(id) && /[dmyhs]/i.test(custom.get(id)!.replace(/"[^"]*"|\[[^\]]*\]|\\.|_.|\*./g, "")));
  const block = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] ?? "";
  return [...block.matchAll(/<xf\s[^>]*?numFmtId="(\d+)"/g)].map((m) => isDate(Number(m[1])));
}
// Estilos de Excel que Yalika entiende: negrita, alineación, formato de número y un relleno parecido.
const BUILTIN_NUM: Record<number, string> = { 1: "0", 2: "0.00", 3: "#,##0", 4: "#,##0.00", 5: "$#,##0", 6: "$#,##0", 7: "$#,##0.00", 8: "$#,##0.00", 37: "#,##0", 38: "#,##0", 39: "#,##0.00", 40: "#,##0.00", 41: "#,##0", 42: "$#,##0", 43: "#,##0.00", 44: "$#,##0.00" };
function numKind(id: number, custom: Map<number, string>): NumFmt | undefined {
  const code = custom.get(id) ?? BUILTIN_NUM[id];
  if (!code) return undefined;
  if (/"%"/.test(code)) return "pct"; // el que escribe Yalika (el valor ya viene en porcentaje)
  if (/%/.test(code.replace(/"[^"]*"/g, ""))) return undefined; // porcentaje real de Excel: se deja el número tal cual
  if (/[$€£¥]/.test(code)) return "money";
  if (/0\.0+/.test(code)) return "dec";
  if (/#,##0|^0$/.test(code)) return "int";
  return undefined;
}
function fillIndex(rgb: string): number | undefined {
  const n = parseInt(rgb.slice(-6), 16);
  if (!Number.isFinite(n)) return undefined;
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255,
    max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (l > 0.97 || l < 0.2) return undefined;
  if (d < 0.1) return 5;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return h < 20 || h >= 340 ? 3 : h < 70 ? 0 : h < 170 ? 1 : h < 260 ? 2 : 4;
}
function cellFormats(styles: string): (CellFmt | null)[] {
  const custom = new Map<number, string>();
  for (const m of styles.matchAll(/<numFmt\s[^>]*?numFmtId="(\d+)"[^>]*?formatCode="([^"]*)"/g)) custom.set(Number(m[1]), entities(m[2]));
  const block = (tag: string) => new RegExp("<" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + tag + ">").exec(styles)?.[1] ?? "",
    bold = [...block("fonts").matchAll(/<font(?:\s[^>]*)?>([\s\S]*?)<\/font>/g)].map((m) => /<b(?:\s+val="(?:1|true)")?\s*\/?>/.test(m[1])),
    fills = [...block("fills").matchAll(/<fill>([\s\S]*?)<\/fill>/g)].map((m) => {
      if (!/patternType="solid"/.test(m[1])) return undefined;
      const rgb = /<fgColor\s[^>]*?rgb="([0-9A-Fa-f]{6,8})"/.exec(m[1])?.[1];
      return rgb ? fillIndex(rgb) : undefined;
    });
  return [...block("cellXfs").matchAll(/<xf\s([^>]*?)(?:\/>|>([\s\S]*?)<\/xf>)/g)].map((m) => {
    const num = (k: string) => Number(new RegExp("\\b" + k + '="(\\d+)"').exec(m[1])?.[1] ?? 0),
      h = /<alignment\s[^>]*?horizontal="(\w+)"/.exec(m[2] ?? "")?.[1],
      f: CellFmt = {},
      n = numKind(num("numFmtId"), custom),
      fill = fills[num("fillId")],
      a: Align | undefined = h === "center" ? "c" : h === "right" ? "r" : h === "left" ? "l" : undefined;
    if (bold[num("fontId")]) f.b = true;
    if (a) f.a = a;
    if (n) f.n = n;
    if (fill !== undefined) f.f = fill;
    return Object.keys(f).length ? f : null;
  });
}
const sameValue = (a: string, b: string) => {
  const x = parseNumber(a), y = parseNumber(b);
  return x !== null && y !== null ? Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x)) : a === b;
};
// Deja como fórmula solo lo que Yalika calcula igual que Excel; el resto queda con el valor que Excel guardó.
function keepFormulas(rows: string[][], found: { r: number; c: number; f: string; v: string | null }[]) {
  if (!found.length || rows.length > MAX_GRID_ROWS || rows.some((x) => x.length > MAX_GRID_COLS)) return 0;
  let live = found.slice();
  for (let pass = 0; pass < 6 && live.length; pass++) {
    const test = rows.map((x) => x.slice());
    for (const k of live) test[k.r][k.c] = k.f;
    const done = calc(test),
      bad = live.filter((k) => {
        const v = done[k.r]?.[k.c];
        return v === undefined || typeof v === "object" || (k.v !== null && !sameValue(showValue(v), k.v));
      });
    if (!bad.length) break;
    live = live.filter((k) => !bad.includes(k));
  }
  for (const k of live) rows[k.r][k.c] = k.f;
  return live.length;
}
export function importXlsx(bytes: Uint8Array, opts: { rich?: boolean } = {}): SheetResult {
  if (bytes.length > MAX_SHEET_BYTES) throw Error("El archivo pesa más de 20 MB.");
  const bad = "El archivo no es un Excel (.xlsx) válido.";
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) =>
        f.originalSize <= 4 * MAX_SHEET_BYTES &&
        (f.name === "xl/workbook.xml" ||
          f.name === "xl/_rels/workbook.xml.rels" ||
          f.name === "xl/sharedStrings.xml" ||
          f.name === "xl/styles.xml" ||
          /^xl\/worksheets\/[^/]+\.xml$/.test(f.name)),
    });
  } catch {
    throw Error(bad);
  }
  const dec = (n: string) => (files[n] ? new TextDecoder("utf-8").decode(files[n]) : "");
  const book = dec("xl/workbook.xml");
  if (!book) throw Error(bad);
  const targets = new Map<string, string>();
  for (const m of dec("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\s[^>]*>/g)) {
    const id = /\bId="([^"]*)"/.exec(m[0])?.[1],
      to = /\bTarget="([^"]*)"/.exec(m[0])?.[1];
    if (id && to) targets.set(id, to.startsWith("/") ? to.slice(1) : "xl/" + to);
  }
  const shared = [...dec("xl/sharedStrings.xml").matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((m) => clean(text(m[1]))),
    dates = dateStyles(dec("xl/styles.xml")),
    formats = opts.rich ? cellFormats(dec("xl/styles.xml")) : [],
    sheets: Sheet[] = [];
  let cut = false,
    kept = 0;
  for (const m of book.matchAll(/<sheet\s[^>]*>/g)) {
    const name = entities(/\bname="([^"]*)"/.exec(m[0])?.[1] ?? "Hoja"),
      rid = /\br:id="([^"]*)"/.exec(m[0])?.[1],
      xml = rid && targets.get(rid) ? dec(targets.get(rid)!) : "";
    if (!xml) continue;
    const rows: string[][] = [],
      found: { r: number; c: number; f: string; v: string | null }[] = [],
      marks: { r: number; c: number; f: CellFmt }[] = [];
    for (const rm of xml.matchAll(/<row\s([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const at = Number(/\br="(\d+)"/.exec(rm[1])?.[1] ?? rows.length + 1) - 1;
      if (at >= MAX_ROWS) {
        cut = true;
        break;
      }
      const row: string[] = [];
      for (const cm of (rm[2] ?? "").matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cm[1],
          body = cm[2] ?? "",
          col = colIndex(/\br="([A-Z]+\d+)"/.exec(attrs)?.[1] ?? "") ,
          t = /\bt="(\w+)"/.exec(attrs)?.[1],
          v = /<v>([^<]*)<\/v>/.exec(body)?.[1] ?? "";
        if (col < 0) continue;
        if (col >= MAX_COLS) {
          cut = true;
          continue;
        }
        let val = "";
        if (t === "s") val = shared[Number(v)] ?? "";
        else if (t === "inlineStr") val = clean(text(body));
        else if (t === "str") val = clean(entities(v));
        else if (t === "b") val = v === "1" ? "VERDADERO" : "FALSO";
        else if (t === "e") val = entities(v);
        else if (v) {
          const style = Number(/\bs="(\d+)"/.exec(attrs)?.[1] ?? -1);
          val = dates[style] ? excelDate(Number(v)) : v;
        }
        while (row.length < col) row.push("");
        row[col] = val;
        if (opts.rich) {
          const style = formats[Number(/\bs="(\d+)"/.exec(attrs)?.[1] ?? -1)];
          if (style) {
            const f = { ...style };
            if (at === 0) delete f.f; // el encabezado conserva el estilo de Yalika
            if (Object.keys(f).length) marks.push({ r: at, c: col, f });
          }
          const ft = /<f(?:\s[^>]*)?>([^<]+)<\/f>/.exec(body)?.[1];
          if (ft && t !== "e" && val.length < 900) found.push({ r: at, c: col, f: "=" + entities(ft).replace(/\$/g, ""), v: val === "" ? null : val }); // sin resultado guardado (otros programas): basta con que Yalika la calcule
        }
      }
      while (rows.length < at) rows.push([]);
      rows[at] = row;
    }
    const lastFormula = Math.max(-1, ...found.map((k) => k.r));
    while (rows.length > lastFormula + 1 && !rows[rows.length - 1].some(Boolean)) rows.pop();
    const sheet: Sheet = { name: clean(name).slice(0, 60) || "Hoja", rows };
    if (opts.rich) {
      kept += keepFormulas(rows, found.filter((k) => k.r < rows.length));
      const fmt: FmtGrid = rows.map((x) => x.map(() => null));
      for (const k of marks) if (fmt[k.r] && k.c < fmt[k.r].length) fmt[k.r][k.c] = k.f;
      if (marks.length) sheet.fmt = fmt;
    }
    sheets.push(sheet);
  }
  if (!sheets.length) throw Error(bad);
  const empty = sheets.every((s) => !s.rows.length);
  return {
    sheets,
    warning:
      (empty ? "La hoja no tiene datos. " : "") +
      (cut ? "Se tomaron las primeras " + MAX_ROWS + " filas y " + MAX_COLS + " columnas. " : "") +
      (opts.rich
        ? kept
          ? "Se conservaron " + kept + " fórmulas; las que Yalika no calcula igual quedaron con su resultado."
          : "Las fórmulas del archivo quedaron como resultado."
        : "Solo se copian los valores; el formato y las fórmulas no se conservan."),
    formulas: kept,
  };
}
export function parseCsv(input: string): string[][] {
  const src = input.replace(/^﻿/, "").replace(/\r\n?/g, "\n"),
    first = src.split("\n", 1)[0],
    delim = [",", ";", "\t"].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && !cell) quoted = true;
    else if (ch === delim) {
      row.push(clean(cell));
      cell = "";
    } else if (ch === "\n") {
      row.push(clean(cell));
      rows.push(row.slice(0, MAX_COLS));
      row = [];
      cell = "";
      if (rows.length >= MAX_ROWS) return rows;
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(clean(cell));
    rows.push(row.slice(0, MAX_COLS));
  }
  while (rows.length && !rows[rows.length - 1].some(Boolean)) rows.pop();
  return rows;
}
export function importCsv(name: string, input: string): SheetResult {
  const rows = parseCsv(input);
  return {
    sheets: [{ name: name.replace(/\.[^.]+$/, "").slice(0, 60) || "Hoja", rows }],
    warning: rows.length >= MAX_ROWS ? "Se tomaron las primeras " + MAX_ROWS + " filas." : "",
  };
}
export function sheetCsv(s: Sheet) {
  const width = Math.max(0, ...s.rows.map((r) => r.length));
  return "﻿" + s.rows.map((r) => Array.from({ length: width }, (_, i) => csvCell(r[i] ?? "")).join(",")).join("\r\n");
}
// PDF con el estilo de Yalika: título de hoja, encabezado que se repite, filas alternadas, totales resaltados y pie con página.
// Solo caracteres latinos (lo demás sale como «?»). Las columnas que no caben van en páginas siguientes.
export async function sheetPdf(sheets: Sheet[], title: string, opts: { theme?: ThemeId; header?: boolean } = {}) {
  const { jsPDF } = await import("jspdf"),
    themeId = opts.theme ?? "yalika",
    header = opts.header ?? true,
    t = theme(themeId),
    styled = themeId !== "plano";
  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  pdf.setProperties({ title });
  const W = pdf.internal.pageSize.getWidth(),
    H = pdf.internal.pageSize.getHeight(),
    M = 36,
    line = 17,
    latin = (s: string) => s.replace(/[^\u0009\u000a\u000d -~ -ÿ]/gu, "?").replace(/\s+/g, " "),
    rgb = (h: string) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)] as const,
    fill = (h: string) => pdf.setFillColor(...rgb(h)),
    ink = (h: string) => pdf.setTextColor(...rgb(h)),
    stroke = (h: string) => pdf.setDrawColor(...rgb(h)),
    tag: string[] = [];
  pdf.setFontSize(9);
  for (const s of sheets) {
    const width = Math.max(1, ...s.rows.map((r) => r.length)),
      widths = Array.from({ length: width }, (_, c) => {
        const longest = Math.max(3, ...s.rows.slice(0, 300).map((r) => latin(r[c] ?? "").length));
        return Math.min(160, longest * 5 + 14);
      }),
      numeric = Array.from({ length: width }, (_, c) => {
        const body = s.rows.slice(header ? 1 : 0).map((r) => r[c] ?? "").filter(Boolean);
        return body.length > 0 && body.filter((x) => parseNumber(x) !== null || /^-?[\d,.]+%$/.test(x)).length * 2 >= body.length;
      }),
      groups: number[][] = [];
    let cur: number[] = [],
      used = 0;
    widths.forEach((w, c) => {
      if (cur.length && used + w > W - 2 * M) {
        groups.push(cur);
        cur = [];
        used = 0;
      }
      cur.push(c);
      used += w;
    });
    groups.push(cur);
    if (groups.length === 1) {
      const k = Math.min(1.8, (W - 2 * M) / used);
      widths.forEach((w, c) => (widths[c] = w * k));
    }
    groups.forEach((cols) => {
      const tableW = cols.reduce((n, c) => n + widths[c], 0);
      let y = H;
      const draw = (r: string[], ri: number) => {
        let x = M;
        const first = look(themeId, header, ri, r, null);
        if (styled && first.total) {
          stroke(t.accent);
          pdf.setLineWidth(1.2);
          pdf.line(M, y - 12, M + tableW, y - 12);
        }
        for (const c of cols) {
          const f = s.fmt?.[ri]?.[c] ?? null,
            k = look(themeId, header, ri, r, f);
          if (k.fill && (styled || f?.f !== undefined)) {
            fill(k.fill);
            pdf.rect(x, y - 12, widths[c], line, "F");
          }
          let text = latin(r[c] ?? "");
          pdf.setFont("helvetica", k.bold ? "bold" : "normal");
          ink(k.color ?? "1F2933");
          while (text !== "..." && text.length > 3 && pdf.getTextWidth(text) > widths[c] - 12) text = text.slice(0, -4) + "...";
          const right = k.align ? k.align === "r" : numeric[c] && (k.head || k.n !== undefined || parseNumber(text) !== null || /^-?[\d,.]+%$/.test(text)),
            center = k.align === "c";
          if (text) pdf.text(text, right ? x + widths[c] - 6 : center ? x + widths[c] / 2 : x + 6, y, { align: right ? "right" : center ? "center" : "left" });
          x += widths[c];
        }
        if (styled && !first.head) {
          stroke(t.line);
          pdf.setLineWidth(0.5);
          pdf.line(M, y - 12 + line, M + tableW, y - 12 + line);
        }
      };
      s.rows.forEach((r, ri) => {
        if (ri === 0 || y + line > H - M - 14) {
          pdf.addPage();
          tag.push(s.name);
          y = M;
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(14);
          ink(t.accent);
          pdf.text(latin(s.name) + (groups.length > 1 ? "  (columnas " + (cols[0] + 1) + "-" + (cols[cols.length - 1] + 1) + ")" : ""), M, y);
          pdf.setFontSize(9);
          stroke(t.accent);
          pdf.setLineWidth(1.5);
          pdf.line(M, y + 7, M + Math.min(60, tableW), y + 7);
          y += 34;
          if (ri > 0 && header && s.rows[0]) {
            draw(s.rows[0], 0);
            y += line;
          }
        }
        draw(r, ri);
        y += line;
      });
      if (!s.rows.length) {
        pdf.addPage();
        tag.push(s.name);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(14);
        ink(t.accent);
        pdf.text(latin(s.name) + " (sin datos)", M, M);
        pdf.setFontSize(9);
      }
    });
  }
  pdf.deletePage(1);
  const total = pdf.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    pdf.setPage(p);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    ink("7B8794");
    pdf.text(latin(title) + "  ·  " + latin(tag[p - 1] ?? ""), M, H - 20);
    pdf.text("Página " + p + " de " + total, W - M, H - 20, { align: "right" });
  }
  return new Uint8Array(pdf.output("arraybuffer"));
}
