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
const { zipSync, unzipSync, strToU8 } = require("fflate");
const C = require("../src/lib/yalika-convert.ts");
const imp = require("../src/lib/yalika-import.ts");
const doc = require("../src/lib/yalika-document.ts");
const src = (name, data, type = "") => {
  const buf = Buffer.from(data);
  return { name, type, size: buf.length, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length), text: async () => buf.toString("utf8") };
};
const bytes = async (blob) => new Uint8Array(await blob.arrayBuffer());
const txt = async (blob) => Buffer.from(await blob.arrayBuffer()).toString("utf8");
(async () => {
  // Qué tipo es y a qué se puede pasar
  const k = (n, t = "") => C.classify({ name: n, type: t }).kind;
  assert.deepEqual(["a.PDF", "a.docx", "a.xlsx", "a.csv", "a.pptx", "a.txt", "a.jpg", "foto", "a.heic"].map((n) => k(n, n === "foto" ? "image/png" : "")), ["pdf", "word", "excel", "csv", "powerpoint", "texto", "imagen", "imagen", "imagen"]);
  assert.match(C.classify({ name: "viejo.doc", type: "" }).problem, /Word \(\.docx\)/);
  assert.match(C.classify({ name: "viejo.xls", type: "" }).problem, /\.xlsx/);
  assert.match(C.classify({ name: "x.zip", type: "" }).problem, /todavía no/);
  assert.deepEqual(C.targetsFor("pdf").map((t) => t.id), ["word", "texto", "jpg", "png"]);
  assert.ok(C.targetsFor("imagen").some((t) => t.id === "word") && C.targetsFor("word").every((t) => t.id !== "word"));
  for (const kind of Object.keys(C.KIND_LABEL)) assert.ok(C.targetsFor(kind).length > 0, kind);

  // Texto → Word / PDF
  const w = await C.convert([src("Carta final.txt", "Hola\n\nMundo con ñ")], "word");
  assert.equal(w.name, "Carta final.docx");
  assert.deepEqual(imp.importDocx("x.docx", await bytes(w.blob)).doc.paragraphs.map((p) => p.text), ["Hola", "", "Mundo con ñ"]);
  const p = await C.convert([src("Carta.md", "Hola")], "pdf");
  assert.equal(p.name, "Carta.pdf");
  assert.ok(Buffer.from(await bytes(p.blob)).toString("latin1").startsWith("%PDF"));

  // Word → texto y PDF
  const d = doc.parseDocument({ version: 1, title: "Informe", paragraphs: [{ text: "Primera", font: "Arial", size: 12, bold: true, italic: false, underline: false, align: "left" }, { text: "Segunda", font: "Arial", size: 12, bold: false, italic: false, underline: false, align: "left" }] });
  const docx = Buffer.from(await bytes(await doc.exportWord(d)));
  const t = await C.convert([src("Informe.docx", docx)], "texto");
  assert.equal(t.name, "Informe.txt");
  assert.equal((await txt(t.blob)).replace(/^﻿/, ""), "Primera\n\nSegunda");
  assert.match(t.detail, /2 párrafos/);
  assert.ok(Buffer.from(await bytes((await C.convert([src("Informe.docx", docx)], "pdf")).blob)).toString("latin1").startsWith("%PDF"));

  // PowerPoint → texto / Word / PDF
  const slide = (n, lines) => `<p:sld><p:cSld><p:spTree>${lines.map((l) => `<a:p><a:r><a:t>${l}</a:t></a:r></a:p>`).join("")}</p:spTree></p:cSld></p:sld>`;
  const pptx = Buffer.from(zipSync({ "ppt/slides/slide2.xml": strToU8(slide(2, ["Segunda &amp; fin"])), "ppt/slides/slide1.xml": strToU8(slide(1, ["Título", "Punto <uno>".replace("<", "&lt;").replace(">", "&gt;")])), "ppt/slides/slide10.xml": strToU8(slide(10, [])), "ppt/theme/theme1.xml": strToU8("<x/>") }));
  const pt = await C.convert([src("Clase.pptx", pptx)], "texto");
  assert.equal((await txt(pt.blob)).replace(/^﻿/, ""), "Diapositiva 1\n\nTítulo\n\nPunto <uno>\n\nDiapositiva 2\n\nSegunda & fin");
  assert.match(pt.warning, /solo el texto/);
  assert.equal((await C.convert([src("Clase.pptx", pptx)], "word")).name, "Clase.docx");
  assert.ok(Buffer.from(await bytes((await C.convert([src("Clase.pptx", pptx)], "pdf")).blob)).toString("latin1").startsWith("%PDF"));
  await assert.rejects(() => C.convert([src("mal.pptx", "no es zip")], "pdf"), /PowerPoint/);

  // Excel / CSV
  const book = (sheets) => Buffer.from(zipSync({
    "xl/workbook.xml": strToU8("<workbook><sheets>" + sheets.map((s, i) => `<sheet name="${s}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") + "</sheets></workbook>"),
    "xl/_rels/workbook.xml.rels": strToU8("<Relationships>" + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="x" Target="worksheets/sheet${i + 1}.xml"/>`).join("") + "</Relationships>"),
    ...Object.fromEntries(sheets.map((_, i) => [`xl/worksheets/sheet${i + 1}.xml`, strToU8(`<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Hoja ${i + 1}</t></is></c><c r="B1"><v>${i + 7}</v></c></row></sheetData></worksheet>`)])),
  }));
  const one = await C.convert([src("Ventas.xlsx", book(["Datos"]))], "csv");
  assert.equal(one.name, "Ventas.csv");
  assert.equal((await txt(one.blob)).replace(/^﻿/, ""), "Hoja 1,7");
  const many = await C.convert([src("Ventas.xlsx", book(["Enero", "a/b"]))], "csv");
  assert.equal(many.name, "Ventas-hojas.zip");
  assert.deepEqual(Object.keys(unzipSync(await bytes(many.blob))).sort(), ["01-Enero.csv", "02-a-b.csv"]);
  assert.ok(Buffer.from(await bytes((await C.convert([src("Ventas.xlsx", book(["A"]))], "pdf")).blob)).toString("latin1").startsWith("%PDF"));
  const cp = await C.convert([src("lista.csv", "nombre;edad\nAna;30")], "pdf");
  assert.equal(cp.name, "lista.pdf");
  assert.match(cp.detail, /1 hoja/);

  // Errores claros
  await assert.rejects(() => C.convert([], "pdf"), /Elige un archivo/);
  await assert.rejects(() => C.convert([src("a.txt", "x")], "csv"), /no está disponible/);
  await assert.rejects(() => C.convert([src("a.txt", "x"), src("b.pdf", "x")], "pdf"), /mismo tipo/);
  await assert.rejects(() => C.convert([src("a.txt", "x"), src("b.txt", "x")], "pdf"), /Unir PDF/);
  await assert.rejects(() => C.convert([src("a.doc", "x")], "pdf"), /formato antiguo/);
  await assert.rejects(() => C.convert([src("a.txt", "")], "pdf"), /vacío/);
  await assert.rejects(() => C.convert([{ ...src("a.txt", "x"), size: 21 * 1024 * 1024 }], "pdf"), /20 MB/);
  assert.ok(imp.isScannedPdf(Error("Este PDF no tiene texto seleccionable (parece un escaneo). algo")) && !imp.isScannedPdf(Error("otro")));
  console.log("CONVERTIR_OK: tipos y destinos, texto/Word/PDF, PowerPoint, Excel y CSV (una hoja o ZIP) y errores claros.");
})().catch((e) => { console.error(e); process.exit(1); });
