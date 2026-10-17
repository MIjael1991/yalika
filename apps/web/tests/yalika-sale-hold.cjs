// Ventas en espera y repetir última venta: solo llaves y cantidades; al retomar rigen precios y existencias de hoy.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file) {
  const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(out, { module: mod, exports: mod.exports }, {});
  return mod.exports;
}
const hold = load(path.join(__dirname, '..', 'src', 'lib', 'yalika-sale-hold.ts'));
const plain = (value) => JSON.parse(JSON.stringify(value));
const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;

test('linesFromCart guarda solo llave y cantidad válida', () => {
  const lines = hold.linesFromCart([
    { key: 'a', quantity: 2, price: 10, productName: 'Papas' },
    { key: 'b', quantity: 0 },
    { key: '', quantity: 3 },
    { key: 'c', quantity: 1.5 },
  ]);
  assert.deepEqual(plain(lines), [{ key: 'a', quantity: 2 }]);
});

test('sanitizeLines descarta basura del navegador', () => {
  assert.deepEqual(plain(hold.sanitizeLines('x')), []);
  assert.deepEqual(plain(hold.sanitizeLines([null, 3, { key: 'a', quantity: -1 }, { key: 'a', quantity: '2' }, { key: 'ok', quantity: 4 }])), [{ key: 'ok', quantity: 4 }]);
  assert.deepEqual(plain(hold.sanitizeLines([{ key: 'a', quantity: 99999 }])), []);
});

test('sanitizeHeld quita vencidas, futuras, vacías y limita a 8, la más reciente primero', () => {
  const mk = (id, ago, lines = [{ key: 'a', quantity: 1 }]) => ({ id, savedAt: NOW - ago, lines });
  const raw = [mk('viejo', 13 * HOUR), mk('futuro', -10 * 60_000), mk('vacia', HOUR, []), mk('rota', HOUR, 'x'), { id: 5 }, null, mk('ayer', 2 * HOUR), mk('hoy', HOUR)];
  assert.deepEqual(plain(hold.sanitizeHeld(raw, NOW).map((s) => s.id)), ['hoy', 'ayer']);

  const many = Array.from({ length: 12 }, (_, i) => mk(`s${i}`, i * 1000));
  const kept = hold.sanitizeHeld(many, NOW);
  assert.equal(kept.length, 8);
  assert.equal(kept[0].id, 's0');
});

test('addHeld pone la nueva primero, no duplica y descarta la más vieja al pasar el máximo', () => {
  let list = [];
  for (let i = 0; i < 9; i += 1) list = hold.addHeld(list, { id: `s${i}`, savedAt: NOW + i, lines: [{ key: 'a', quantity: 1 }] });
  assert.equal(list.length, 8);
  assert.equal(list[0].id, 's8');
  assert.ok(!list.some((s) => s.id === 's0'));
  list = hold.addHeld(list, { id: 's5', savedAt: NOW + 99, lines: [{ key: 'b', quantity: 1 }] });
  assert.equal(list.filter((s) => s.id === 's5').length, 1);
  assert.equal(list[0].id, 's5');
});

test('removeHeld quita solo la indicada', () => {
  const list = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(plain(hold.removeHeld(list, 'a')), [{ id: 'b' }]);
});

const opt = (key, extra = {}) => ({ key, productName: `P-${key}`, price: 10, trackInventory: true, stock: 10, ...extra });

test('restoreLines vuelve a armar la venta con los productos de hoy', () => {
  const result = hold.restoreLines([{ key: 'a', quantity: 2 }, { key: 'b', quantity: 1 }], [opt('a'), opt('b')]);
  assert.deepEqual(plain(result.items.map((i) => [i.option.key, i.quantity])), [['a', 2], ['b', 1]]);
  assert.equal(result.missing, 0);
});

test('restoreLines avisa de lo que ya no existe, está agotado o bajó de existencia', () => {
  const result = hold.restoreLines(
    [{ key: 'a', quantity: 5 }, { key: 'gone', quantity: 1 }, { key: 'out', quantity: 1 }, { key: 'free', quantity: 50 }],
    [opt('a', { stock: 3 }), opt('out', { stock: 0 }), opt('free', { trackInventory: false, stock: 0 })],
  );
  assert.deepEqual(plain(result.items.map((i) => [i.option.key, i.quantity])), [['a', 3], ['free', 50]]);
  assert.equal(result.missing, 1);
  assert.deepEqual(plain(result.soldOut), ['P-out']);
  assert.deepEqual(plain(result.reduced), ['P-a']);
});

test('restoreLines junta líneas repetidas de la misma llave', () => {
  const result = hold.restoreLines([{ key: 'a', quantity: 2 }, { key: 'a', quantity: 3 }], [opt('a')]);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].quantity, 5);
});
