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
const { unzipSync } = require("fflate");
const R = require("../src/lib/yalika-records.ts");
const Z = require("../src/lib/yalika-zip.ts");
const NOW = "2026-10-16T12:00:00.000Z";
(async () => {
  // Folios
  assert.equal(R.nextFolio("ESC", []), "ESC-000001");
  assert.equal(R.nextFolio("ESC", ["ESC-000001", "ESC-000007", "BEN-000099", "ESC-12"]), "ESC-000008");

  // Crear
  const t = R.templateById("escuela");
  assert.ok(t && R.templateById("nada") === undefined);
  assert.throws(() => R.newExpediente(t, [], " a ", {}, "id1", NOW), /nombre/);
  const e = R.newExpediente(t, ["ESC-000003"], "  Escuela Benito Juárez ", { cct: " 16DPR0001A ", municipio: "Morelia", inventado: "x", director: "" }, "id1", NOW);
  assert.equal(e.folio, "ESC-000004");
  assert.equal(e.name, "Escuela Benito Juárez");
  assert.deepEqual(e.counts, {});
  assert.deepEqual(e.fields, { cct: "16DPR0001A", municipio: "Morelia" });
  t.requirements[0].label = "CAMBIADO";
  assert.notEqual(e.requirements[0].label, "CAMBIADO", "la plantilla copiada no cambia expedientes viejos");
  t.requirements[0].label = "Identificación de la escuela";
  assert.equal(e.templateVersion, 1);
  assert.ok(R.TEMPLATES.every((x) => x.requirements.some((q) => q.required) && new Set(x.requirements.map((q) => q.id)).size === x.requirements.length));

  // Completitud
  let c = R.completeness(e, {});
  assert.equal(c.applicable, 8);
  assert.equal(c.done, 0);
  assert.equal(c.percent, 0);
  c = R.completeness(e, { fachada: 2, acceso: 1, extra: 3, no_existe: 9 });
  assert.equal(c.done, 2, "los opcionales no suman");
  assert.equal(c.percent, 25);
  assert.equal(c.missing.length, 6);
  const na = R.setNotApplicable(e, "contraloria", true, NOW);
  assert.equal(R.completeness(na, { fachada: 1 }).applicable, 7);
  assert.equal(R.completeness(R.setNotApplicable(na, "contraloria", false, NOW), {}).applicable, 8);
  assert.throws(() => R.setNotApplicable(e, "xx", true, NOW), /desconocido/);
  const allNa = { ...e, na: e.requirements.filter((q) => q.required).map((q) => q.id) };
  assert.equal(R.completeness(allNa, {}).percent, null);

  // Visitas y pendientes
  assert.throws(() => R.addVisit(e, { date: "2026-02-30", who: "", notes: "", pending: [] }, "v1", NOW), /fecha/);
  assert.throws(() => R.addVisit(e, { date: "16/10/2026", who: "", notes: "", pending: [] }, "v1", NOW), /fecha/);
  let v = R.addVisit(e, { date: "2026-09-15", who: " Ana ", notes: "Sin acceso al director", pending: ["  Foto del acceso ", "", "Contraloría"] }, "v1", NOW);
  assert.equal(v.visits[0].who, "Ana");
  assert.deepEqual(v.visits[0].pending.map((p) => p.text), ["Foto del acceso", "Contraloría"]);
  assert.equal(e.visits.length, 0, "no modifica el original");
  v = R.addVisit(v, { date: "2026-10-02", who: "Luis", notes: "", pending: ["Aviso"] }, "v2", NOW);
  assert.equal(R.openPending(v).length, 3);
  v = R.togglePending(v, "v1", "v1-0", NOW);
  assert.deepEqual(R.openPending(v).map((x) => x.item.text), ["Contraloría", "Aviso"]);
  v = R.togglePending(v, "v1", "v1-0", NOW);
  assert.equal(R.openPending(v).length, 3);
  assert.throws(() => R.togglePending(v, "v9", "x", NOW), /pendiente/);

  // Archivos
  assert.equal(R.checkRecordFile({ name: "a.jpg", type: "image/jpeg", size: 10 }), "");
  assert.equal(R.checkRecordFile({ name: "a.pdf", type: "", size: 10 }), "");
  assert.match(R.checkRecordFile({ name: "a.exe", type: "application/x-msdownload", size: 10 }), /imágenes o PDF/);
  assert.match(R.checkRecordFile({ name: "a.jpg", type: "image/jpeg", size: 0 }), /vacío/);
  assert.match(R.checkRecordFile({ name: "a.jpg", type: "image/jpeg", size: 21 * 1024 * 1024 }), /20 MB/);

  // Nombres y CSV
  assert.equal(R.safeName("../../etc/pas:wd*"), "etc-pas-wd");
  assert.equal(R.safeName("   "), "archivo");
  assert.equal(R.safeName("Niño ñandú.jpg"), "Niño ñandú.jpg");
  assert.equal(R.csvCell("=HYPERLINK(\"x\")"), "\"'=HYPERLINK(\"\"x\"\")\"");
  assert.equal(R.csvCell("a,b"), "\"a,b\"");
  assert.equal(R.csvCell("normal"), "normal");

  // Ficha
  const lines = R.fichaLines(v, t, { fachada: 1 }).join("\n");
  assert.match(lines, /Expediente ESC-000004/);
  assert.match(lines, /CCT\)?: 16DPR0001A/);
  assert.match(lines, /\[x\] Fachada - 1 archivo/);
  assert.match(lines, /\[ \] Acceso principal - falta/);
  assert.match(lines, /1 de 8 obligatorios con archivo, 13%/);
  assert.match(lines, /no están revisados ni aprobados/);
  const pdf = await R.fichaPdf({ ...v, name: "Escuela 😀 Benito" }, t, { fachada: 1 });
  assert.equal(Buffer.from(pdf.slice(0, 4)).toString(), "%PDF");

  // Paquete
  const mk = (id, req, name, visitId = "") => ({ id, recordId: "id1", requirementId: req, visitId, name, type: "image/jpeg", size: 3, createdAt: NOW, blob: null });
  const files = [
    { file: mk("f1", "fachada", "foto.jpg", "v1"), bytes: new Uint8Array([1, 2, 3]) },
    { file: mk("f2", "fachada", "foto.jpg"), bytes: new Uint8Array([4, 5]) },
    { file: mk("f3", "acceso", "../../x.jpg"), bytes: new Uint8Array([6]) },
  ];
  const entries = R.packageEntries(v, files, pdf);
  const zip = unzipSync(Z.zipTree(entries));
  const names = Object.keys(zip);
  assert.ok(names.includes("ESC-000004 Escuela Benito Juárez/00_FICHA.pdf"));
  assert.ok(names.includes("ESC-000004 Escuela Benito Juárez/DOCUMENTOS/04_Fachada/foto.jpg"));
  assert.ok(names.includes("ESC-000004 Escuela Benito Juárez/DOCUMENTOS/04_Fachada/2_foto.jpg"), "nombres repetidos no se pisan");
  assert.ok(names.some((n) => n.endsWith("05_Acceso principal/x.jpg")));
  assert.ok(names.every((n) => !n.includes("..")));
  const csv = Buffer.from(zip["ESC-000004 Escuela Benito Juárez/INDICE.csv"]).toString("utf8");
  assert.match(csv, /folio,requisito,archivo,visita,ruta/);
  assert.match(csv, /ESC-000004,Fachada,foto\.jpg,2026-09-15,/);
  assert.throws(() => Z.zipTree([{ name: "../x", bytes: new Uint8Array([1]) }]), /no válida/);
  assert.throws(() => Z.zipTree([{ name: "/x", bytes: new Uint8Array([1]) }]), /no válida/);
  assert.throws(() => Z.zipTree([{ name: "a\\b", bytes: new Uint8Array([1]) }]), /no válida/);
  assert.throws(() => Z.zipTree([{ name: "a//b", bytes: new Uint8Array([1]) }]), /no válida/);
  assert.throws(() => Z.zipTree([]), /No hay archivos/);
  console.log("EXPEDIENTES_OK: folios, plantillas copiadas, completitud, N/A, visitas y pendientes, archivos, ficha PDF y paquete ZIP con carpetas.");
})().catch((e) => { console.error(e); process.exit(1); });
