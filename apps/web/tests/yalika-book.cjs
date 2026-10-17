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
const B = require("../src/lib/yalika-book.ts");
const X = require("../src/lib/yalika-xlsx.ts");
const S = require("../src/lib/yalika-sheet.ts");
(async () => {
  // Formatos de número
  assert.equal(B.formatNumber(1250.5, "money"), "$1,250.50");
  assert.equal(B.formatNumber(-1250.5, "money"), "-$1,250.50");
  assert.equal(B.formatNumber(-0.001, "money"), "$0.00");
  assert.equal(B.formatNumber(1234567, "int"), "1,234,567");
  assert.equal(B.formatNumber(1250.5, "dec"), "1,250.50");
  assert.equal(B.formatNumber(12.5, "pct"), "12.5%");
  assert.equal(B.formatNumber(12, "pct"), "12.0%");
  assert.equal(B.formatNumber(3, undefined), null);
  assert.equal(B.shownText(5, "=2+3", "money"), "$5.00");
  assert.equal(B.shownText("1,250.5", "1,250.5", "money"), "$1,250.50");
  assert.equal(B.shownText("hola", "hola", "money"), "hola");
  assert.equal(B.shownText({ error: "#DIV/0!" }, "=1/0", "money"), "#DIV/0!");
  assert.equal(B.shownText(0.1 + 0.2, "=0.1+0.2"), "0.3");
  assert.equal(B.shownText(undefined, ""), "");
  // Filas de total
  assert.ok(B.isTotalRow(["Total", "", "5"]));
  assert.ok(B.isTotalRow(["", "Totales", "5"]));
  assert.ok(!B.isTotalRow(["Totalmente", "5"]));
  assert.ok(!B.isTotalRow(["Pan", "Total"]));
  // Aspecto: encabezado, filas alternadas, totales, color propio
  const rows = [["Producto", "Monto"], ["a", "1"], ["b", "2"], ["c", "3"], ["Total", "6"]];
  const kinds = rows.map((r, i) => {
    const l = B.look("yalika", true, i, r, null);
    return l.head ? "head" : l.total ? "total" : l.zebra ? "zebra" : "plain";
  });
  assert.deepEqual(kinds, ["head", "plain", "zebra", "plain", "total"]);
  assert.equal(B.look("yalika", true, 0, rows[0], null).color, "FFFFFF");
  assert.equal(B.look("yalika", true, 0, rows[0], { f: 0 }).color, undefined, "un relleno propio en el encabezado usa letra oscura");
  assert.equal(B.look("yalika", false, 0, rows[0], null).zebra, false);
  assert.equal(B.look("yalika", false, 1, rows[1], null).zebra, true);
  assert.equal(B.look("plano", true, 2, rows[2], null).fill, undefined);
  assert.equal(B.look("plano", true, 0, rows[0], null).bold, true);
  assert.equal(B.look("yalika", true, 2, rows[2], { f: 0, b: true, a: "c", n: "money" }).fill, B.FILLS[0].hex);
  assert.deepEqual(
    [B.look("yalika", true, 2, rows[2], { f: 9 }).fill],
    [B.theme("yalika").zebra],
    "un color que no existe se ignora",
  );
  // Formato por celda
  const g0 = B.emptyFmt(rows);
  const g1 = B.setFmt(g0, [[1, 1], [2, 1]], { b: true, n: "money" });
  assert.deepEqual(g1[1][1], { b: true, n: "money" });
  assert.equal(g0[1][1], null, "no modifica el original");
  const g2 = B.setFmt(g1, [[1, 1]], { b: undefined });
  assert.deepEqual(g2[1][1], { n: "money" });
  assert.equal(B.setFmt(g2, [[1, 1]], { n: undefined })[1][1], null);
  assert.equal(B.setFmt(g1, [[1, 1], [2, 1]], null)[2][1], null);
  assert.deepEqual(B.fitFmt(g1, [["a"], ["b"], ["c"], ["d"], ["e"], ["f"]]).map((r) => r.length), [1, 1, 1, 1, 1, 1]);
  // Excel con estilo: sin cuadrícula, estilos compartidos, formatos y datos para imprimir
  const data = [["Producto", "Cantidad", "Precio", "Total"], ["Lápiz", "10", "5.5", "=B2*C2"], ["Cuaderno", "3", "42", "=B3*C3"], ["Total", "", "", "=SUMA(D2:D3)"]];
  const fmt = B.emptyFmt(data);
  fmt[1][2] = { n: "money" };
  fmt[2][2] = { n: "money" };
  fmt[3][3] = { n: "money", b: true };
  const zip = unzipSync(X.buildXlsx([{ name: "Ventas", rows: data, fmt }, { name: "Otra", rows: [["x"]] }], true, "yalika"));
  const sheet = strFromU8(zip["xl/worksheets/sheet1.xml"]);
  const styles = strFromU8(zip["xl/styles.xml"]);
  const wb = strFromU8(zip["xl/workbook.xml"]);
  assert.ok(sheet.includes('showGridLines="0"'));
  assert.ok(sheet.includes('state="frozen"'));
  assert.ok(sheet.includes('orientation="portrait"'));
  assert.ok(sheet.includes("Página &amp;P de &amp;N"));
  assert.ok(sheet.includes('ht="24"'), "encabezado más alto");
  assert.ok(wb.includes("_xlnm.Print_Titles") && wb.includes("'Ventas'!$1:$1") && wb.includes("'Otra'!$1:$1"));
  assert.ok(styles.includes('numFmtId="164"') && styles.includes("&quot;$&quot;#,##0.00"));
  const xfCount = Number(/<cellXfs count="(\d+)"/.exec(styles)[1]);
  assert.equal((styles.match(/<xf /g) || []).length - 1, xfCount, "conteo de estilos coincide");
  const used = [...sheet.matchAll(/ s="(\d+)"/g)].map((m) => Number(m[1]));
  assert.ok(used.length > 8 && Math.max(...used) < xfCount, "cada celda apunta a un estilo existente");
  assert.ok(new Set(used).size < used.length, "los estilos iguales se reutilizan");
  assert.equal(Number(/<fills count="(\d+)"/.exec(styles)[1]), (styles.match(/<fill>/g) || []).length);
  assert.ok(sheet.includes("<f>B2*C2</f><v>55</v>"), "las fórmulas siguen con resultado");
  // Sin estilo: igual que antes (solo encabezado en negritas)
  const plain = strFromU8(unzipSync(X.buildXlsx([{ name: "a", rows: data }], true, "plano"))["xl/worksheets/sheet1.xml"]);
  assert.ok(!plain.includes("showGridLines"));
  assert.ok(plain.includes('<c r="B2"><v>10</v></c>'));
  // Horizontal si hay muchas columnas
  const wide = strFromU8(unzipSync(X.buildXlsx([{ name: "a", rows: [Array.from({ length: 8 }, (_, i) => "c" + i)] }]))["xl/worksheets/sheet1.xml"]);
  assert.ok(wide.includes('orientation="landscape"'));
  // PDF con estilo: varias páginas, encabezado repetido y pie con página
  const many = [["Producto", "Monto"], ...Array.from({ length: 80 }, (_, i) => ["Artículo " + i, "$" + i + ".00"]), ["Total", "$3,160.00"]];
  const pdf = Buffer.from(await S.sheetPdf([{ name: "Inventario", rows: many }], "Inventario")).toString("latin1");
  assert.ok(pdf.startsWith("%PDF"));
  const pages = (pdf.match(/\/Type\s*\/Page[^s]/g) || []).length;
  assert.ok(pages >= 3, "paginación: " + pages);
  const flat = Buffer.from(await S.sheetPdf([{ name: "A", rows: many.slice(0, 5) }], "t", { theme: "plano", header: false })).toString("latin1");
  assert.equal((flat.match(/\/Type\s*\/Page[^s]/g) || []).length, 1);
  console.log("ESTILO_OK: formatos de número, aspecto, totales, Excel con estilo e impresión, PDF con estilo.");
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
