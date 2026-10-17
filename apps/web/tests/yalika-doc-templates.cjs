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
const T = require("../src/lib/yalika-doc-templates.ts");
const D = require("../src/lib/yalika-document.ts");
const text = (d) => d.paragraphs.map((p) => p.text).join("\n");
(async () => {
  assert.deepEqual(
    T.DOC_TEMPLATES.map((t) => t.id),
    ["oficio", "acta", "constancia", "carta", "informe"],
  );
  assert.throws(() => T.buildFromTemplate("nada", {}), /no existe/);
  // Todas salen válidas y con campos vacíos dejan líneas para llenar, sin «undefined»
  for (const t of T.DOC_TEMPLATES) {
    const empty = T.buildFromTemplate(t.id, {});
    assert.ok(text(empty).includes("____"), t.id + " deja líneas en blanco");
    assert.ok(!/undefined|null/.test(text(empty)), t.id);
    assert.equal(new Set(t.fields.map((f) => f.id)).size, t.fields.length);
    D.parseDocument(empty);
    const blob = await D.exportPdf(empty);
    assert.ok((await blob.arrayBuffer()).byteLength > 1000, t.id + " sale en PDF");
    await D.exportWord(empty);
  }
  // Oficio con datos
  const o = T.buildFromTemplate("oficio", {
    lugar: "Morelia, Mich., 16 de octubre de 2026",
    numero: "045",
    asunto: "Solicitud de mantenimiento",
    para: "Lic. Ana Pérez",
    cargo: "Directora",
    cuerpo: "Primer párrafo.\n\n  Segundo párrafo con ñ.  ",
    de: "Juan López",
    decargo: "Supervisor",
  });
  const s = text(o);
  assert.ok(s.includes("Oficio No. 045") && s.includes("Asunto: Solicitud de mantenimiento"));
  assert.ok(s.includes("Primer párrafo.\nSegundo párrafo con ñ."), "párrafos limpios, sin líneas vacías sobrantes");
  assert.ok(s.includes("Juan López") && s.includes("Supervisor"));
  assert.equal(o.title, "Oficio - Solicitud de mantenimiento");
  assert.ok(o.title.startsWith("Oficio"));
  // Acta: listas con viñeta
  const a = T.buildFromTemplate("acta", { lugar: "Esc. Benito Juárez", revisado: "Aulas\nBaños", pendientes: "Entregar CURP" });
  assert.ok(text(a).includes("• Aulas\n• Baños") && text(a).includes("• Entregar CURP"));
  // Límites y limpieza
  assert.throws(() => T.buildFromTemplate("carta", { cuerpo: "a".repeat(T.MAX_FIELD + 1) }), /demasiado largo/);
  const big = T.buildFromTemplate("carta", { cuerpo: "x".repeat(T.MAX_FIELD) });
  assert.ok(big.paragraphs.length < 1000);
  // Las plantillas no comparten estado entre documentos
  const a1 = T.buildFromTemplate("carta", { de: "Uno" }), a2 = T.buildFromTemplate("carta", { de: "Dos" });
  assert.ok(text(a1).includes("Uno") && !text(a1).includes("Dos") && text(a2).includes("Dos"));
  console.log("PLANTILLAS_OK: cinco plantillas válidas, campos vacíos, listas, límites, Word y PDF.");
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
