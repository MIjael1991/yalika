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

  // Modo completo: formato básico y fórmulas que Yalika calcula igual que Excel
  {
    const rich = zipSync({
      "xl/workbook.xml": strToU8('<workbook><sheets><sheet name="Cuentas" sheetId="1" r:id="rId1"/><sheet name="Otra" sheetId="2" r:id="rId2"/></sheets></workbook>'),
      "xl/_rels/workbook.xml.rels": strToU8('<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="x" Target="worksheets/sheet2.xml"/></Relationships>'),
      "xl/styles.xml": strToU8(
        '<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/></numFmts>' +
          '<fonts count="2"><font><sz val="11"/></font><font><b/><sz val="11"/></font></fonts>' +
          '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/></patternFill></fill></fills>' +
          '<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0"/><xf numFmtId="0" fontId="1" fillId="0"/><xf numFmtId="164" fontId="0" fillId="0"/><xf numFmtId="0" fontId="0" fillId="2"><alignment horizontal="center"/></xf><xf numFmtId="9" fontId="0" fillId="0"/></cellXfs></styleSheet>',
      ),
      "xl/worksheets/sheet1.xml": strToU8(
        '<worksheet><sheetData>' +
          '<row r="1"><c r="A1" t="inlineStr" s="3"><is><t>Concepto</t></is></c><c r="B1" t="inlineStr"><is><t>Monto</t></is></c></row>' +
          '<row r="2"><c r="A2" t="inlineStr" s="1"><is><t>Renta</t></is></c><c r="B2" s="2"><v>1000.5</v></c><c r="C2" s="3"><v>1</v></c><c r="D2" s="4"><v>0.25</v></c></row>' +
          '<row r="3"><c r="A3" t="inlineStr"><is><t>Luz</t></is></c><c r="B3"><v>200</v></c></row>' +
          '<row r="4"><c r="A4" t="inlineStr"><is><t>Total</t></is></c><c r="B4"><f>SUM($B$2:B3)</f><v>1200.5</v></c><c r="C4"><f>B4*2</f><v>2401</v></c><c r="D4"><f>B3*3</f><v>999</v></c>' +
          '<c r="E4" t="str"><f>IF(B3&gt;100,"alto","bajo")</f><v>alto</v></c><c r="F4"><f>VLOOKUP(A2,A2:B3,2,0)</f><v>1000.5</v></c><c r="G4"><f>Otra!A1+1</f><v>6</v></c></row>' +
          '</sheetData></worksheet>',
      ),
      "xl/worksheets/sheet2.xml": strToU8('<worksheet><sheetData><row r="1"><c r="A1"><v>5</v></c></row></sheetData></worksheet>'),
    });
    const light = S.importXlsx(rich);
    assert.equal(light.sheets[0].fmt, undefined, "sin modo completo no hay formato");
    assert.equal(light.sheets[0].rows[3][1], "1200.5");
    const r2 = S.importXlsx(rich, { rich: true }),
      sh = r2.sheets[0];
    assert.equal(sh.rows[3][1], "=SUM(B2:B3)", "referencias absolutas se vuelven normales");
    assert.equal(sh.rows[3][2], "=B4*2");
    assert.equal(sh.rows[3][3], "999", "si el resultado no coincide queda el valor de Excel");
    assert.equal(sh.rows[3][4], '=IF(B3>100,"alto","bajo")');
    assert.equal(sh.rows[3][5], "1000.5", "función que Yalika no tiene: queda el valor");
    assert.equal(sh.rows[3][6], "6", "fórmula entre hojas: queda el valor");
    assert.equal(r2.formulas, 3);
    assert.match(r2.warning, /3 fórmulas/);
    assert.equal(sh.fmt[1][0].b, true, "negrita");
    assert.equal(sh.fmt[1][1].n, "money", "moneda");
    assert.equal(sh.fmt[1][2].f, 0, "amarillo");
    assert.equal(sh.fmt[1][2].a, "c", "centrado");
    assert.deepEqual(sh.fmt[0][0], { a: "c" }, "el encabezado no toma relleno");
    assert.equal(sh.fmt[1][3], null, "porcentaje real de Excel se deja como número");
    assert.equal(r2.sheets[1].fmt, undefined);
    // Archivos hechos por otros programas pueden traer fórmulas sin resultado guardado: se conservan si Yalika las calcula
    const bare = zipSync({
      "xl/workbook.xml": strToU8('<workbook><sheets><sheet name="H" sheetId="1" r:id="rId1"/></sheets></workbook>'),
      "xl/_rels/workbook.xml.rels": strToU8('<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>'),
      "xl/worksheets/sheet1.xml": strToU8('<worksheet><sheetData><row r="1"><c r="A1"><v>2</v></c><c r="B1"><f>A1*5</f><v></v></c><c r="C1"><f>VLOOKUP(A1,A1:B1,2,0)</f></c></row></sheetData></worksheet>'),
    }),
      rb = S.importXlsx(bare, { rich: true });
    assert.deepEqual(rb.sheets[0].rows[0], ["2", "=A1*5", ""]);
    // Ida y vuelta: lo que Yalika exporta se vuelve a abrir completo (también filas con fórmula en blanco)
    const C = require("../src/lib/yalika-calc.ts"),
      X = require("../src/lib/yalika-xlsx.ts");
    for (const t of C.SHEET_TEMPLATES) {
      const rows = C.templateRows(t.id),
        fmt = rows.map((x) => x.map(() => null));
      fmt[1][1] = { b: true, n: "money", a: "r", f: 2 };
      const back = S.importXlsx(X.buildXlsx([{ name: t.id, rows, fmt }]), { rich: true }),
        total = rows.flat().filter((c) => c.startsWith("=")).length;
      assert.equal(back.formulas, total, "fórmulas conservadas en " + t.id);
      if (t.id !== "blanco") assert.deepEqual(back.sheets[0].fmt[1][1], { b: true, n: "money", a: "r", f: 2 });
      const was = C.calc(rows).map((r) => r.map(C.showValue)),
        now = C.calc(back.sheets[0].rows).map((r) => r.map(C.showValue));
      was.forEach((r, i) => r.forEach((v, j) => assert.equal(now[i]?.[j] ?? "", v, "mismo resultado " + t.id + " " + i + "," + j)));
    }
  }

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
