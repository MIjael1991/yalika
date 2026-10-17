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
const N = require("../src/lib/yalika-names.ts");
const X = require("../src/lib/yalika-xlsx.ts");
const D = require("../src/lib/yalika-document.ts");
const sp = (t) => N.splitName(t);
(async () => {
  // Las dos últimas palabras son los apellidos
  assert.deepEqual(sp("Juan Pérez López"), { nombres: "Juan", paterno: "Pérez", materno: "López" });
  assert.deepEqual(sp("María Guadalupe Hernández Soto"), { nombres: "María Guadalupe", paterno: "Hernández", materno: "Soto" });
  assert.deepEqual(sp("José Luis Carlos Ramírez Ortiz"), { nombres: "José Luis Carlos", paterno: "Ramírez", materno: "Ortiz" });
  assert.deepEqual(sp("Ana López"), { nombres: "Ana", paterno: "López", materno: "" });
  assert.deepEqual(sp("Madonna"), { nombres: "Madonna", paterno: "", materno: "" });
  assert.deepEqual(sp(""), { nombres: "", paterno: "", materno: "" });
  // Apellidos compuestos con partículas
  assert.deepEqual(sp("Juan Carlos de la Cruz Pérez"), { nombres: "Juan Carlos", paterno: "de la Cruz", materno: "Pérez" });
  assert.deepEqual(sp("Luis Pérez del Valle"), { nombres: "Luis", paterno: "Pérez", materno: "del Valle" });
  assert.deepEqual(sp("Rosa María de los Ángeles Soto Díaz"), { nombres: "Rosa María de los Ángeles", paterno: "Soto", materno: "Díaz" });
  // Mayúsculas y minúsculas
  assert.deepEqual(sp("JUAN PÉREZ DE LA CRUZ"), { nombres: "Juan", paterno: "Pérez", materno: "de la Cruz" });
  assert.deepEqual(sp("ana maría lópez-ruiz soto"), { nombres: "Ana María", paterno: "López-Ruiz", materno: "Soto" });
  assert.deepEqual(sp("Ana McDonald Soto"), { nombres: "Ana", paterno: "McDonald", materno: "Soto" }, "mezcla de mayúsculas no se toca");

  // Mensaje de WhatsApp con numeración, saludo y teléfonos
  const msg = `Buenas tardes, esta es la lista:
1. Juan Pérez López 33 1234 5678
2) MARIA FERNANDA GARCÍA RUIZ
- Dr. Luis de la Torre Vega
• ana maría soto   
Gracias!
555

Pedro Ramírez`;
  const r = N.parseNames(msg);
  assert.deepEqual(r.rows.map(N.fullName), ["Juan Pérez López", "Maria Fernanda García Ruiz", "Luis de la Torre Vega", "Ana María Soto", "Pedro Ramírez"]);
  assert.equal(r.rows[0].telefono, "33 1234 5678");
  assert.equal(r.rows[2].paterno, "de la Torre");
  assert.equal(r.rows[3].materno, "Soto");
  assert.ok(r.skipped.includes("Buenas tardes, esta es la lista:") && r.skipped.includes("Gracias!"), "avisos omitidos: " + r.skipped);
  assert.ok(!r.skipped.includes("555"), "un número solo no se reporta");

  // Apellidos primero con coma
  const sf = N.parseNames("Pérez López, Juan Carlos\nGarcía, Ana\nde la Cruz Soto, Luis");
  assert.deepEqual(sf.rows.map((x) => [x.nombres, x.paterno, x.materno]), [["Juan Carlos", "Pérez", "López"], ["Ana", "García", ""], ["Luis", "de la Cruz", "Soto"]]);
  // Una sola línea con varios nombres
  assert.deepEqual(N.parseNames("Ana López Ruiz, Luis Pérez Soto, Rosa Díaz Vega").rows.map(N.fullName), ["Ana López Ruiz", "Luis Pérez Soto", "Rosa Díaz Vega"]);
  assert.deepEqual(N.parseNames("Ana López Ruiz; Luis Pérez Soto").rows.map(N.fullName), ["Ana López Ruiz", "Luis Pérez Soto"]);
  // Varias líneas sin patrón de apellido-primero, con comas sueltas
  assert.deepEqual(N.parseNames("Ana López, Luis Pérez\nRosa Díaz").rows.map(N.fullName), ["Ana López", "Luis Pérez", "Rosa Díaz"]);
  // Vacío y basura
  assert.deepEqual(N.parseNames("").rows, []);
  assert.equal(N.parseNames("123\n---\n😀").rows.length, 0);
  // Límite
  const many = N.parseNames(Array.from({ length: 400 }, (_, i) => "Nombre" + String.fromCharCode(97 + (i % 26)) + " Apellido Uno").join("\n"));
  assert.equal(many.rows.length, N.MAX_NAMES);
  assert.equal(many.cut, true);

  // Orden por apellido
  const sorted = N.sortNames(N.parseNames("Zoila Álvarez Ruiz\nAna Ñandú Soto\nLuis Álvarez Aguilar\nBeto Pérez Gil\nÉdgar Perez Gil").rows);
  assert.deepEqual(sorted.map(N.fullName), ["Luis Álvarez Aguilar", "Zoila Álvarez Ruiz", "Ana Ñandú Soto", "Beto Pérez Gil", "Édgar Perez Gil"]);

  // Excel: nombre completo y columnas separadas
  const rows = N.parseNames("Juan Pérez López\nAna Soto Díaz 3312345678").rows;
  const sheet = N.namesSheet(rows);
  assert.deepEqual(sheet[0], ["Nombre completo", "Nombre(s)", "Apellido paterno", "Apellido materno", "Teléfono"]);
  assert.deepEqual(sheet[1], ["Juan Pérez López", "Juan", "Pérez", "López", ""]);
  assert.deepEqual(N.namesSheet(N.parseNames("Juan Pérez López").rows)[0].length, 4, "sin teléfonos no hay columna");
  const zip = unzipSync(X.buildXlsx([{ name: "Lista", rows: sheet }], true, "yalika"));
  assert.ok(strFromU8(zip["xl/worksheets/sheet1.xml"]).includes("Apellido materno"));

  // Word: tabla numerada, apellidos y nombre
  const doc = N.namesDocument(rows, "Lista de grupo 3A");
  const table = doc.paragraphs.find((p) => p.table).table;
  assert.deepEqual(table[0], ["No.", "Apellido paterno", "Apellido materno", "Nombre(s)", "Teléfono"]);
  assert.deepEqual(table[1], ["1", "Pérez", "López", "Juan", ""]);
  assert.equal(doc.paragraphs[0].text, "Lista de grupo 3A");
  const word = await D.exportWord(doc);
  assert.ok(word.size > 1000);
  const pdf = await D.exportPdf(doc);
  assert.ok(Buffer.from(await pdf.arrayBuffer()).toString("latin1").startsWith("%PDF"));
  // 299 personas caben en una sola tabla de Word
  const big = N.namesDocument(many.rows, "Grande");
  assert.equal(big.paragraphs.find((p) => p.table).table.length, N.MAX_NAMES + 1);
  console.log("NOMBRES_OK: apellidos (compuestos, mayúsculas, coma), mensajes con ruido, orden, Excel, Word y PDF.");
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
