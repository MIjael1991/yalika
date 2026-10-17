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
const { unzipSync, strFromU8 } = require("fflate");
const C = require("../src/lib/yalika-calc.ts");
const X = require("../src/lib/yalika-xlsx.ts");
const show = (rows) => C.calc(rows).map((r) => r.map(C.showValue));
const one = (f, extra = []) => show([[...extra], [f]])[1][0];
(async () => {
  // Números y texto
  assert.equal(C.parseNumber("12"), 12);
  assert.equal(C.parseNumber("1,250.50"), 1250.5);
  assert.equal(C.parseNumber("$99.9"), 99.9);
  assert.equal(C.parseNumber("1,5"), null, "la coma no es decimal");
  assert.equal(C.parseNumber("abc"), null);
  assert.equal(C.parseNumber(""), null);
  assert.equal(C.colName(0), "A");
  assert.equal(C.colName(25), "Z");
  assert.equal(C.colName(26), "AA");
  assert.deepEqual(C.parseRef("b3"), { r: 2, c: 1 });
  assert.equal(C.parseRef("3B"), null);
  // Aritmética y precedencia
  assert.equal(one("=1+2*3"), "7");
  assert.equal(one("=(1+2)*3"), "9");
  assert.equal(one("=2^3^2"), "512");
  assert.equal(one("=-2^2"), "4", "el menos unario se aplica primero, como en Excel");
  assert.equal(one("=10/4"), "2.5");
  assert.equal(one("=0.1+0.2"), "0.3");
  assert.equal(one("=1/0"), "#DIV/0!");
  assert.equal(one("=1+"), "#ERROR");
  assert.equal(one("=1 2"), "#ERROR");
  assert.equal(one("=FOO(1)"), "#NOMBRE?");
  assert.equal(one("=2$3"), "#ERROR");
  assert.equal(one("="), "=", "un «=» solo es texto");
  // Referencias, rangos y funciones (español e inglés, coma o punto y coma)
  const data = [["10", "20", "x", ""], ["5", "", "", ""], ["=A1+B1", "=SUMA(A1:B2)", "=PROMEDIO(A1:A2)", "=MAX(A1:B2;100)"], ["=MIN(A1:B2)", "=CONTAR(A1:C2)", "=SUM(A1,B1,5)", "=REDONDEAR(2.345;2)"]];
  const s = show(data);
  assert.deepEqual(s[2], ["30", "35", "7.5", "100"]);
  assert.deepEqual(s[3], ["5", "3", "35", "2.35"]);
  assert.equal(show([["=ABS(-3)"]])[0][0], "3");
  assert.equal(show([["a", "=A1+1"]])[0][1], "#VALOR!", "texto en una suma");
  assert.equal(show([["", "=A1+1"]])[0][1], "1", "celda vacía vale 0");
  assert.equal(show([["abc", "=SUMA(A1:A1)"]])[0][1], "0", "los rangos ignoran el texto");
  assert.equal(show([["=PROMEDIO(B1:B2)"]])[0][0], "#DIV/0!");
  assert.equal(show([["=SI.ERROR(PROMEDIO(E1:E2);0)", "=IFERROR(1/0,7)", "=SI.ERROR(3;9)", "=SI.ERROR(1/0)"]])[0].join("|"), "0|7|3|#ERROR");
  assert.equal(show([["=MIN(B1:B2)"]])[0][0], "0");
  // Errores que se propagan, ciclos y fuera de rango
  assert.equal(show([["=1/0", "=A1+1", "=SUMA(A1:B1)"]])[0][2], "#DIV/0!");
  assert.deepEqual(show([["=B1", "=A1"]])[0], ["#CICLO", "#CICLO"]);
  assert.equal(show([["=A1"]])[0][0], "#CICLO");
  assert.equal(show([["=ZZ9999"]])[0][0], "#REF!");
  assert.equal(show([["=A1:B2"]])[0][0], "#VALOR!");
  assert.equal(show([["=" + "1+".repeat(150) + "1"]])[0][0], "#ERROR", "fórmula demasiado larga");
  // Cadena larga de dependencias no revienta la pila
  const chain = Array.from({ length: 200 }, (_, i) => [i ? "=A" + i + "+1" : "1"]);
  assert.equal(show(chain)[199][0], "200");
  // Fórmula nunca ejecuta código
  assert.equal(one("=alert(1)"), "#NOMBRE?");
  assert.equal(one("=constructor"), "#NOMBRE?");
  // Plantillas: todas calculan sin errores y se pueden exportar
  for (const t of C.SHEET_TEMPLATES) {
    const rows = C.templateRows(t.id);
    assert.ok(rows.length >= 20 && rows[0].length >= 8, t.id);
    const bad = show(rows).flat().filter((v) => v.startsWith("#"));
    assert.deepEqual(bad, [], t.id + " sin errores");
    X.buildXlsx([{ name: t.label, rows }]);
  }
  const pres = C.templateRows("presupuesto");
  pres[1][1] = "2"; pres[1][2] = "100";
  const sp = show(pres);
  assert.equal(sp[1][3], "200");
  assert.equal(sp[16][3], "200");
  assert.equal(sp[17][3], "32");
  assert.equal(sp[18][3], "232");
  // normalize
  assert.equal(C.normalize([], 3, 4).length, 3);
  assert.equal(C.normalize([["a"]], 1, 1)[0][0], "a");
  assert.equal(C.normalize(Array.from({ length: 500 }, () => ["x"])).length, C.MAX_GRID_ROWS);
  assert.equal(C.normalize([["x".repeat(5000)]])[0][0].length, C.MAX_CELL_TEXT);
  // XLSX: estructura, fórmulas en inglés con resultado, texto escapado, nombres
  const rows = [["Nombre", "Monto", "Nota"], ["Ana & <Luis> \"q\"", "1,250.50", "=B2*2"], ["", "=SUMA(B2:B2)", "=1/0"], ["a", "b", "=A2"]];
  const zip = unzipSync(X.buildXlsx([{ name: "Gastos: 2026/10?", rows }, { name: "gastos 2026 10", rows: [["x"]] }]));
  const names = Object.keys(zip).sort();
  assert.deepEqual(names, ["[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"]);
  const wb = strFromU8(zip["xl/workbook.xml"]);
  assert.ok(wb.includes('name="Gastos 2026 10"') && wb.includes('name="gastos 2026 10 2"'), "nombres limpios y únicos: " + wb);
  const sh = strFromU8(zip["xl/worksheets/sheet1.xml"]);
  assert.ok(sh.includes("Ana &amp; &lt;Luis&gt; &quot;q&quot;"));
  assert.ok(sh.includes('<c r="B2"><v>1250.5</v></c>'));
  assert.ok(sh.includes('<c r="C2"><f>B2*2</f><v>2501</v></c>'));
  assert.ok(sh.includes('<f>SUM(B2:B2)</f><v>1250.5</v>'));
  assert.ok(sh.includes('t="e"><f>1/0</f><v>#DIV/0!</v>'));
  assert.ok(sh.includes('t="str"><f>A2</f>'));
  assert.ok(sh.includes('<c r="A1" s="1"'), "encabezado en negritas");
  assert.ok(!strFromU8(unzipSync(X.buildXlsx([{ name: "a", rows: [["x"]] }], false))["xl/worksheets/sheet1.xml"]).includes('s="1"'));
  assert.throws(() => X.buildXlsx([]), /entre 1 y 20/);
  assert.throws(() => X.buildXlsx([{ name: "a", rows: Array.from({ length: 201 }, () => ["x"]) }]), /demasiado grande/);
  assert.equal(X.sheetName("  [x]  "), "x");
  assert.equal(X.sheetName("'''"), "Hoja");
  assert.equal(X.sheetName("A".repeat(50)).length, 31);
  // SI, comparaciones y textos entre comillas
  assert.equal(one('=SI(1<2;"sí";"no")'), "sí");
  assert.equal(one('=SI(2<=1;"sí";"no")'), "no");
  assert.equal(one("=SI(3<>3;1;2)"), "2");
  assert.equal(one("=SI(A1=5;10;20)", ["5"]), "10");
  assert.equal(one('=SI(A1="";"vacío";A1*2)', [""]), "vacío");
  assert.equal(one('=SI(A1="";"vacío";A1*2)', ["4"]), "8");
  assert.equal(one('=SI("Ana"="ANA";1;0)'), "1", "texto sin distinguir mayúsculas");
  assert.equal(one('=SI(1>0;"a;b";"c")'), "a;b", "el ; dentro de comillas es texto");
  assert.equal(one('=SI("x"+1>0;1;2)').startsWith("#"), true);
  assert.equal(one("=IF(1=1;7;8)"), "7");
  assert.equal(one("=SI(1>0;5)"), "5");
  assert.equal(one("=SI(1/0>0;1;2)").startsWith("#"), true);
  assert.equal(C.toEnglishFormula('=SI(a1="";"x;y";SUMA(b1:b3))'), 'IF(A1="","x;y",SUM(B1:B3))');
  // Plantillas: las filas vacías quedan en blanco y las llenas se calculan
  {
    const inv = C.templateRows("inventario");
    assert.equal(show(inv)[1][3], "", "inventario vacío no muestra 0");
    inv[1][1] = "3"; inv[1][2] = "10";
    assert.equal(show(inv)[1][3], "30");
    assert.equal(show(inv)[inv.length - 1][3], "30", "el total suma lo que hay");
    const emptyTotal = show(C.templateRows("inventario")).at(-1)[3];
    assert.equal(emptyTotal, "0", "el total sí vale 0 sin datos");
    const asi = C.templateRows("asistencia");
    assert.deepEqual(show(asi)[1].slice(7), ["", ""]);
    asi[1][1] = "Ana"; asi[1][2] = "1"; asi[1][3] = "1"; asi[1][4] = "1"; asi[1][5] = "1";
    assert.deepEqual(show(asi)[1].slice(7), ["4", "80"]);
    const cal = C.templateRows("calificaciones");
    assert.equal(show(cal)[1][4], "");
    cal[1][1] = "8"; cal[1][2] = "10";
    assert.equal(show(cal)[1][4], "9");
    const pre = show(C.templateRows("presupuesto"));
    assert.equal(pre[1][3], "");
    for (const t of C.SHEET_TEMPLATES) {
      const z = unzipSync(X.buildXlsx([{ name: "p", rows: C.templateRows(t.id) }]));
      const xml = strFromU8(z["xl/worksheets/sheet1.xml"]);
      if (C.templateRows(t.id).some((r) => r.some((c) => c.startsWith("=SI(")))) assert.ok(xml.includes("<f>IF("), "el archivo Excel conserva SI como IF: " + t.id);
    }
  }
  console.log("CALCULO_OK: fórmulas, errores, ciclos, plantillas y archivo Excel.");
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
