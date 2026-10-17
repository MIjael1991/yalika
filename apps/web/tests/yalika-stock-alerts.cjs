// Alertas de inventario en pantalla y Excel: reglas guardadas, filtro por negocio y hojas.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { unzipSync, strFromU8 } = require('fflate');

const libDir = path.join(__dirname, '..', 'src', 'lib');
const cache = {};
function load(name) {
  if (cache[name]) return cache[name];
  const file = path.join(libDir, name + '.ts');
  const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  const req = (id) => (id.startsWith('./') ? load(id.slice(2)) : require(id));
  vm.runInNewContext(out, { module: mod, exports: mod.exports, require: req, Intl, URLSearchParams, Date, Math, Number, String, Array, Object, Map, Set, JSON, RegExp, Error, Uint8Array }, { filename: file });
  return (cache[name] = mod.exports);
}
const A = load('yalika-stock-alerts');
const plain = (v) => JSON.parse(JSON.stringify(v));

const item = (over) => ({
  id: 'p', name: 'Producto', sku: null, catalogId: 'boutique', categoryName: 'Blusas', stock: 5, lowStockAt: 5,
  ageDays: 10, ageBucket: 'new', daysSinceSale: 2, sold90: 3, coverDays: 30, deadlineInDays: null, kinds: [], message: 'Producto: x', ...over,
});
const out1 = item({ id: 'a', name: 'Agotado A', stock: 0, kinds: ['out'], catalogId: 'unas' });
const low1 = item({ id: 'b', name: 'Bajo B', stock: 2, kinds: ['low', 'slow'] });
const soon1 = item({ id: 'c', name: 'Pronto C', stock: 4, kinds: ['soon_out'], coverDays: 3, catalogId: null });
const slow1 = item({ id: 'b', name: 'Bajo B', stock: 2, kinds: ['low', 'slow'], daysSinceSale: 80, ageDays: 120, ageBucket: 'very_old' });
const dead1 = item({ id: 'd', name: 'Fecha D', stock: 6, kinds: ['deadline_soon'], deadlineInDays: 3 });
const deadPassed = item({ id: 'e', name: 'Pasó E', stock: 1, kinds: ['deadline_passed', 'slow'], deadlineInDays: -4, catalogId: 'unas' });
const report = {
  settings: { slowDays: 45, newDays: 14, agedDays: 90, coverDays: 7, deadlineWarnDays: 14 },
  generatedAt: '2026-10-16T22:00:00.000Z',
  totals: { products: 8, withStock: 5, withAlerts: 5 },
  out: [out1], low: [low1], soonOut: [soon1], slow: [slow1, deadPassed], deadline: [dead1, deadPassed],
  byAge: [slow1, deadPassed, dead1, soon1], newArrivals: [dead1],
};
const names = { boutique: 'Boutique', unas: 'Uñas' };
const catalogName = (id) => (id ? names[id] ?? '' : 'Sin negocio asignado');

test('reglas guardadas: lo inválido o manipulado vuelve al valor normal', () => {
  assert.deepEqual(plain(A.normalizeAlertSettings(null)), plain(A.DEFAULT_ALERT_SETTINGS));
  assert.deepEqual(plain(A.normalizeAlertSettings('basura')), plain(A.DEFAULT_ALERT_SETTINGS));
  const s = A.normalizeAlertSettings({ slowDays: '30', newDays: 7, agedDays: 60, coverDays: 0, deadlineWarnDays: 1.5 });
  assert.equal(s.slowDays, 30);
  assert.equal(s.newDays, 7);
  assert.equal(s.agedDays, 60);
  assert.equal(s.coverDays, 7, 'cero no es válido');
  assert.equal(s.deadlineWarnDays, 14, 'decimales no son válidos');
  assert.equal(A.normalizeAlertSettings({ slowDays: 9999 }).slowDays, 45);
});

test('"viejo" siempre es más viejo que "nuevo"', () => {
  const s = A.normalizeAlertSettings({ newDays: 60, agedDays: 30 });
  assert.ok(s.agedDays > s.newDays);
});

test('consulta a la API con las reglas y la zona horaria', () => {
  const q = new URLSearchParams(A.alertsQuery(A.DEFAULT_ALERT_SETTINGS, 'America/Mexico_City'));
  assert.equal(q.get('slowDays'), '45');
  assert.equal(q.get('deadlineWarnDays'), '14');
  assert.equal(q.get('tz'), 'America/Mexico_City');
  assert.equal(new URLSearchParams(A.alertsQuery(A.DEFAULT_ALERT_SETTINGS)).has('tz'), false);
});

test('filtro por negocio recalcula los totales y no pierde nada sin filtro', () => {
  assert.equal(A.filterByCatalog(report, ''), report);
  const unas = A.filterByCatalog(report, 'unas');
  assert.deepEqual(plain(unas.out.map((i) => i.id)), ['a']);
  assert.deepEqual(plain(unas.slow.map((i) => i.id)), ['e']);
  assert.equal(unas.totals.withAlerts, 2);
  assert.equal(unas.totals.withStock, 1);
  const none = A.filterByCatalog(report, 'none');
  assert.deepEqual(plain(none.soonOut.map((i) => i.id)), ['c']);
  assert.equal(A.filterByCatalog(report, 'boutique').out.length, 0);
});

