const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  assert = require("node:assert/strict"),
  ts = require("typescript");
const source =
  fs.readFileSync(
    path.join(__dirname, "../src/app/salud/cuidado/care-workspace.tsx"),
    "utf8",
  ) + "\nexport {readQueue,writeQueue};";
const code = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const values = new Map(),
  exportsObject = {};
vm.runInNewContext(code, {
  exports: exportsObject,
  require: () => ({}),
  window: {},
  localStorage: {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
  },
});
const { readQueue, writeQueue } = exportsObject;
const legacy = "yaleka:clinical:r29:offline-queue";
values.set(legacy, "LEGADO");
writeQueue("empresa-a:persona-a", [{ id: "PRUEBA-A" }]);
writeQueue("empresa-a:persona-b", [{ id: "PRUEBA-B" }]);
assert.equal(readQueue("empresa-a:persona-a")[0].id, "PRUEBA-A");
assert.equal(readQueue("empresa-a:persona-b")[0].id, "PRUEBA-B");
assert.equal(readQueue("empresa-b:persona-a").length, 0);
assert.equal(readQueue("").length, 0);
assert.throws(() => writeQueue("", []));
assert.equal(values.get(legacy), "LEGADO");
values.set(legacy + ":v2:corrupto", "{}");
assert.equal(readQueue("corrupto").length, 0);
console.log(
  "PRUEBA OK: pendientes separados por cuenta y empresa, legado preservado.",
);

// Regresión: fecha y hora expresadas como en la instrucción del usuario.
const modules = {};
function loadCaptureSource(file) {
  file = path.resolve(file);
  if (modules[file]) return modules[file];
  const mod = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  new Function("require", "module", "exports", compiled)(
    (name) =>
      name.startsWith(".")
        ? loadCaptureSource(path.resolve(path.dirname(file), name + ".ts"))
        : require(name),
    mod,
    mod.exports,
  );
  modules[file] = mod.exports;
  return mod.exports;
}
const { interpretCaptureTemporal } = loadCaptureSource(
  path.join(__dirname, "../../api/src/core/capture/capture-temporal.ts"),
);
const instruction =
  "Hablar con el padre de familia de Juan 9 de la mañana el dia miercoles 14 de octubre";
const interpreted = interpretCaptureTemporal({
  message: instruction,
  title: instruction,
  timezone: "America/Mexico_City",
  now: new Date("2026-10-12T15:00:00Z"),
});
assert.equal(interpreted.dueAt, "2026-10-14T15:00:00.000Z");
console.log(
  "PRUEBA OK: actividad el 14 de octubre de 2026 a las 09:00 en México.",
);

assert.equal(
  interpreted.needsTemporalConfirmation,
  false,
  "La hora explícita no debe sustituirse por las 09:00 predeterminadas",
);
for (const [hour, period, expected] of [
  ["10", "mañana", "16:00"],
  ["4", "tarde", "22:00"],
]) {
  const message = `Hablar con Juan ${hour} de la ${period} el 14 de octubre`;
  assert.equal(
    interpretCaptureTemporal({
      message,
      title: message,
      timezone: "America/Mexico_City",
      now: new Date("2026-10-12T15:00:00Z"),
    }).dueAt,
    `2026-10-14T${expected}:00.000Z`,
  );
}
console.log("PRUEBA OK: horas de mañana y tarde sin exigir escribir «a las».");

assert.equal(interpreted.title, "Hablar con el padre de familia de Juan");
