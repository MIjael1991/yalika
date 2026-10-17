// Excel del contador: semanas/meses, hojas, sumas y textos seguros.
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
const { rollupDays, weekStart, weekEnd, monthEnd, weekdayName, salesWorkbookSheets, salesWorkbook } = load('yalika-sales-xlsx');
const { buildWorkbook, columnName, safeSheetName } = load('yalika-xlsx-lite');
const plain = (v) => JSON.parse(JSON.stringify(v));

test('semanas de lunes a domingo', () => {
  assert.equal(weekStart('2026-10-16'), '2026-10-12'); // viernes -> lunes
  assert.equal(weekStart('2026-10-12'), '2026-10-12');
  assert.equal(weekStart('2026-10-18'), '2026-10-12'); // el domingo cierra su semana
  assert.equal(weekStart('2026-10-19'), '2026-10-19');
  assert.equal(weekEnd('2026-10-12'), '2026-10-18');
  assert.equal(weekStart('2026-01-01'), '2025-12-29'); // cruza el año
  assert.equal(weekdayName('2026-10-16'), 'viernes');
});

test('fin de mes, incluido febrero bisiesto', () => {
  assert.equal(monthEnd('2026-10-16'), '2026-10-31');
  assert.equal(monthEnd('2024-02-10'), '2024-02-29');
  assert.equal(monthEnd('2026-02-10'), '2026-02-28');
});

const days = [
  { date: '2026-10-11', orders: 1, gross: 100.1, returnsAmount: 0, net: 100.1 }, // domingo (semana anterior)
  { date: '2026-10-12', orders: 2, gross: 200.2, returnsAmount: 50.05, net: 150.15 },
  { date: '2026-10-16', orders: 3, gross: 300.3, returnsAmount: 0, net: 300.3 },
  { date: '2026-11-02', orders: 1, gross: 10, returnsAmount: 0, net: 10 },
];

test('acumula por semana y por mes sin errores de centavos', () => {
  const weeks = plain(rollupDays(days, 'week'));
  assert.equal(weeks.length, 3);
  assert.deepEqual(weeks[0], { key: '2026-10-05', from: '2026-10-05', to: '2026-10-11', orders: 1, gross: 100.1, returnsAmount: 0, net: 100.1 });
  assert.equal(weeks[1].orders, 5);
  assert.equal(weeks[1].gross, 500.5);
  assert.equal(weeks[1].returnsAmount, 50.05);
  assert.equal(weeks[1].net, 450.45);
  const months = plain(rollupDays(days, 'month'));
  assert.deepEqual(months.map((m) => m.key), ['2026-10', '2026-11']);
  assert.equal(months[0].gross, 600.6);
  assert.equal(months[0].to, '2026-10-31');
  assert.equal(months[1].from, '2026-11-01');
});

test('los días llegan desordenados y se ordenan', () => {
  const weeks = rollupDays([days[2], days[0]], 'week');
  assert.equal(weeks[0].from, '2026-10-05');
});

const report = {
  range: { from: '', to: '' },
  timeZone: 'America/Mexico_City',
  totals: { orders: 3, gross: 600.6, discounts: 20, returns: 1, returnsAmount: 50.05, net: 550.55, averageTicket: 200.2, units: 6, refundedCash: 50.05, pendingOrders: 0, pendingAmount: 0 },
  paymentsByMethod: [{ method: 'cash', count: 2, amount: 400.3 }, { method: 'card', count: 1, amount: 200.3 }],
  refundsByMethod: [{ method: 'cash', count: 1, amount: 50.05 }],
  exchangeCredit: 0,
  byDay: days.slice(0, 3),
  topProducts: [],
  tickets: [
    { orderNumber: '000123', date: '2026-10-16T20:30:00.000Z', day: '2026-10-16', customer: '=HYPERLINK("http://malo")', discount: 10, total: 300.3, methods: [{ method: 'cash', amount: 300.3 }] },
    { orderNumber: '000124', date: '2026-10-16T21:00:00.000Z', day: '2026-10-16', customer: null, discount: 10, total: 300.3, methods: [{ method: 'cash', amount: 100 }, { method: 'card', amount: 200.3 }] },
  ],
  ticketsTruncated: false,
  returnsDetail: [{ returnNumber: 'DEV-1', date: '2026-10-12T18:00:00.000Z', day: '2026-10-12', orderNumber: '000100', type: 'refund', reason: 'Talla', amount: 50.05, refunded: 50.05 }],
  products: [{ name: 'Collar', sku: '00123', quantity: 4, total: 400 }, { name: 'Aretes', sku: null, quantity: 2, total: 200.6 }],
};
const now = new Date('2026-10-16T22:00:00Z');
const build = (r = report) => salesWorkbookSheets(r, '2026-10-11', '2026-10-16', now);

