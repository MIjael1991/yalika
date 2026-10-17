// Escritor de Excel (.xlsx) para reportes grandes: celdas con tipo explícito, sin adivinar nada.
// - Un texto SIEMPRE se guarda como texto (nunca se vuelve fórmula ni pierde ceros: folios, SKU, códigos).
// - Un número es número; una fórmula solo existe si el reporte la pide con `f` (y lleva su resultado ya calculado).
// - Aguanta miles de filas (el escritor de Estudio se limita a 200). Todo ocurre en el dispositivo.
import { zipSync, strToU8 } from "fflate";

export type CellStyle = "bold" | "title" | "money" | "moneyBold" | "int" | "intBold" | "percent" | "head" | "note";

export type XCell =
  | null
  | string
  | number
  | { v: string | number; f?: string; s?: CellStyle };

export type XSheet = {
  name: string;
  rows: XCell[][];
  /** Ancho de cada columna en caracteres; si falta, se calcula con el contenido. */
  widths?: number[];
  /** Congela las primeras N filas (encabezado). */
  freeze?: number;
  /** Activa el autofiltro sobre la fila de encabezado indicada (1 = primera fila). */
  filterHeaderRow?: number;
};

export const MAX_XLSX_ROWS = 20000;
export const MAX_XLSX_COLS = 40;
export const MAX_XLSX_SHEETS = 20;

// Índices de estilo en styles.xml (ver más abajo).
const STYLE_INDEX: Record<CellStyle, number> = {
  bold: 1,
  title: 2,
  money: 3,
  moneyBold: 4,
  int: 5,
  intBold: 6,
  percent: 7,
  head: 8,
  note: 9,
};

const esc = (value: string) =>
  value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** A, B, … Z, AA, AB… (columna 0 = A). */
export function columnName(index: number) {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rest = (n - 1) % 26;
    out = String.fromCharCode(65 + rest) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** Nombre de hoja válido para Excel y sin repetir. */
export function safeSheetName(raw: string, taken: string[] = []) {
  const base =
    raw
      .replace(/[[\]:*?/\\]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^'+|'+$/g, "")
      .slice(0, 31) || "Hoja";
  let name = base;
  let n = 2;
  while (taken.some((t) => t.toLowerCase() === name.toLowerCase())) {
    const suffix = ` ${n++}`;
    name = base.slice(0, 31 - suffix.length) + suffix;
  }
  return name;
}

const num = (value: number) => (Number.isFinite(value) ? String(Math.round(value * 1e6) / 1e6) : "0");

function cellXml(ref: string, cell: XCell): string {
  if (cell === null || cell === "") return "";
  const spec = typeof cell === "object" ? cell : { v: cell };
  const style = spec.s ? ` s="${STYLE_INDEX[spec.s]}"` : "";

  if (spec.f !== undefined) {
    const formula = `<f>${esc(spec.f.replace(/^=/, ""))}</f>`;
    if (typeof spec.v === "number") return `<c r="${ref}"${style}>${formula}<v>${num(spec.v)}</v></c>`;
    return `<c r="${ref}"${style} t="str">${formula}<v>${esc(String(spec.v))}</v></c>`;
  }
  if (typeof spec.v === "number") {
    if (!Number.isFinite(spec.v)) return "";
    return `<c r="${ref}"${style}><v>${num(spec.v)}</v></c>`;
  }
  if (spec.v === "") return "";
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${esc(spec.v)}</t></is></c>`;
}

function textLength(cell: XCell) {
  if (cell === null) return 0;
  const value = typeof cell === "object" ? cell.v : cell;
  if (typeof value === "number") return value.toFixed(2).length + 3;
  return value.length;
}

export function buildWorkbook(sheets: XSheet[]): Uint8Array {
  if (!sheets.length || sheets.length > MAX_XLSX_SHEETS) throw new Error("El archivo debe tener entre 1 y 20 hojas.");

  const names: string[] = [];
  const parts: Record<string, Uint8Array> = {};

  sheets.forEach((sheet, index) => {
    if (sheet.rows.length > MAX_XLSX_ROWS || sheet.rows.some((row) => row.length > MAX_XLSX_COLS)) {
      throw new Error("La hoja es demasiado grande.");
    }
    names.push(safeSheetName(sheet.name, names));

    const width = Math.max(1, ...sheet.rows.map((row) => row.length));
    const widths = Array.from({ length: width }, (_, c) => {
      if (sheet.widths?.[c]) return sheet.widths[c];
      const sample = sheet.rows.slice(0, 300).map((row) => textLength(row[c] ?? null));
      return Math.min(50, Math.max(10, ...sample.map((n) => n + 2)));
    });

    const rowsXml = sheet.rows
      .map((row, r) => {
        const cells = row.map((cell, c) => cellXml(columnName(c) + (r + 1), cell)).join("");
        return cells ? `<row r="${r + 1}">${cells}</row>` : "";
      })
      .join("");

    const freeze = sheet.freeze && sheet.freeze > 0 ? sheet.freeze : 0;
    const view = freeze
      ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${freeze}" topLeftCell="A${freeze + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
      : "";
    const lastRow = Math.max(1, sheet.rows.length);
    const filter =
      sheet.filterHeaderRow && sheet.filterHeaderRow <= lastRow
        ? `<autoFilter ref="A${sheet.filterHeaderRow}:${columnName(width - 1)}${lastRow}"/>`
        : "";

    parts[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        view +
        "<cols>" +
        widths.map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`).join("") +
        "</cols><sheetData>" +
        rowsXml +
        "</sheetData>" +
        filter +
        '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToHeight="0"/></worksheet>',
    );
  });

  // Los filtros automáticos necesitan un nombre definido por hoja para que Excel no se queje.
  const definedNames = sheets
    .map((sheet, i) => {
      if (!sheet.filterHeaderRow) return "";
      const width = Math.max(1, ...sheet.rows.map((row) => row.length));
      const lastRow = Math.max(1, sheet.rows.length);
      const sheetRef = `'${names[i].replace(/'/g, "''")}'`;
      return `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${esc(sheetRef)}!$A$${sheet.filterHeaderRow}:$${columnName(width - 1)}$${lastRow}</definedName>`;
    })
    .join("");

  parts["[Content_Types].xml"] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join("") +
      "</Types>",
  );
  parts["_rels/.rels"] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  );
  parts["xl/workbook.xml"] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
      "</sheets>" +
      (definedNames ? `<definedNames>${definedNames}</definedNames>` : "") +
      '<calcPr fullCalcOnLoad="1"/></workbook>',
  );
  parts["xl/_rels/workbook.xml.rels"] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join("") +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );

  // Estilos: 0 normal · 1 negrita · 2 título · 3 dinero · 4 dinero negrita · 5 entero · 6 entero negrita
  //          7 porcentaje · 8 encabezado (fondo gris, negrita) · 9 nota (gris)
  parts["xl/styles.xml"] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00;[Red]\\-&quot;$&quot;#,##0.00"/><numFmt numFmtId="165" formatCode="#,##0"/></numFmts>' +
      '<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF666666"/><name val="Calibri"/></font></fonts>' +
      '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7EEF5"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FF999999"/></bottom><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="10">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="164" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>' +
      '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="165" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>' +
      '<xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
      '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
  );

  return zipSync(parts);
}