test('la primera pestaña muestra lo más urgente que exista', () => {
  assert.equal(A.firstSectionWithItems(report), 'out');
  assert.equal(A.firstSectionWithItems({ ...report, out: [] }), 'deadline');
  assert.equal(A.firstSectionWithItems({ ...report, out: [], deadline: [] }), 'low');
  assert.equal(A.firstSectionWithItems({ ...report, out: [], deadline: [], low: [], soonOut: [], slow: [], newArrivals: [] }), 'byAge');
  assert.equal(A.firstSectionWithItems({ ...report, out: [], low: [], soonOut: [], slow: [], deadline: [], byAge: [], newArrivals: [] }), 'out');
});

test('texto de fecha límite', () => {
  assert.equal(A.deadlineText(0), 'hoy');
  assert.equal(A.deadlineText(1), 'en 1 día');
  assert.equal(A.deadlineText(5), 'en 5 días');
  assert.equal(A.deadlineText(-1), 'hace 1 día');
  assert.equal(A.deadlineText(-9), 'hace 9 días');
  assert.equal(A.deadlineText(null), '');
});

const sheets = () => plain(A.stockWorkbookSheets(report, catalogName, '', new Date('2026-10-16T22:00:00Z')));

test('hojas del Excel de inventario', () => {
  assert.deepEqual(sheets().map((s) => s.name), ['Resumen', 'Por reponer', 'Resagados', 'Fecha límite', 'Antigüedad', 'Llegó nuevo']);
});

test('por reponer: sin repetir productos y con el estado completo', () => {
  const rows = sheets()[1].rows;
  assert.equal(rows.length, 4, 'encabezado + 3 productos distintos');
  assert.equal(rows[1][0], 'Agotado A');
  const bajo = rows.find((r) => r[0] === 'Bajo B');
  assert.equal(bajo[8], 'Por agotarse');
  assert.equal(bajo[2], 'Boutique');
  const sin = rows.find((r) => r[0] === 'Pronto C');
  assert.equal(sin[2], 'Sin negocio asignado');
  assert.equal(sin[7].v, 3);
});

test('resagados y antigüedad: "Nunca" cuando jamás se vendió', () => {
  const never = item({ id: 'z', name: 'Nunca Z', daysSinceSale: null, kinds: ['slow'], ageDays: 100, ageBucket: 'very_old' });
  const r = { ...report, slow: [never], byAge: [never] };
  const out = plain(A.stockWorkbookSheets(r, catalogName, '', new Date()));
  assert.equal(out[2].rows[1][5], 'Nunca');
  assert.equal(out[4].rows[1][7], 'Nunca');
  assert.equal(out[4].rows[1][6], 'Muy viejo');
});

test('fecha límite: vencidos con número negativo y estado', () => {
  const rows = sheets()[3].rows;
  const vencido = rows.find((r) => r[0] === 'Pasó E');
  assert.equal(vencido[5].v, -4);
  assert.equal(vencido[6], 'Pasó su fecha límite');
  assert.equal(rows.find((r) => r[0] === 'Fecha D')[6], 'Fecha límite cerca');
});

test('resumen: conteos y reglas usadas, con el negocio filtrado', () => {
  const rows = plain(A.stockWorkbookSheets(report, catalogName, 'Uñas', new Date('2026-10-16T22:00:00Z'))[0].rows);
  assert.equal(rows[2][1], 'Uñas');
  const find = (label) => rows.find((r) => r[0] === label);
  assert.equal(find('Agotados')[1].v, 1);
  assert.equal(find('Resagados')[1].v, 2);
  assert.equal(find('Resagado: días sin venderse')[1].v, 45);
});

test('el archivo .xlsx abre y un nombre con "=" queda como texto', () => {
  const evil = item({ id: 'x', name: '=CMD|calc', stock: 0, kinds: ['out'] });
  const bytes = A.stockWorkbook({ ...report, out: [evil] }, catalogName, '', new Date());
  const files = unzipSync(bytes);
  assert.equal(Object.keys(files).filter((n) => n.startsWith('xl/worksheets/')).length, 6);
  const xml = strFromU8(files['xl/worksheets/sheet2.xml']);
  assert.ok(xml.includes('=CMD|calc</t>'));
  assert.ok(!/<f>[^<]*CMD/.test(xml));
});

test('inventario vacío no rompe el Excel', () => {
  const empty = { ...report, totals: { products: 0, withStock: 0, withAlerts: 0 }, out: [], low: [], soonOut: [], slow: [], deadline: [], byAge: [], newArrivals: [] };
  assert.ok(A.stockWorkbook(empty, catalogName, '', new Date()).length > 500);
});
