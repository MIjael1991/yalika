// Atajos de caja: multiplicadores (3x, x3) y productos más vendidos.
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
const { parseQuickEntry, bumpFrequency, sanitizeFrequency, topFrequent } = load(path.join(__dirname, '..', 'src', 'lib', 'yalika-quick-entry.ts'));
const plain = (value) => JSON.parse(JSON.stringify(value));

test('multiplicador al inicio: 3x, 3 x, 3*, 3×', () => {
  assert.deepEqual(plain(parseQuickEntry('3x manzana')), { quantity: 3, term: 'manzana' });
  assert.deepEqual(plain(parseQuickEntry('3 x manzana')), { quantity: 3, term: 'manzana' });
  assert.deepEqual(plain(parseQuickEntry('12*pan')), { quantity: 12, term: 'pan' });
  assert.deepEqual(plain(parseQuickEntry('2× refresco')), { quantity: 2, term: 'refresco' });
  assert.deepEqual(plain(parseQuickEntry('5X plátano')), { quantity: 5, term: 'plátano' });
});

test('multiplicador solo: queda para el siguiente producto', () => {
  assert.deepEqual(plain(parseQuickEntry('3x')), { quantity: 3, term: '' });
  assert.deepEqual(plain(parseQuickEntry(' 10 * ')), { quantity: 10, term: '' });
});

test('multiplicador al final: manzana x3, manzana*3', () => {
  assert.deepEqual(plain(parseQuickEntry('manzana x3')), { quantity: 3, term: 'manzana' });
  assert.deepEqual(plain(parseQuickEntry('manzana x 4')), { quantity: 4, term: 'manzana' });
  assert.deepEqual(plain(parseQuickEntry('manzana*3')), { quantity: 3, term: 'manzana' });
});

test('sin multiplicador: códigos de barras, nombres y SKU con x', () => {
  assert.equal(parseQuickEntry('7501031311309'), null);
  assert.equal(parseQuickEntry('manzana'), null);
  assert.equal(parseQuickEntry('ABX5'), null); // la x pegada a letras es parte del SKU
  assert.equal(parseQuickEntry('boxeo'), null);
  assert.equal(parseQuickEntry(''), null);
});

test('cantidades fuera de rango se ignoran', () => {
  assert.equal(parseQuickEntry('0x pan'), null);
  assert.equal(parseQuickEntry('1000x pan'), null);
  assert.equal(parseQuickEntry('pan x0'), null);
});

test('frecuencia: cuenta, ordena y respeta lo disponible', () => {
  let freq = {};
  freq = bumpFrequency(freq, 'a');
  freq = bumpFrequency(freq, 'b');
  freq = bumpFrequency(freq, 'b');
  freq = bumpFrequency(freq, 'c', 5);
  assert.deepEqual(plain(topFrequent(freq, new Set(['a', 'b', 'c']))), ['c', 'b', 'a']);
  assert.deepEqual(plain(topFrequent(freq, new Set(['a', 'b']))), ['b', 'a']);
  assert.deepEqual(plain(topFrequent(freq, new Set(['a', 'b', 'c']), 2)), ['c', 'b']);
});

test('frecuencia: no crece sin límite y conserva lo más usado', () => {
  let freq = {};
  for (let i = 0; i < 250; i += 1) freq = bumpFrequency(freq, `p${i}`);
  freq = bumpFrequency(freq, 'estrella', 50);
  assert.ok(Object.keys(freq).length <= 200);
  assert.equal(freq.estrella, 50);
});

test('lo guardado dañado no rompe la caja', () => {
  assert.deepEqual(plain(sanitizeFrequency(null)), {});
  assert.deepEqual(plain(sanitizeFrequency([1, 2])), {});
  assert.deepEqual(plain(sanitizeFrequency('x')), {});
  assert.deepEqual(plain(sanitizeFrequency({ a: 3, b: 'x', c: -1, d: NaN, e: 0 })), { a: 3 });
});
