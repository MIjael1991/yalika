// Hojas de cálculo: lee Excel (.xlsx) y CSV en el navegador y las pasa a PDF o CSV.
// Solo se leen los valores que Excel dejó guardados; no se recalculan fórmulas ni se copia el formato.
import { unzipSync } from "fflate";
import { csvCell } from "./yalika-records";
export type Sheet = { name: string; rows: string[][] };
export type SheetResult = { sheets: Sheet[]; warning: string };
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
export function importXlsx(bytes: Uint8Array): SheetResult {
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
    sheets: Sheet[] = [];
  let cut = false;
  for (const m of book.matchAll(/<sheet\s[^>]*>/g)) {
    const name = entities(/\bname="([^"]*)"/.exec(m[0])?.[1] ?? "Hoja"),
      rid = /\br:id="([^"]*)"/.exec(m[0])?.[1],
      xml = rid && targets.get(rid) ? dec(targets.get(rid)!) : "";
    if (!xml) continue;
    const rows: string[][] = [];
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
      }
      while (rows.length < at) rows.push([]);
      rows[at] = row;
    }
    while (rows.length && !rows[rows.length - 1].some(Boolean)) rows.pop();
    sheets.push({ name: clean(name).slice(0, 60) || "Hoja", rows });
  }
  if (!sheets.length) throw Error(bad);
  const empty = sheets.every((s) => !s.rows.length);
  return {
    sheets,
    warning:
      (empty ? "La hoja no tiene datos. " : "") +
      (cut ? "Se tomaron las primeras " + MAX_ROWS + " filas y " + MAX_COLS + " columnas. " : "") +
      "Solo se copian los valores; el formato y las fórmulas no se conservan.",
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
// PDF básico: solo caracteres latinos (lo demás sale como «?»). Las columnas que no caben van en páginas siguientes.
export async function sheetPdf(sheets: Sheet[], title: string) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  pdf.setProperties({ title });
  const W = pdf.internal.pageSize.getWidth(),
    H = pdf.internal.pageSize.getHeight(),
    M = 36,
    line = 14,
    latin = (s: string) => s.replace(/[^\u0009\u000a\u000d -~ -ÿ]/gu, "?").replace(/\s+/g, " ");
  pdf.setFontSize(8);
  for (const s of sheets) {
    const width = Math.max(1, ...s.rows.map((r) => r.length)),
      widths = Array.from({ length: width }, (_, c) => {
        const longest = Math.max(3, ...s.rows.slice(0, 300).map((r) => latin(r[c] ?? "").length));
        return Math.min(150, longest * 4.4 + 8);
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
    groups.forEach((cols) => {
      let y = H;
      s.rows.forEach((r, ri) => {
        if (ri === 0 || y + line > H - M) {
          pdf.addPage();
          y = M;
          pdf.setFont("helvetica", "bold");
          pdf.text(latin(s.name) + (groups.length > 1 ? " (columnas " + (cols[0] + 1) + "-" + (cols[cols.length - 1] + 1) + ")" : ""), M, y);
          y += line * 1.5;
        }
        pdf.setFont("helvetica", ri === 0 ? "bold" : "normal");
        let x = M;
        for (const c of cols) {
          let t = latin(r[c] ?? "");
          while (t !== "..." && t.length > 3 && pdf.getTextWidth(t) > widths[c] - 6) t = t.slice(0, -4) + "...";
          pdf.text(t, x, y);
          x += widths[c];
        }
        y += line;
      });
      if (!s.rows.length) {
        pdf.addPage();
        pdf.text(latin(s.name) + " (sin datos)", M, M);
      }
    });
  }
  pdf.deletePage(1);
  return new Uint8Array(pdf.output("arraybuffer"));
}
