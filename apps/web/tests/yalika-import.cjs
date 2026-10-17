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
const { zipSync, unzipSync } = require("fflate");
const doc = require("../src/lib/yalika-document.ts");
const imp = require("../src/lib/yalika-import.ts");
const scan = require("../src/lib/yalika-scan.ts");
const file = (name, data) => {
  const buf = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
  return { name, size: buf.length, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length), text: async () => buf.toString("utf8") };
};
const loader = async (data) => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return (await pdfjs.getDocument({ data, useWorkerFetch: false, isEvalSupported: false, verbosity: 0 }).promise);
};
(async () => {
  // Texto
  const t = imp.importText("Carta final.txt", "﻿Hola\r\nmundo\r\n\r\n");
  assert.deepEqual(t.doc.paragraphs.map((p) => p.text), ["Hola", "mundo"]);
  assert.equal(t.doc.title, "Carta final");
  assert.throws(() => imp.importText("a.txt", "  \n\n"), /no tiene texto/);
  assert.throws(() => imp.importText("a.txt", ("x".repeat(99) + "\n").repeat(1001)), /1,000 párrafos/);

  // Word: ida y vuelta con nuestro propio exportador
  const src = doc.parseDocument({
    version: 1,
    title: "Informe",
    paragraphs: [
      { ...doc.paragraph("Título & «ñandú» <b>"), font: "Times New Roman", size: 18, bold: true, align: "center" },
      { ...doc.paragraph("Cursiva y subrayado"), italic: true, underline: true, align: "right" },
      { ...doc.paragraph("Línea 1\nLínea 2"), font: "Courier New", size: 10 },
      doc.paragraph("Normal"),
    ],
  });
  const word = new Uint8Array(await (await doc.exportWord(src)).arrayBuffer());
  const back = imp.importDocx("Informe.docx", word);
  assert.equal(back.warning, "");
  assert.equal(back.doc.title, "Informe");
  back.doc.paragraphs.forEach((p, i) => {
    const o = src.paragraphs[i];
    assert.equal(p.text, o.text);
    for (const k of ["font", "size", "bold", "italic", "underline", "align"]) assert.equal(p[k], o[k], k + " en párrafo " + i);
  });
  assert.throws(() => imp.importDocx("x.docx", new Uint8Array([1, 2, 3, 4])), /no es un documento de Word/);
  assert.throws(() => imp.importDocx("x.docx", zipSync({ "a.txt": new Uint8Array([65]) })), /no es un documento de Word/);
  const withTable = zipSync({
    "word/document.xml": new TextEncoder().encode('<w:document><w:body><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Celda</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>'),
  });
  const tb = imp.importDocx("t.docx", withTable);
  assert.deepEqual(tb.doc.paragraphs.map((p) => p.table), [[["Celda"]]]);
  assert.equal(tb.warning, "");
  // Ida y vuelta: lo que el editor crea (viñetas, números, tabla) se recupera al abrir el Word
  const rich = doc.parseDocument({
    version: 1,
    title: "R",
    paragraphs: [
      doc.paragraph("Antes"),
      { ...doc.paragraph("uno"), list: "bullet" },
      { ...doc.paragraph("dos"), list: "bullet" },
      { ...doc.paragraph("primero"), list: "number" },
      { ...doc.paragraph(""), table: [["Nombre", "Edad"], ["Ana", "7"], ["Luis", ""]] },
      doc.paragraph("Después"),
    ],
  });
  const richBack = imp.importDocx("R.docx", new Uint8Array(await (await doc.exportWord(rich)).arrayBuffer()));
  assert.equal(richBack.warning, "");
  assert.deepEqual(
    richBack.doc.paragraphs.map((p) => [p.text, p.list ?? null, p.table ?? null]),
    rich.paragraphs.map((p) => [p.text, p.list ?? null, p.table ?? null]),
  );
  // Tabla de Word con celdas combinadas, varias líneas por celda y texto antes y después
  const wide = zipSync({
    "word/document.xml": new TextEncoder().encode(
      "<w:document><w:body><w:p><w:r><w:t>Arriba</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:tcPr><w:gridSpan w:val=\"2\"/></w:tcPr><w:p><w:r><w:t>Título</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>C &amp; D</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:t>Abajo</w:t></w:r></w:p><w:p><w:r><w:drawing></w:drawing></w:r></w:p></w:body></w:document>",
    ),
  });
  const wb = imp.importDocx("w.docx", wide);
  assert.deepEqual(wb.doc.paragraphs.map((p) => p.table ?? p.text), ["Arriba", [["Título", ""], ["A B", "C & D"]], "Abajo"]);
  assert.match(wb.warning, /imágenes/);
  // Imágenes de un Word: se colocan después de su párrafo, en orden, y lo no compatible se avisa
  const pics = zipSync({
    "word/document.xml": new TextEncoder().encode(
      '<w:document><w:body><w:p><w:r><w:t>Foto 1</w:t></w:r><w:r><w:drawing><a:blip r:embed="rId5"/></w:drawing></w:r></w:p><w:p><w:r><w:t>Sin foto</w:t></w:r></w:p><w:p><w:r><w:drawing><a:blip r:embed="rId6"/></w:drawing></w:r></w:p><w:p><w:r><w:drawing><a:blip r:embed="rId7"/></w:drawing></w:r></w:p></w:body></w:document>',
    ),
    "word/_rels/document.xml.rels": new TextEncoder().encode(
      '<Relationships><Relationship Id="rId5" Type="x/image" Target="media/a.png"/><Relationship Id="rId6" Type="x/image" Target="/word/media/b.jpg"/><Relationship Id="rId7" Type="x/image" Target="media/c.emf"/></Relationships>',
    ),
    "word/media/a.png": new Uint8Array([1]),
    "word/media/b.jpg": new Uint8Array([2]),
    "word/media/c.emf": new Uint8Array([3]),
  });
  const seen = [];
  const withPics = await imp.importDocxWithImages("p.docx", pics, async (bytes, name) => {
    seen.push(name);
    return bytes[0] === 2 ? null : { data: "QUJD", w: 10, h: 20 };
  });
  assert.deepEqual(seen, ["a.png", "b.jpg"]);
  assert.deepEqual(
    withPics.doc.paragraphs.map((p) => (p.image ? "[imagen " + p.image.size + "]" : p.text)),
    ["Foto 1", "[imagen m]", "Sin foto"],
  );
  assert.match(withPics.warning, /Se conservaron 1 de 3 imágenes/);
  const viaFile = await imp.importDocument({ name: "p.docx", size: pics.length, arrayBuffer: async () => pics.buffer.slice(pics.byteOffset, pics.byteOffset + pics.byteLength), text: async () => "" }, undefined, async () => ({ data: "QUJD", w: 1, h: 1 }));
  assert.equal(viaFile.doc.paragraphs.filter((p) => p.image).length, 2);
  assert.equal(viaFile.warning, "Se conservaron 2 de 3 imágenes; las demás no son compatibles, están dentro de tablas o superan el límite de 8.");

  // PDF con texto
  const pdfBytes = new Uint8Array(
    await (await doc.exportPdf(doc.parseDocument({ version: 1, title: "P", paragraphs: [doc.paragraph("Hola mundo desde el PDF"), doc.paragraph("Segundo párrafo con acentos: ñandú.")] }))).arrayBuffer(),
  );
  const fromPdf = await imp.importPdf("P.pdf", pdfBytes, loader);
  const joined = fromPdf.doc.paragraphs.map((p) => p.text).join("|");
  assert.match(joined, /Hola mundo desde el PDF/);
  assert.match(joined, /ñandú/);
  assert.match(fromPdf.warning, /aproximados/);
  // PDF sin texto (solo imagen)
  const JPEG = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAA8ACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD0WiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP//Z", "base64");
  const scanned = new Uint8Array(await (await scan.scanPdf([{ jpeg: new Uint8Array(JPEG), width: 40, height: 60 }], "a4", "s")).arrayBuffer());
  await assert.rejects(() => imp.importPdf("s.pdf", scanned, loader), /parece un escaneo/);
  await assert.rejects(() => imp.importPdf("big.pdf", new Uint8Array(21 * 1024 * 1024), loader), /20 MB/);

  // Enrutador por extensión
  assert.equal((await imp.importDocument(file("a.TXT", "Hola"), loader)).doc.paragraphs[0].text, "Hola");
  assert.equal((await imp.importDocument(file("x.yalika.json", JSON.stringify(src)), loader)).doc.title, "Informe");
  assert.equal((await imp.importDocument(file("i.docx", word), loader)).doc.paragraphs.length, 4);
  await assert.rejects(() => imp.importDocument(file("a.exe", "MZ"), loader), /Formato no compatible/);
  await assert.rejects(() => imp.importDocument({ ...file("a.json", "{}"), size: 3 * 1024 * 1024 }, loader), /2 MB/);
  await assert.rejects(() => imp.importDocument(file("a.json", "{"), loader));

  // OCR: une líneas, respeta párrafos, quita guiones de fin de línea
  const o = imp.importOcr("Escaneo", ["Primera línea del párrafo\ncontinúa aquí con pala-\nbra partida.\n\nSegundo párrafo.\n\n\n", "Página dos\n\u0007 texto"], 86.4);
  assert.deepEqual(o.doc.paragraphs.map((p) => p.text), ["Primera línea del párrafo continúa aquí con palabra partida.", "Segundo párrafo.", "Página dos texto"]);
  assert.match(o.warning, /86%/);
  assert.throws(() => imp.importOcr("x", ["  \n \n", ""], 90), /No se reconoció texto/);
  assert.match(imp.importOcr("x", ["a"], 250).warning, /100%/);

  // ZIP de imágenes
  const zip = require("../src/lib/yalika-zip.ts");
  const z = unzipSync(zip.zipImages([{ name: "p-1.jpg", bytes: new Uint8Array([1, 2, 3]) }, { name: "p-2.jpg", bytes: new Uint8Array([4, 5]) }]));
  assert.deepEqual(Object.keys(z), ["p-1.jpg", "p-2.jpg"]);
  assert.deepEqual(Array.from(z["p-2.jpg"]), [4, 5]);
  assert.throws(() => zip.zipImages([]), /No hay archivos/);
  assert.throws(() => zip.zipImages([{ name: "../x.jpg", bytes: new Uint8Array([1]) }]), /no válido/);
  assert.throws(() => zip.zipImages([{ name: "a.jpg", bytes: new Uint8Array([1]) }, { name: "a.jpg", bytes: new Uint8Array([1]) }]), /repetido/);
  console.log("IMPORTAR_OK: texto, Word (ida y vuelta con formato), PDF con texto, PDF escaneado rechazado, límites, rutas por extensión y ZIP.");
})().catch((e) => { console.error(e); process.exit(1); });
