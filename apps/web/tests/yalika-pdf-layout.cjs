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
const doc = require("../src/lib/yalika-document.ts");
const imp = require("../src/lib/yalika-import.ts");
const lay = require("../src/lib/yalika-pdf-layout.ts");
const loader = async (data) => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjs.getDocument({ data, useWorkerFetch: false, isEvalSupported: false, verbosity: 0 }).promise;
};
const P = (t, o = {}) => ({ ...doc.paragraph(t), ...o });
// Un pedazo de texto: x, y (desde abajo), ancho aproximado (5.5 pt por letra a 11 pt).
const it = (str, x, y, o = {}) => ({ str, x, y, w: o.w ?? str.length * 5.5, size: o.size ?? 11, font: o.font ?? "f", angle: 0 });
const page = (items, fonts = { f: { bold: false, italic: false, family: "Arial" }, b: { bold: true, italic: false, family: "Arial" } }) => ({ width: 612, height: 792, items, fonts });
const text = (r) => r.paragraphs.map((p) => p.text);
(async () => {
  // 1. Fuera de orden: se lee por posición, no por el orden interno del PDF (el problema de la captura).
  const scrambled = page([
    it("ATENTAMENTE", 250, 300),
    it("FERMÍN BERNABÉ BAHENA", 230, 200, { font: "b" }),
    it("Carta compromiso de cumplimiento", 150, 700, { font: "b", size: 14, w: 300 }),
    it("Morelia, Michoacán, a 17 de octubre de 2026.", 300, 740, { w: 240 }),
    it("COMISIÓN NACIONAL DE ELECCIONES DE MORENA", 90, 650, { font: "b" }),
    it("P R E S E N T E", 90, 630, { w: 90 }),
    it("El que suscribe manifiesta bajo protesta de decir verdad que conoce y acepta los principios", 90, 596, { w: 450 }),
    it("del partido y se compromete a cumplirlos durante todo el proceso interno.", 90, 582, { w: 300 }),
  ]);
  const r1 = lay.layoutPages([scrambled]);
  assert.deepEqual(text(r1).filter(Boolean), [
    "Morelia, Michoacán, a 17 de octubre de 2026.",
    "Carta compromiso de cumplimiento",
    "COMISIÓN NACIONAL DE ELECCIONES DE MORENA",
    "PRESENTE", // letras separadas → palabra
    "El que suscribe manifiesta bajo protesta de decir verdad que conoce y acepta los principios del partido y se compromete a cumplirlos durante todo el proceso interno.",
    "ATENTAMENTE",
    "FERMÍN BERNABÉ BAHENA",
  ]);
  const by = (r, t) => r.paragraphs.find((p) => p.text.startsWith(t));
  assert.equal(by(r1, "Morelia").align, "right");
  assert.equal(by(r1, "Carta").align, "center");
  assert.equal(by(r1, "Carta").bold, true);
  assert.equal(by(r1, "Carta").size, 14);
  // El espacio en blanco antes de la firma se conserva con párrafos vacíos.
  const at = text(r1).indexOf("ATENTAMENTE");
  const sign = text(r1).indexOf("FERMÍN BERNABÉ BAHENA");
  assert.ok(sign - at >= 3 && text(r1).slice(at + 1, sign).every((t) => t === ""), "el espacio de la firma se conserva");

  // 2. Tablas por columnas, y número de página + encabezado repetido fuera del texto.
  const body = (n) => [
    it("Informe", 90, 760, { w: 40 }),
    it("Producto", 90, 600, { w: 50 }), it("Cantidad", 250, 600, { w: 50 }), it("Precio", 420, 600, { w: 40 }),
    it("Tornillo", 90, 580, { w: 40 }), it("12", 250, 580, { w: 12 }), it("$5.00", 420, 580, { w: 30 }),
    it("Tuerca", 90, 560, { w: 35 }), it("8", 250, 560, { w: 6 }), it("$3.50", 420, 560, { w: 30 }),
    it(String(n), 300, 30, { w: 6, size: 9 }),
  ];
  const r2 = lay.layoutPages([page(body(1)), page(body(2))]);
  assert.equal(r2.pageNumbers, true);
  assert.equal(r2.paragraphs.filter((p) => p.table).length, 2);
  assert.deepEqual(r2.paragraphs.find((p) => p.table).table, [["Producto", "Cantidad", "Precio"], ["Tornillo", "12", "$5.00"], ["Tuerca", "8", "$3.50"]]);
  assert.equal(text(r2).filter((t) => t === "Informe").length, 1, "el encabezado repetido solo queda una vez");
  assert.ok(!text(r2).some((t) => t === "1" || t === "2"), "los números de página no son texto");

  // 3. Párrafo que sigue en la hoja siguiente no se parte; una hoja que termina antes sí lleva salto de página.
  const lines = (from, count, y0, words) =>
    Array.from({ length: count }, (_, i) => it(words[i % words.length], 90, y0 - i * 14, { w: 430 }));
  const long = ["texto largo del párrafo uno que llena todo el renglón de la hoja de prueba de nuevo", "otro renglón largo que también llena todo el ancho de la hoja de prueba otra vez"];
  const fullLine = (s, y) => it(s, 90, y, { w: 440 });
  const flow = lay.layoutPages([
    page([fullLine(long[0], 100), fullLine(long[1], 86)]),
    page([fullLine("sigue el mismo párrafo en la hoja siguiente sin punto final", 740), it("y termina aquí.", 90, 726, { w: 80 })]),
  ]);
  assert.equal(flow.paragraphs.length, 1, "un párrafo que cruza de hoja sigue siendo uno");
  assert.ok(!flow.paragraphs[0].pageBreak);
  const shortPage = lay.layoutPages([
    page([fullLine(long[0], 740), fullLine(long[1], 726), it("termina corto.", 90, 712, { w: 70 }), it("Fin de la hoja", 90, 500, { w: 70 })]),
    page([fullLine(long[0], 740), it("segundo texto.", 90, 726, { w: 70 })]),
  ]);
  void lines;
  assert.ok(shortPage.paragraphs.some((p) => p.pageBreak), "una hoja que termina con mucho espacio libre conserva su salto de página");

  // 4. Texto girado (marca de agua) se omite y se avisa.
  const water = lay.layoutPages([page([it("Hola", 90, 700, { w: 22 }), { ...it("BORRADOR", 200, 300, { size: 60, w: 300 }), angle: 0.78 }])]);
  assert.deepEqual(text(water), ["Hola"]);
  assert.equal(water.skipped, 1);

  // 5. Ida y vuelta real: exportPdf (letra, justificado, sangría, salto de página, número de página) → importPdf.
  const long2 = "Este es un párrafo largo que debe ocupar varios renglones en la hoja para comprobar que al volver del PDF se junta de nuevo en un solo párrafo y no se parte en pedazos sueltos. ";
  const src = doc.parseDocument({
    version: 1, title: "Prueba", pageNumbers: true,
    paragraphs: [
      P("INFORME MENSUAL", { align: "center", bold: true, size: 18 }),
      P("Morelia, 20 de octubre de 2026", { align: "right" }),
      P(long2.repeat(3), { align: "justify" }),
      P(long2.repeat(2)),
      P("Texto sangrado a un centímetro y medio, que también es largo para ocupar más de un renglón completo en la hoja del PDF generado.", { indent: 3 }),
      P("Línea uno\nLínea dos\nLínea tres"),
      P("ATENTAMENTE", { align: "center", bold: true }),
      P("Segunda hoja", { pageBreak: true, align: "center", bold: true, size: 16 }),
      P(long2.repeat(2), { align: "justify" }),
    ],
  });
  const pdf = new Uint8Array(await (await doc.exportPdf(src)).arrayBuffer());
  const back = await imp.importPdf("Prueba.pdf", pdf, loader);
  const ps = back.doc.paragraphs;
  assert.equal(back.doc.pageNumbers, true);
  assert.deepEqual(ps.map((p) => p.align), ["center", "right", "justify", "left", "left", "left", "center", "center", "justify"]);
  assert.equal(ps[0].size, 18);
  assert.equal(ps[0].bold, true);
  assert.equal(ps[2].text.length, long2.repeat(3).trim().length, "el párrafo largo vuelve completo y en un solo bloque");
  assert.equal(ps[4].indent, 3);
  assert.equal(ps[5].text, "Línea uno\nLínea dos\nLínea tres");
  assert.equal(ps[7].pageBreak, true);
  assert.ok(ps.slice(0, 7).every((p) => !p.pageBreak));
  assert.match(back.warning, /aproximado/);

  // 6. Word: justificado, sangría y salto de página sobreviven a exportar e importar.
  const word = new Uint8Array(await (await doc.exportWord(src)).arrayBuffer());
  const inW = imp.importDocx("p.docx", word).doc.paragraphs;
  assert.equal(inW[2].align, "justify");
  assert.equal(inW[4].indent, 3);
  assert.equal(inW[7].pageBreak, true);
  assert.equal(inW[5].text, "Línea uno\nLínea dos\nLínea tres");
  const xml = Buffer.from(require("fflate").unzipSync(word)["word/document.xml"]).toString("utf8");
  assert.match(xml, /<w:jc w:val="both"\/>/);
  assert.match(xml, /<w:pageBreakBefore\/>/);
  assert.match(xml, /<w:ind w:left="851"/);

  // 7. Validación del modelo.
  for (const bad of [{ indent: -1 }, { indent: 1.5 }, { indent: 99 }, { pageBreak: "si" }, { align: "full" }])
    assert.throws(() => doc.parseDocument({ version: 1, title: "x", paragraphs: [P("a", bad)] }), /no válido/);
  assert.equal(doc.parseDocument({ version: 1, title: "x", paragraphs: [P("a", { indent: 0, pageBreak: false })] }).paragraphs[0].indent, undefined);
  console.log("PDF_LAYOUT_OK: orden por posición, alineación, tablas, encabezados, saltos de página, ida y vuelta PDF/Word y validación.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
