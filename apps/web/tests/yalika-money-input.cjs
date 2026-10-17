// Lectura de importes escritos a mano (caja y celular).
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
const { parseMoneyInput } = load(path.join(__dirname, '..', 'src', 'lib', 'yalika-money-input.ts'));

test('importes comunes', () => {
  assert.equal(parseMoneyInput('100'), 100);
  assert.equal(parseMoneyInput('100.5'), 100.5);
  assert.equal(parseMoneyInput('0.99'), 0.99);
  assert.equal(parseMoneyInput('  250  '), 250);
  assert.equal(parseMoneyInput('$620'), 620);
});

test('teclado en español: la coma es decimal', () => {
  assert.equal(parseMoneyInput('100,50'), 100.5);
  assert.equal(parseMoneyInput('100,5'), 100.5);
  assert.equal(parseMoneyInput('0,99'), 0.99);
});

test('separador de miles', () => {
  assert.equal(parseMoneyInput('1,000'), 1000);
  assert.equal(parseMoneyInput('1,000,000'), 1000000);
  assert.equal(parseMoneyInput('$1,000.50'), 1000.5);
  assert.equal(parseMoneyInput('1.000,50'), 1000.5);
  assert.equal(parseMoneyInput('1.000.000'), 1000000);
  assert.equal(parseMoneyInput('1 000'), 1000);
});

test('nunca regresa fracciones de centavo', () => {
  assert.equal(parseMoneyInput('100.555'), 100.56);
  assert.equal(parseMoneyInput('10.004'), 10);
  assert.equal(parseMoneyInput('0.1') + parseMoneyInput('0.2'), 0.30000000000000004); // la suma la redondea el cobro
  assert.equal(parseMoneyInput('1.005'), 1.01);
});

test('texto que no es un importe', () => {
  for (const value of ['', '   ', 'abc', '12abc', '-5', '1..2', '1.2.3,4', '$', ',', '.', '1e3', '10 pesos']) {
    assert.ok(Number.isNaN(parseMoneyInput(value)), `"${value}" debería ser inválido`);
  }
});

test('cero es válido (para distinguirlo de vacío)', () => {
  assert.equal(parseMoneyInput('0'), 0);
  assert.equal(parseMoneyInput('0,00'), 0);
});
