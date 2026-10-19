const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  ts = require("typescript");
require.extensions[".ts"] = (mod, filename) =>
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
const S = require("../src/lib/yalika-suggest.ts");
const MB = 1024 * 1024;
const has = (list, re) => list.some((x) => re.test(x));
assert.ok(has(S.imageHints({ name: "IMG_0001.HEIC", type: "", size: 2 * MB }), /HEIC/));
assert.ok(has(S.imageHints({ name: "logo.png", type: "image/png", size: 40000, width: 1024, height: 1000 }), /casi cuadrada.*icono/));
assert.ok(has(S.imageHints({ name: "logo.png", type: "image/png", size: 3000, width: 128, height: 128 }), /chica.*1024/));
assert.ok(has(S.imageHints({ name: "foto.jpg", type: "image/jpeg", size: 5 * MB, width: 4000, height: 3000 }), /grande.*WebP/));
assert.ok(has(S.imageHints({ name: "captura.png", type: "image/png", size: 3 * MB, width: 1200, height: 800 }), /PNG pesado/));
assert.ok(has(S.imageHints({ name: "a.bmp", type: "image/bmp", size: 1000, width: 400, height: 300 }), /pesa mucho/));
assert.deepEqual(S.imageHints({ name: "foto.jpg", type: "image/jpeg", size: 300000, width: 1600, height: 900 }), []);
assert.ok(has(S.imageHints({ name: "tira.png", type: "image/png", size: 5000, width: 200, height: 100 }), /chica/));
console.log("SUGERENCIAS_OK: avisos según tipo, tamaño y forma de la imagen.");
