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
const T = require("../src/lib/yalika-table.ts");
// Genera palabras como las daría el OCR: letra de 10 px de ancho y 20 de alto, un espacio = 10 px.
const CH = 10;
const line = (y, parts, jitter = 0) =>
  parts.flatMap(([x, text]) => {
    let cx = x;
    return text.split(" ").map((w) => {
      const word = { text: w, x0: cx, x1: cx + w.length * CH, y0: y + jitter, y1: y + 20 + jitter };
      cx += (w.length + 1) * CH;
      return word;
    });
  });
(async () => {
  // Tabla de 3 columnas con una celda de dos palabras
  const table = [
    ...line(0, [[0, "Producto"], [200, "Cantidad"], [350, "Precio"]]),
    ...line(30, [[0, "Lápiz azul"], [200, "10"], [350, "5.50"]], 2),
    ...line(60, [[0, "Cuaderno"], [210, "3"], [350, "42.00"]], -1),
    ...line(90, [[0, "Total"], [350, "47.50"]]),
  ];
  assert.deepEqual(T.wordsToRows(table.slice().reverse()), [
    ["Producto", "Cantidad", "Precio"],
    ["Lápiz azul", "10", "5.50"],
    ["Cuaderno", "3", "42.00"],
    ["Total", "", "47.50"],
  ]);
  // Números alineados a la derecha
  const right = [
    ...line(0, [[0, "Concepto"], [300, "Importe"]]),
    ...line(30, [[0, "Renta"], [340, "1200"]]),
    ...line(60, [[0, "Luz"], [360, "80"]]),
    ...line(90, [[0, "Agua"], [350, "150"]]),
  ];
  assert.deepEqual(T.wordsToRows(right).map((r) => r.length), [2, 2, 2, 2]);
  assert.deepEqual(T.wordsToRows(right)[2], ["Luz", "80"]);
  // Texto corrido: una sola columna, una fila por línea
  const prose = [
    ...line(0, [[0, "Estimado señor Pérez le informo que"]]),
    ...line(30, [[0, "la reunión será el lunes por la mañana"]]),
    ...line(60, [[0, "Atentamente"]]),
  ];
  assert.deepEqual(T.wordsToRows(prose), [["Estimado señor Pérez le informo que"], ["la reunión será el lunes por la mañana"], ["Atentamente"]]);
  // Título arriba de una tabla: queda en la primera columna
  const titled = [...line(0, [[100, "Lista de compras"]]), ...line(40, [[0, "Pan"], [250, "20"]]), ...line(70, [[0, "Leche"], [250, "28"]]), ...line(100, [[0, "Huevo"], [250, "55"]])];
  const out = T.wordsToRows(titled);
  assert.equal(out.length, 4);
  assert.equal(out[0].filter(Boolean).length, 1);
  assert.deepEqual(out[1], ["Pan", "20"]);
  // Dos filas solo no bastan para decidir que es tabla con huecos raros; una lista de dos columnas sí
  assert.deepEqual(T.wordsToRows([...line(0, [[0, "a"], [200, "b"]]), ...line(30, [[0, "c"], [200, "d"]])]), [["a", "b"], ["c", "d"]]);
  // Vacío y ruido
  assert.deepEqual(T.wordsToRows([]), []);
  assert.deepEqual(T.wordsToRows([{ text: " ", x0: 0, x1: 10, y0: 0, y1: 10 }, { text: "x", x0: NaN, x1: 10, y0: 0, y1: 10 }]), []);
  // Muchas columnas se limitan
  const wide = Array.from({ length: 3 }, (_, r) => line(r * 30, Array.from({ length: 30 }, (_, c) => [c * 100, "c" + c]))).flat();
  assert.equal(T.wordsToRows(wide)[0].length, T.MAX_TABLE_COLUMNS);
  console.log("TABLA_OK: filas y columnas desde palabras del OCR (tablas, derecha, texto corrido, títulos, límites).");
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
