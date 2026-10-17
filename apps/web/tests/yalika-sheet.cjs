const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  ts = require("typescript");
require.extensions[".ts"] = (mod, filename) =>
  mod._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText,
    filename,
  );
const { zipSync, strToU8 } = require("fflate");
const S = require("../src/lib/yalika-sheet.ts");
const xlsx = (extra = {}) =>
  zipSync({
    "xl/workbook.xml": strToU8('<workbook><sheets><sheet name="Ventas &amp; más" sheetId="1" r:id="rId1"/><sheet name="Vacía" sheetId="2" r:id="rId2"/></sheets></workbook>'),
    "xl/_rels/workbook.xml.rels": strToU8('<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="x" Target="/xl/worksheets/sheet2.xml"/></Relationships>'),
    "xl/sharedStrings.xml": strToU8('<sst><si><t>Producto</t></si><si><r><t>Caf</t></r><r><t>é</t></r></si><si><t>a &lt; b</t></si></sst>'),
    "xl/styles.xml": strToU8('<styleSheet><numFmts><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="14"/></cellXfs></styleSheet>'),
    "xl/worksheets/sheet1.xml": strToU8(
      '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="inlineStr"><is><t>Fecha</t></is></c></row>' +
        '<row r="3"><c r="A3" t="s"><v>1</v></c><c r="B3"><v>12.5</v></c><c r="C3" s="1"><v>46036</v></c><c r="D3" t="b"><v>1</v></c><c r="E3" t="s"><v>2</v></c><c r="F3"><f>B3*2</f><v>25</v></c></row></sheetData></worksheet>',
    ),
    "xl/worksheets/sheet2.xml": strToU8("<worksheet><sheetData/></worksheet>"),
    ...extra,
  });
(async () => {
  const r = S.importXlsx(xlsx());
  assert.deepEqual(r.sheets.map((s) => s.name), ["Ventas & más", "Vacía"]);
  const a = r.sheets[0].rows;
  assert.deepEqual(a[0], ["Producto", "", "Fecha"]);
  assert.deepEqual(a[1], []);
  assert.deepEqual(a[2], ["Café", "12.5", "2026-01-14", "VERDADERO", "a < b", "25"]);
  assert.equal(S.excelDate(46036), "2026-01-14");
  assert.equal(S.excelDate(46036.5), "2026-01-14 12:00");
  assert.match(r.warning, /valores/);
  assert.throws(() => S.importXlsx(new Uint8Array([1, 2, 3])), /Excel/);
  assert.throws(() => S.importXlsx(zipSync({ "a.txt": strToU8("x") })), /Excel/);
  assert.throws(() => S.importXlsx(new Uint8Array(21 * 1024 * 1024)), /20 MB/);

  // CSV
  const c = S.parseCsv('﻿nombre;nota\r\n"López; Ana";"dijo ""hola""\nadiós"\r\nLuis;9\r\n');
  assert.deepEqual(c, [["nombre", "nota"], ["López; Ana", 'dijo "hola"\nadiós'], ["Luis", "9"]]);
  assert.deepEqual(S.parseCsv("a,b\n1,2"), [["a", "b"], ["1", "2"]]);
  assert.deepEqual(S.parseCsv("a\tb\n1\t2"), [["a", "b"], ["1", "2"]]);
  const csv = S.sheetCsv({ name: "x", rows: [["a", "=1+1"], ["b,c"]] });
  assert.equal(csv, "﻿a,'=1+1\r\n\"b,c\",");

  // PDF
  const rows = Array.from({ length: 120 }, (_, i) => Array.from({ length: 30 }, (_, j) => "celda " + i + "-" + j + " ñ 日本"));
  const pdf = await S.sheetPdf([{ name: "Grande", rows }, { name: "Vacía", rows: [] }], "t");
  const txt = Buffer.from(pdf).toString("latin1");
  assert.ok(txt.startsWith("%PDF"));
  const pages = (txt.match(/\/Type\s*\/Page[^s]/g) || []).length;
  assert.ok(pages > 4, "paginación por filas y columnas: " + pages);
  const tiny = await S.sheetPdf([{ name: "Uno", rows: [["a"]] }], "t");
  assert.equal((Buffer.from(tiny).toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length, 1);
  console.log("HOJAS_OK: xlsx (texto, fechas, booleanos, rutas), CSV, límites, CSV seguro y PDF paginado.");
})();