test('las 8 hojas del contador, en orden', () => {
  assert.deepEqual(plain(build().map((s) => s.name)), ['Resumen', 'Por día', 'Por semana', 'Por mes', 'Cobros por método', 'Tickets', 'Devoluciones', 'Productos']);
});

test('resumen: neta = bruta − devoluciones por fórmula, con el resultado ya calculado', () => {
  const rows = build()[0].rows;
  const find = (label) => rows.find((r) => r[0] === label);
  assert.deepEqual(plain(find('Venta neta')[1]), { v: 550.55, f: 'B8-B9', s: 'moneyBold' });
  assert.equal(rows.indexOf(find('Ventas (tickets)')), 6, 'fila 7');
  assert.equal(rows.indexOf(find('Venta bruta')), 7, 'fila 8');
  assert.equal(rows.indexOf(find('Devoluciones (importe)')), 8, 'fila 9');
  assert.equal(plain(find('Ticket promedio')[1]).f, 'IF(B7=0,0,B8/B7)');
});

test('por día: la columna de ventas es C y los totales suman todas las filas', () => {
  const sheet = build()[1];
  assert.deepEqual(plain(sheet.rows[0]).map((c) => c.v), ['Día', 'Día de la semana', 'Ventas', 'Venta bruta', 'Devoluciones', 'Venta neta']);
  assert.equal(sheet.rows[1][1], 'domingo');
  assert.equal(plain(sheet.rows[2][5]).f, 'D3-E3');
  const total = plain(sheet.rows[4]);
  assert.equal(total[0].v, 'Total');
  assert.deepEqual(total[2], { v: 6, f: 'SUM(C2:C4)', s: 'intBold' });
  assert.deepEqual(total[3], { v: 600.6, f: 'SUM(D2:D4)', s: 'moneyBold' });
  assert.deepEqual(total[5], { v: 550.55, f: 'SUM(F2:F4)', s: 'moneyBold' });
});

test('por semana y por mes: la columna de ventas es D', () => {
  const sheets = build();
  const week = plain(sheets[2].rows);
  assert.equal(week[0][3].v, 'Ventas');
  assert.equal(week[2][3].v, 5);
  assert.equal(week[2][6].f, 'E3-F3');
  assert.equal(week[3][3].f, 'SUM(D2:D3)');
  const month = plain(sheets[3].rows);
  assert.equal(month[1][0], '2026-10');
});

test('cobros por método: cobrado − devuelto, y el total de cada columna', () => {
  const rows = plain(build()[4].rows);
  assert.equal(rows[1][0], 'Efectivo');
  assert.deepEqual(rows[1][5], { v: 350.25, f: 'C2-E2', s: 'money' });
  assert.deepEqual(rows[2][5], { v: 200.3, f: 'C3-E3', s: 'money' });
  assert.deepEqual(rows[3][5], { v: 550.55, f: 'SUM(F2:F3)', s: 'moneyBold' });
});

test('tickets: una columna por método, folios con ceros como texto, sin fórmulas desde un cliente', () => {
  const rows = plain(build()[5].rows);
  assert.deepEqual(rows[0].map((c) => c.v), ['Folio', 'Fecha', 'Hora', 'Cliente', 'Descuento', 'Total', 'Efectivo', 'Tarjeta']);
  assert.equal(rows[1][0], '000123');
  assert.equal(rows[1][2], '14:30'); // 20:30 UTC = 14:30 en CDMX
  assert.equal(rows[1][3], '=HYPERLINK("http://malo")');
  assert.equal(rows[2][3], '');
  assert.equal(rows[2][7].v, 200.3);
  assert.equal(rows[1][7], null);
  const total = rows[3];
  assert.deepEqual(total[6], { v: 400.3, f: 'SUM(G2:G3)', s: 'moneyBold' });
  assert.deepEqual(total[7], { v: 200.3, f: 'SUM(H2:H3)', s: 'moneyBold' });
  assert.deepEqual(total[5], { v: 600.6, f: 'SUM(F2:F3)', s: 'moneyBold' });
});

