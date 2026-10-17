// Lector USB/Bluetooth: un escaneo rápido se reconoce; teclear a mano, no.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file) {
  const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(out, { module: mod, exports: mod.exports });
  return mod.exports;
}
const { createScanBuffer } = load(path.join(__dirname, '..', 'src', 'lib', 'yalika-scan-buffer.ts'));

function feed(buffer, text, start, gap) {
  let now = start;
  let result = null;
  for (const key of text) {
    result = buffer.push(key, now);
    now += gap;
  }
  result = buffer.push('Enter', now);
  return result;
}

test('un escaneo rápido devuelve el código completo', () => {
  assert.equal(feed(createScanBuffer(), '7501031311309', 1000, 10), '7501031311309');
});

test('teclear despacio no forma un código', () => {
  assert.equal(feed(createScanBuffer(), '7501031311309', 1000, 200), null);
});

test('códigos muy cortos o Enter solo se ignoran', () => {
  assert.equal(feed(createScanBuffer(), '12', 1000, 10), null);
  assert.equal(createScanBuffer().push('Enter', 5), null);
});

test('dos escaneos seguidos no se mezclan', () => {
  const buffer = createScanBuffer();
  assert.equal(feed(buffer, '7501031311309', 1000, 10), '7501031311309');
  assert.equal(feed(buffer, '7501055363057', 2000, 10), '7501055363057');
});

test('el ruido de teclas sueltas antes del escaneo no contamina el código', () => {
  const buffer = createScanBuffer();
  buffer.push('a', 100);
  assert.equal(feed(buffer, '7501031311309', 5000, 10), '7501031311309');
});

test('teclas especiales (Shift, flechas) no se agregan al código', () => {
  const buffer = createScanBuffer();
  buffer.push('Shift', 1000);
  assert.equal(feed(buffer, '12345678', 1010, 10), '12345678');
});
