// Códigos SKU: sugerencia con ejemplo y sin repetir.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file) {
  const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(out, { module: mod, exports: mod.exports, Intl, String, Map, Date });
  return mod.exports;
}
const { skuPrefix, takenSkus, skuClash, suggestSku } = load(path.join(__dirname, '..', 'src', 'lib', 'yalika-sku.ts'));
const plain = (v) => JSON.parse(JSON.stringify(v));

const products = [
  { name: 'Blusa lino', sku: 'BOU-001', variants: [{ name: 'S', sku: 'BOU-001-S' }, { name: 'M', sku: 'BOU-001-M' }] },
  { name: 'Libreta', sku: 'PAP-001', variants: [] },
  { name: 'Sin código', sku: null, variants: [] },
];

test('el prefijo son tres letras sin acentos', () => {
  assert.equal(skuPrefix('Boutique Luna'), 'BOU');
  assert.equal(skuPrefix('Uñas Cherry'), 'UNA');
  assert.equal(skuPrefix('12'), 'XXX');
});

test('detecta códigos repetidos sin importar mayúsculas, también en tallas', () => {
  const taken = takenSkus(products);
  assert.equal(skuClash('bou-001', [], taken).owner, 'Blusa lino');
  assert.equal(skuClash('PAP-001', ['S'], taken).owner, 'Libreta');
  assert.equal(skuClash('BOU-002', ['S', 'M'], taken), null);
  assert.deepEqual(plain(skuClash('BOU-001', ['S'], taken).code), 'BOU-001');
  assert.equal(skuClash('', ['S'], taken), null, 'vacío es válido: el código es opcional');
});

test('la sugerencia siempre es un código libre y con formato PREFIJO-000', () => {
  const taken = takenSkus(products);
  assert.equal(suggestSku('Boutique', ['S', 'M'], taken), 'BOU-002');
  assert.equal(suggestSku('Papelería', [], taken), 'PAP-002');
  assert.equal(suggestSku('Tienda', [], taken), 'TIE-001');
  const crowded = takenSkus([{ name: 'X', sku: 'BOU-001', variants: [] }, { name: 'Y', sku: 'BOU-002-L', variants: [] }]);
  assert.equal(suggestSku('Boutique', ['L'], crowded), 'BOU-003');
});
