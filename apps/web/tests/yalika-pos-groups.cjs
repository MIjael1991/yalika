// Agrupación de la Caja: Negocio → Categoría → Productos.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file) {
  const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(out, { module: mod, exports: mod.exports, Intl });
  return mod.exports;
}
const { groupByCatalog, catalogNameOf, catalogChoices, isSoldOut, NO_CATALOG_ID, NO_CATALOG_NAME } =
  load(path.join(__dirname, '..', 'src', 'lib', 'yalika-pos-groups.ts'));

// Los arreglos vienen de otro contexto (vm): se comparan como datos planos.
const plain = (v) => JSON.parse(JSON.stringify(v));

const catalogs = [
  { id: 'cat-unas', name: 'Uñas' },
  { id: 'cat-bout', name: 'Boutique' },
];
const opt = (key, catalogId, categoryId, categoryName, stock = 5, track = true) => ({
  key, catalogId, categoryId, categoryName, stock, trackInventory: track,
});

test('separa por negocio y ordena por nombre', () => {
  const groups = groupByCatalog(
    [opt('a', 'cat-unas', 'c1', 'Gel'), opt('b', 'cat-bout', 'c2', 'Accesorios')],
    catalogs,
  );
  assert.deepEqual(plain(groups.map((g) => g.name)), ['Boutique', 'Uñas']);
  assert.equal(groups[0].categories[0].items[0].key, 'b');
});

test('un producto nunca aparece en dos negocios', () => {
  const items = [
    opt('a', 'cat-unas', 'c1', 'Gel'),
    opt('b', 'cat-bout', 'c1', 'Gel'),
    opt('c', undefined, null, 'Sin categoría'),
  ];
  const groups = groupByCatalog(items, catalogs);
  const keys = groups.flatMap((g) => g.categories.flatMap((c) => c.items.map((i) => i.key)));
  assert.deepEqual(plain(keys).sort(), ['a', 'b', 'c']);
  assert.equal(groups.reduce((n, g) => n + g.count, 0), 3);
});

test('sin negocio (o negocio desconocido) va al final', () => {
  const groups = groupByCatalog(
    [opt('x', undefined, 'c1', 'Pluma'), opt('y', 'borrado', 'c1', 'Pluma'), opt('z', 'cat-bout', 'c2', 'Ropa')],
    catalogs,
  );
  assert.equal(groups[0].name, 'Boutique');
  const last = groups[groups.length - 1];
  assert.equal(last.id, NO_CATALOG_ID);
  assert.equal(last.name, NO_CATALOG_NAME);
  assert.equal(last.count, 2);
});

test('categorías ordenadas y "Sin categoría" al final', () => {
  const groups = groupByCatalog(
    [opt('a', 'cat-bout', null, 'Sin categoría'), opt('b', 'cat-bout', 'c2', 'Zapatos'), opt('c', 'cat-bout', 'c1', 'Accesorios')],
    catalogs,
  );
  assert.deepEqual(plain(groups[0].categories.map((c) => c.name)), ['Accesorios', 'Zapatos', 'Sin categoría']);
});

test('cuenta agotados solo si se controla inventario', () => {
  const groups = groupByCatalog(
    [opt('a', 'cat-bout', 'c1', 'X', 0), opt('b', 'cat-bout', 'c1', 'X', 0, false), opt('c', 'cat-bout', 'c1', 'X', 3)],
    catalogs,
  );
  assert.equal(groups[0].soldOut, 1);
  assert.equal(isSoldOut(opt('d', 'cat-bout', 'c1', 'X', 0)), true);
  assert.equal(isSoldOut(opt('e', 'cat-bout', 'c1', 'X', 0, false)), false);
});

test('lista vacía y nombre de negocio para el carrito', () => {
  assert.deepEqual(plain(groupByCatalog([], catalogs)), []);
  assert.equal(catalogNameOf('cat-unas', catalogs), 'Uñas');
  assert.equal(catalogNameOf(undefined, catalogs), NO_CATALOG_NAME);
  assert.equal(catalogNameOf('otro', catalogs), NO_CATALOG_NAME);
});

test('el catálogo automático "General" nunca se muestra con ese nombre', () => {
  const withDefault = [{ id: 'cat-gen', name: 'General', isDefault: true }, ...catalogs];
  const groups = groupByCatalog(
    [opt('a', 'cat-gen', 'c1', 'Abrigos'), opt('b', 'cat-bout', 'c2', 'Accesorios'), opt('c', null, null, 'Sin categoría')],
    withDefault,
  );
  assert.deepEqual(plain(groups.map((g) => g.name)), ['Boutique', NO_CATALOG_NAME]);
  assert.equal(groups.length, 2, 'lo de General y lo sin negocio quedan en un solo grupo');
  assert.equal(groups[1].count, 2);
  assert.equal(catalogNameOf('cat-gen', withDefault), NO_CATALOG_NAME);
});

test('los desplegables sólo ofrecen negocios con nombre propio, en orden', () => {
  const withDefault = [{ id: 'cat-gen', name: 'General', isDefault: true }, ...catalogs];
  assert.deepEqual(plain(catalogChoices(withDefault).map((c) => c.name)), ['Boutique', 'Uñas']);
  assert.deepEqual(plain(catalogChoices([{ id: 'cat-gen', name: 'General', isDefault: true }])), []);
});