test('aviso cuando el detalle se cortó', () => {
  assert.ok(JSON.stringify(build({ ...report, ticketsTruncated: true })[5].rows).includes('5,000 tickets'));
});

test('devoluciones y productos', () => {
  const sheets = build();
  const returns = plain(sheets[6].rows);
  assert.equal(returns[1][3], 'Reembolso');
  assert.equal(returns[2][5].f, 'SUM(F2:F2)');
  const products = plain(sheets[7].rows);
  assert.equal(products[1][1], '00123');
  assert.equal(products[2][1], '');
  assert.deepEqual(products[3][3], { v: 600.6, f: 'SUM(D2:D3)', s: 'moneyBold' });
});

test('reporte vacío no se rompe', () => {
  const empty = { ...report, totals: { ...report.totals, orders: 0, gross: 0, net: 0, returnsAmount: 0, averageTicket: 0 }, paymentsByMethod: [], refundsByMethod: [], byDay: [], tickets: [], returnsDetail: [], products: [] };
  assert.ok(salesWorkbook(empty, '2026-10-01', '2026-10-01', now).length > 500);
});

test('el archivo .xlsx es un zip válido con el contenido esperado', () => {
  const files = unzipSync(salesWorkbook(report, '2026-10-11', '2026-10-16', now));
  const names = Object.keys(files).sort();
  assert.ok(names.includes('[Content_Types].xml'));
  assert.ok(names.includes('xl/workbook.xml'));
  assert.ok(names.includes('xl/styles.xml'));
  assert.equal(names.filter((n) => n.startsWith('xl/worksheets/')).length, 8);
  const workbook = strFromU8(files['xl/workbook.xml']);
  assert.ok(workbook.includes('name="Por semana"'));
  assert.ok(workbook.includes('_xlnm._FilterDatabase'));
  const tickets = strFromU8(files['xl/worksheets/sheet6.xml']);
  assert.ok(tickets.includes('<t xml:space="preserve">000123</t>'));
  assert.ok(tickets.includes('=HYPERLINK(&quot;http://malo&quot;)</t>'));
  assert.ok(!/<f>[^<]*HYPERLINK/.test(tickets));
  assert.ok(/<f>SUM\(F2:F3\)<\/f><v>600.6<\/v>/.test(tickets));
  assert.ok(tickets.includes('<autoFilter ref="A1:H4"/>'));
});

test('el escritor aguanta miles de filas (el de Estudio se limitaba a 200)', () => {
  const rows = [['Folio', 'Total']];
  for (let i = 0; i < 5000; i++) rows.push([String(i).padStart(6, '0'), i]);
  const files = unzipSync(buildWorkbook([{ name: 'Tickets', rows }]));
  const xml = strFromU8(files['xl/worksheets/sheet1.xml']);
  assert.ok(xml.includes('<row r="5001">'));
  assert.ok(xml.includes('>004999<'));
});

test('nombres de columnas y de hojas', () => {
  assert.equal(columnName(0), 'A');
  assert.equal(columnName(25), 'Z');
  assert.equal(columnName(26), 'AA');
  assert.equal(columnName(27), 'AB');
  assert.equal(safeSheetName('Ventas/2026: [ok]?'), 'Ventas 2026 ok');
  assert.equal(safeSheetName('x'.repeat(40)).length, 31);
  assert.equal(safeSheetName('Resumen', ['resumen']), 'Resumen 2');
});

test('caracteres de control y marcado raro no rompen el XML', () => {
  const files = unzipSync(buildWorkbook([{ name: 'A', rows: [['a\u0001b<c>&"d', { v: 'x', s: 'bold' }]] }]));
  assert.ok(strFromU8(files['xl/worksheets/sheet1.xml']).includes('ab&lt;c&gt;&amp;&quot;d'));
});
