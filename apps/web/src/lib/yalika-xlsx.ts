// Escribe un archivo Excel (.xlsx) en el navegador: texto, números y fórmulas con su resultado ya calculado.
import { zipSync, strToU8 } from "fflate";
import { MAX_GRID_COLS, MAX_GRID_ROWS, calc, colName, isFormula, parseNumber, toEnglishFormula, fmtNumber } from "./yalika-calc";
export type XlsxSheet = { name: string; rows: string[][] };
const esc = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
export function sheetName(raw: string, taken: string[] = []) {
  const base = raw.replace(/[[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim().replace(/^'+|'+$/g, "").slice(0, 31) || "Hoja";
  let name = base,
    n = 2;
  while (taken.some((t) => t.toLowerCase() === name.toLowerCase())) name = base.slice(0, 31 - String(n).length - 1) + " " + n++;
  return name;
}
export function buildXlsx(sheets: XlsxSheet[], headerBold = true): Uint8Array {
  if (!sheets.length || sheets.length > 20) throw Error("El archivo debe tener entre 1 y 20 hojas.");
  const names: string[] = [];
  const parts: Record<string, Uint8Array> = {};
  sheets.forEach((sh, i) => {
    if (sh.rows.length > MAX_GRID_ROWS || sh.rows.some((r) => r.length > MAX_GRID_COLS)) throw Error("La hoja es demasiado grande.");
    names.push(sheetName(sh.name, names));
    const values = calc(sh.rows),
      width = Math.max(1, ...sh.rows.map((r) => r.length)),
      cols = Array.from({ length: width }, (_, c) =>
        Math.min(60, Math.max(8, ...sh.rows.slice(0, 200).map((r, ri) => (isFormula(r[c] ?? "") ? String(values[ri][c]) : (r[c] ?? "")).length + 2))),
      );
    const rowsXml = sh.rows
      .map((row, r) => {
        const cells = row
          .map((raw, c) => {
            if (raw === "") return "";
            const ref = colName(c) + (r + 1),
              style = headerBold && r === 0 ? ' s="1"' : "";
            if (isFormula(raw)) {
              const v = values[r][c];
              const f = "<f>" + esc(toEnglishFormula(raw)) + "</f>";
              if (typeof v === "number") return `<c r="${ref}"${style}>${f}<v>${fmtNumber(v)}</v></c>`;
              if (typeof v === "object") return `<c r="${ref}"${style} t="e">${f}<v>${esc(v.error)}</v></c>`;
              return `<c r="${ref}"${style} t="str">${f}<v>${esc(v)}</v></c>`;
            }
            const n = parseNumber(raw);
            if (n !== null) return `<c r="${ref}"${style}><v>${fmtNumber(n)}</v></c>`;
            return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${esc(raw)}</t></is></c>`;
          })
          .join("");
        return cells ? `<row r="${r + 1}">${cells}</row>` : "";
      })
      .join("");
    parts[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        (headerBold ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : "") +
        "<cols>" +
        cols.map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`).join("") +
        "</cols><sheetData>" +
        rowsXml +
        "</sheetData></worksheet>",
    );
  });
  parts["[Content_Types].xml"] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
      "</Types>",
  );
  parts["_rels/.rels"] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  );
  parts["xl/workbook.xml"] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
      '</sheets><calcPr fullCalcOnLoad="1"/></workbook>',
  );
  parts["xl/_rels/workbook.xml.rels"] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );
  parts["xl/styles.xml"] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
  );
  return zipSync(parts);
}
