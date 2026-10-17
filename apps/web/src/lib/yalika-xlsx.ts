// Escribe un archivo Excel (.xlsx) en el navegador: texto, números y fórmulas con su resultado ya calculado.
import { zipSync, strToU8 } from "fflate";
import { look, theme, type FmtGrid, type ThemeId } from "./yalika-book";
import { MAX_GRID_COLS, MAX_GRID_ROWS, calc, colName, isFormula, parseNumber, toEnglishFormula, fmtNumber } from "./yalika-calc";
export type XlsxSheet = { name: string; rows: string[][]; fmt?: FmtGrid };
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
const NUM_ID = { money: 164, int: 165, dec: 166, pct: 167 } as const;
const H_ATTR = { l: "left", c: "center", r: "right" } as const;
export function buildXlsx(sheets: XlsxSheet[], headerBold = true, themeId: ThemeId = "plano"): Uint8Array {
  if (!sheets.length || sheets.length > 20) throw Error("El archivo debe tener entre 1 y 20 hojas.");
  const names: string[] = [],
    parts: Record<string, Uint8Array> = {},
    t = theme(themeId),
    styled = themeId !== "plano",
    fills: string[] = [],
    xfs: string[] = [],
    xfIndex = new Map<string, number>();
  // Cada combinación distinta de estilo (letra, relleno, borde, formato, alineación) se registra una sola vez.
  const style = (font: number, fill: string | undefined, border: number, num: number, h: string | undefined) => {
    if (!font && !fill && !border && !num && !h && !styled) return "";
    const key = [font, fill ?? "", border, num, h ?? ""].join("|");
    let i = xfIndex.get(key);
    if (i === undefined) {
      let fillId = 0;
      if (fill) {
        let at = fills.indexOf(fill);
        if (at < 0) at = fills.push(fill) - 1;
        fillId = at + 2;
      }
      i = xfs.push(
        `<xf numFmtId="${num}" fontId="${font}" fillId="${fillId}" borderId="${border}" xfId="0"${num ? ' applyNumberFormat="1"' : ""}${font ? ' applyFont="1"' : ""}${fillId ? ' applyFill="1"' : ""}${border ? ' applyBorder="1"' : ""} applyAlignment="1"><alignment${h ? ` horizontal="${h}"` : ""} vertical="center"/></xf>`,
      );
      xfIndex.set(key, i);
    }
    return ` s="${i}"`;
  };
  sheets.forEach((sh, i) => {
    if (sh.rows.length > MAX_GRID_ROWS || sh.rows.some((r) => r.length > MAX_GRID_COLS)) throw Error("La hoja es demasiado grande.");
    names.push(sheetName(sh.name, names));
    const values = calc(sh.rows),
      width = Math.max(1, ...sh.rows.map((r) => r.length)),
      cols = Array.from({ length: width }, (_, c) =>
        Math.min(60, Math.max(12, ...sh.rows.slice(0, 200).map((r, ri) => (isFormula(r[c] ?? "") ? String(values[ri][c]) : (r[c] ?? "")).length + 2))),
      );
    const rowsXml = sh.rows
      .map((row, r) => {
        const cells = Array.from({ length: width }, (_, c) => {
          const raw = row[c] ?? "",
            l = look(themeId, headerBold, r, row, sh.fmt?.[r]?.[c]),
            st = style(l.color ? 2 : l.bold ? 1 : 0, l.fill, styled ? (l.total ? 2 : 1) : 0, l.n ? NUM_ID[l.n] : 0, l.align ? H_ATTR[l.align] : undefined),
            ref = colName(c) + (r + 1);
          if (raw === "") return st ? `<c r="${ref}"${st}/>` : "";
          if (isFormula(raw)) {
            const v = values[r][c];
            const f = "<f>" + esc(toEnglishFormula(raw)) + "</f>";
            if (typeof v === "number") return `<c r="${ref}"${st}>${f}<v>${fmtNumber(v)}</v></c>`;
            if (typeof v === "object") return `<c r="${ref}"${st} t="e">${f}<v>${esc(v.error)}</v></c>`;
            return `<c r="${ref}"${st} t="str">${f}<v>${esc(v)}</v></c>`;
          }
          const n = parseNumber(raw);
          if (n !== null) return `<c r="${ref}"${st}><v>${fmtNumber(n)}</v></c>`;
          return `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${esc(raw)}</t></is></c>`;
        }).join("");
        return cells ? `<row r="${r + 1}"${styled && headerBold && r === 0 ? ' ht="24" customHeight="1"' : ""}>${cells}</row>` : "";
      })
      .join("");
    parts[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
        `<sheetViews><sheetView workbookViewId="0"${styled ? ' showGridLines="0"' : ""}${i === 0 ? ' tabSelected="1"' : ""}>` +
        (headerBold ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : "") +
        "</sheetView></sheetViews><cols>" +
        cols.map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`).join("") +
        "</cols><sheetData>" +
        rowsXml +
        '</sheetData><printOptions horizontalCentered="1"/><pageMargins left="0.5" right="0.5" top="0.6" bottom="0.7" header="0.3" footer="0.3"/>' +
        `<pageSetup paperSize="9" orientation="${width > 6 ? "landscape" : "portrait"}" fitToWidth="1" fitToHeight="0"/>` +
        '<headerFooter><oddFooter>&amp;L&amp;8&amp;A&amp;R&amp;8Página &amp;P de &amp;N</oddFooter></headerFooter></worksheet>',
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
      "</sheets>" +
      (headerBold
        ? "<definedNames>" +
          names.map((n, i) => `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">'${esc(n).replace(/'/g, "''")}'!$1:$1</definedName>`).join("") +
          "</definedNames>"
        : "") +
      '<calcPr fullCalcOnLoad="1"/></workbook>',
  );
  parts["xl/_rels/workbook.xml.rels"] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );
  const line = t.line,
    border = (top: string, bottom: string) => `<border><left/><right/>${top}${bottom}<diagonal/></border>`,
    hair = `<bottom style="thin"><color rgb="FF${line}"/></bottom>`;
  parts["xl/styles.xml"] = strToU8(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="4"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/><numFmt numFmtId="165" formatCode="#,##0"/><numFmt numFmtId="166" formatCode="#,##0.00"/><numFmt numFmtId="167" formatCode="0.0&quot;%&quot;"/></numFmts>' +
      '<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF' + t.headText + '"/><name val="Calibri"/></font></fonts>' +
      `<fills count="${fills.length + 2}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
      fills.map((h) => `<fill><patternFill patternType="solid"><fgColor rgb="FF${h}"/><bgColor indexed="64"/></patternFill></fill>`).join("") +
      "</fills>" +
      `<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border>${border("<top/>", hair)}${border(`<top style="medium"><color rgb="FF${t.accent}"/></top>`, hair)}</borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${xfs.length + 1}"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>${xfs.join("")}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
  );
  return zipSync(parts);
}
