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
const { jsPDF } = require("jspdf");
const { PDFDocument } = require("pdf-lib");
const M = require("../src/lib/yalika-merge.ts");
const pdf = (pages) => {
  const d = new jsPDF();
  for (let i = 1; i < pages; i++) d.addPage();
  return new Uint8Array(d.output("arraybuffer"));
};
// PNG 1x1 y JPG mínimo válidos
const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
(async () => {
  const a = await M.inspect("a.pdf", pdf(3), "1"),
    b = await M.inspect("b.pdf", pdf(2), "2"),
    c = await M.inspect("foto.png", png, "3");
  assert.deepEqual([a.pages, b.pages, c.pages, c.kind], [3, 2, 1, "png"]);
  assert.deepEqual(M.totals([a, b, c]).pages, 6);
  const out = await M.mergePdf([b, c, a], "Unido");
  const doc = await PDFDocument.load(out);
  assert.equal(doc.getPageCount(), 6);
  assert.equal(doc.getTitle(), "Unido");
  const [w, h] = [doc.getPage(2).getWidth(), doc.getPage(2).getHeight()];
  assert.ok(Math.abs(w - 595.28) < 1 && Math.abs(h - 841.89) < 1, "la imagen va en hoja A4");
  await assert.rejects(() => M.inspect("x.txt", new Uint8Array([104, 105]), "9"), /no es un PDF/);
  await assert.rejects(() => M.inspect("v.pdf", new Uint8Array(0), "9"), /vacío/);
  await assert.rejects(() => M.inspect("roto.pdf", Uint8Array.from(Buffer.from("%PDF-1.4 basura")), "9"), /no se pudo leer/);
  await assert.rejects(() => M.inspect("grande.pdf", new Uint8Array(21 * 1024 * 1024).fill(37), "9"), /20 MB/);
  await assert.rejects(() => M.mergePdf([], "x"), /al menos/);
  await assert.rejects(() => M.mergePdf([{ ...a, pages: 501 }], "x"), /Máximo 500/);
  console.log("UNIR_OK: PDF y fotos en un solo PDF, orden, título, validaciones y límites.");
})().catch((e) => { console.error(e); process.exit(1); });
