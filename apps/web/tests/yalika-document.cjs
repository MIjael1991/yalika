const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  ts = require("typescript"),
  Module = require("node:module");
// Los módulos .ts que importa el documento (por ejemplo el estilo de las tablas) también se compilan al vuelo.
require.extensions[".ts"] = (mod, file) =>
  mod._compile(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText,
    file,
  );
const filename = path.resolve(__dirname, "../src/lib/yalika-document.ts");
const m = new Module(filename, module);
m.filename = filename;
m.paths = module.paths;
m._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText,
  filename,
);
const {
  MAX_CHARS,
  newDocument,
  paragraph,
  parseDocument,
  exportWord,
  exportPdf,
  documentName,
} = m.exports;
(async () => {
  assert.throws(() =>
    parseDocument({
      version: 1,
      title: "x",
      paragraphs: [{ ...paragraph(), size: 999 }],
    }),
  );
  assert.throws(() =>
    parseDocument({
      version: 1,
      title: "x",
      paragraphs: [{ ...paragraph(), text: "a".repeat(MAX_CHARS + 1) }],
    }),
  );
  assert.throws(() =>
    parseDocument({
      version: 1,
      title: "x",
      paragraphs: [{ ...paragraph(), align: "evil" }],
    }),
  );
  const d = {
    ...newDocument(),
    title: "Solicitud",
    paragraphs: [
      {
        ...paragraph("Mantenimiento de la escuela: información y revisión."),
        bold: true,
        align: "center",
      },
      paragraph("Firma: [NOMBRE]"),
    ],
  };
  assert.deepEqual(parseDocument(JSON.parse(JSON.stringify(d))), d);
  assert.equal(documentName("a/b:c"), "a-b-c");
  const word = Buffer.from(await (await exportWord(d)).arrayBuffer());
  assert.equal(word.subarray(0, 2).toString(), "PK");
  const pdf = Buffer.from(await (await exportPdf(d)).arrayBuffer());
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  const large = {
    ...d,
    paragraphs: [
      paragraph("Contenido de prueba para múltiples páginas. ".repeat(800)),
    ],
  };
  const multi = Buffer.from(
    await (await exportPdf(large)).arrayBuffer(),
  ).toString("latin1");
  assert((multi.match(/\/Type \/Page\b/g) || []).length > 1);
  const typo = await exportPdf({ ...d, paragraphs: [paragraph("Año 2026 — “prueba” ‘uno’ … • fin\u200b")] });
  assert((await typo.arrayBuffer()).byteLength > 500);
  await assert.rejects(
    () => exportPdf({ ...d, paragraphs: [paragraph("文書")] }),
    /latinos/,
  );

  // Bloques nuevos: listas, tablas, imágenes y número de página
  const { unzipSync, strFromU8 } = require("fflate");
  const PIC = { data: "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAYACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwBTHLNAkM8rtavtiRfKChl284x1K5YAYyTjr2bcGJkt5EVtmzh8kYPbaerZyAR8xJPbkldPmk3Ge3fy42AZI/MKeYQSm3JHUnAz+mfuqATZGOZIZY1kAAlc5LBkC/7XTf1yTg9BgURla7S+e39fq9ASktHb8v69PyCYz2lxCrxEtP8AMzzMu3Gfugsx54HBJ6g+9MW6iVEjt7m4QpHsVQT8pydoJwOw2kHjnpnBpIlaazm82L5XLGQIF4PO7hsDOQMAADkcjJp8QCyyNDHuKhUMIjXaFUMF3NzjOOM5PGQRnFFou6ktVv8A1/X3BOzWr29RBYTyySsyMkn3naQKN4yMKQDxnLDGc5HpRTJxIzyzLDIsqqDvchSBnauF6DBBHHXJ4waKl+03jJJehjVhUk7QSdu7/wAv6Q5PtpDQmSO427ZHUnmXOOQ4yvQtjHOPenNdQx4vGaV2ZS6TMCAx+XaQf9knAB78YHAJRWlOCm77enmmzWN/aSV9v+HHxR+Xdz2zlVf5twMuA6kAMc9SDwMjLDBxyoqKaQHzF8kySsOdjtu35GRjrhlxzj+LjoMlFXOKptJdjOi3zcr12FuLu8aO3kgMYk5YM0uxvM6fNn7w4IHXPfriiiirTdPSP5J/metQoxlKcXrZn//Z", w: 40, h: 24, size: "m" };
  const base = { version: 1, title: "Bloques" };
  const plain = parseDocument(newDocument());
  assert.deepEqual(Object.keys(plain).sort(), ["paragraphs", "title", "version"], "un documento viejo no gana campos nuevos");
  assert.deepEqual(Object.keys(plain.paragraphs[0]).sort(), ["align", "bold", "font", "italic", "size", "text", "underline"]);
  const T = (rows) => ({ ...paragraph(), table: rows });
  const ok = (ps, extra = {}) => parseDocument({ ...base, ...extra, paragraphs: ps });
  const bad = (ps, re, extra = {}) => assert.throws(() => ok(ps, extra), re);
  assert.equal(ok([{ ...paragraph("a"), list: "bullet" }]).paragraphs[0].list, "bullet");
  bad([{ ...paragraph("a"), list: "roman" }], /no válido/);
  assert.deepEqual(ok([T([["a", "b"], ["c", "d"]])]).paragraphs[0].table, [["a", "b"], ["c", "d"]]);
  bad([T([["a", "b"], ["c"]])], /tabla/);
  bad([T([])], /tabla/);
  bad([T([[]])], /tabla/);
  bad([T(Array.from({ length: 31 }, () => ["x"]))], /tabla/);
  bad([T([Array(9).fill("x")])], /tabla/);
  bad([T([["x".repeat(501)]])], /tabla/);
  bad([{ ...T([["a"]]), text: "no" }], /tabla/);
  bad([{ ...T([["a"]]), list: "bullet" }], /tabla/);
  bad(Array.from({ length: 21 }, () => T([["a"]])), /20 tablas/);
  assert.equal(ok([{ ...paragraph(), image: PIC }]).paragraphs[0].image.size, "m");
  bad([{ ...paragraph(), image: { ...PIC, data: "<script>" } }], /imagen/);
  bad([{ ...paragraph(), image: { ...PIC, size: "xl" } }], /imagen/);
  bad([{ ...paragraph(), image: { ...PIC, w: 0 } }], /imagen/);
  bad([{ ...paragraph(), image: { ...PIC, w: 4001 } }], /imagen/);
  bad([{ ...paragraph(), image: { ...PIC, data: "A".repeat(450001) } }], /imagen/);
  bad([{ ...paragraph("t"), image: PIC }], /imagen/);
  bad(Array.from({ length: 9 }, () => ({ ...paragraph(), image: PIC })), /8 imágenes/);
  assert.equal(ok([paragraph()], { pageNumbers: true }).pageNumbers, true);
  assert.ok(!("pageNumbers" in ok([paragraph()], { pageNumbers: false })));
  bad([paragraph()], /no válido/, { pageNumbers: "si" });
  const rich = ok(
    [
      paragraph("Título"),
      { ...paragraph("uno"), list: "bullet" },
      { ...paragraph("dos"), list: "bullet" },
      { ...paragraph("primero"), list: "number" },
      { ...paragraph("segundo"), list: "number" },
      paragraph("corte"),
      { ...paragraph("otra vez 1"), list: "number" },
      T([["Nombre", "Edad"], ["Ana", "30"], ["Luis", "41"]]),
      { ...paragraph(), image: PIC, align: "center" },
    ],
    { pageNumbers: true },
  );
  const docx = unzipSync(new Uint8Array(await (await exportWord(rich)).arrayBuffer()));
  const xml = strFromU8(docx["word/document.xml"]);
  assert.equal((xml.match(/<w:tbl>/g) || []).length, 1, "tabla");
  assert.equal((xml.match(/<w:tr>|<w:tr /g) || []).length, 3, "tres filas");
  assert.ok(xml.includes("<w:tblHeader"), "fila de encabezado");
  assert.ok(xml.includes("<w:drawing>") && Object.keys(docx).some((k) => k.startsWith("word/media/")), "imagen incrustada");
  assert.ok((xml.match(/<w:numPr>/g) || []).length >= 5, "listas con viñeta y numeración");
  const nums = [...xml.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((m) => m[1]);
  assert.ok(new Set(nums).size >= 3, "cada lista numerada reinicia en 1: " + nums);
  const footerKey = Object.keys(docx).find((k) => /footer\d*\.xml$/.test(k));
  assert.ok(footerKey && strFromU8(docx[footerKey]).includes("PAGE"), "número de página");
  const plainDocx = unzipSync(new Uint8Array(await (await exportWord(ok([paragraph("x")]))).arrayBuffer()));
  assert.ok(!Object.keys(plainDocx).some((k) => /footer/.test(k)), "sin número de página no hay pie");
  const pdfBuf = Buffer.from(await (await exportPdf(rich)).arrayBuffer());
  assert.equal(pdfBuf.subarray(0, 4).toString(), "%PDF");
  assert.ok(pdfBuf.length > 1500);
  const long = ok([
    T(Array.from({ length: 30 }, (_, r) => ["fila " + r + " " + "texto largo ".repeat(12), "x"])),
    ...Array.from({ length: 6 }, () => ({ ...paragraph(), image: { ...PIC, size: "l" } })),
  ]);
  const longPdf = Buffer.from(await (await exportPdf(long)).arrayBuffer()).toString("latin1");
  assert.ok((longPdf.match(/\/Type \/Page\b/g) || []).length >= 2, "varias páginas");
  await assert.rejects(() => exportPdf(ok([T([["文書"]])])), /latinos/);
  const typoTable = await exportPdf(ok([T([["Año — “x” •"]])]));
  assert.ok((await typoTable.arrayBuffer()).byteLength > 500);

  console.log(
    "DOCUMENTOS_OK: validación, round-trip editable, nombres, Word, PDF, paginación y rechazo de glifos no soportados.",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
