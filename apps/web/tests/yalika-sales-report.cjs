// Reporte de ventas por fechas: rangos, consulta y archivo CSV.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file) {
  const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(out, { module: mod, exports: mod.exports, Intl, URLSearchParams, Date, Math, Number, String });
  return mod.exports;
}
const { presetRange, rangeToQuery, reportToCsv, toDayString, methodLabel } = load(
  path.join(__dirname, '..', 'src', 'lib', 'yalika-sales-report.ts'),
);
const plain = (value) => JSON.parse(JSON.stringify(value));
const at = (y, m, d) => new Date(y, m - 1, d, 15, 30); // 15:30 hora local

test('atajos de fechas', () => {
  const now = at(2026, 10, 16);
  assert.deepEqual(plain(presetRange('today', now)), { from: '2026-10-16', to: '2026-10-16' });
  assert.deepEqual(plain(presetRange('yesterday', now)), { from: '2026-10-15', to: '2026-10-15' });
  assert.deepEqual(plain(presetRange('last7', now)), { from: '2026-10-10', to: '2026-10-16' });
  assert.deepEqual(plain(presetRange('thisMonth', now)), { from: '2026-10-01', to: '2026-10-16' });
  assert.deepEqual(plain(presetRange('lastMonth', now)), { from: '2026-09-01', to: '2026-09-30' });
});

test('atajos en cambios de mes y de año', () => {
  assert.deepEqual(plain(presetRange('yesterday', at(2026, 3, 1))), { from: '2026-02-28', to: '2026-02-28' });
  assert.deepEqual(plain(presetRange('yesterday', at(2024, 3, 1))), { from: '2024-02-29', to: '2024-02-29' });
  assert.deepEqual(plain(presetRange('lastMonth', at(2026, 1, 15))), { from: '2025-12-01', to: '2025-12-31' });
  assert.deepEqual(plain(presetRange('last7', at(2026, 1, 3))), { from: '2025-12-28', to: '2026-01-03' });
  assert.deepEqual(plain(presetRange('lastMonth', at(2026, 3, 31))), { from: '2026-02-01', to: '2026-02-28' });
});

test('el rango incluye todo el último día (termina en la medianoche siguiente)', () => {
  const built = rangeToQuery('2026-10-10', '2026-10-16', 'America/Mexico_City');
  assert.ok(built.query);
  const params = new URLSearchParams(built.query);
  assert.equal(params.get('tz'), 'America/Mexico_City');
  assert.equal(built.days, 7);
  const from = new Date(params.get('from'));
  const to = new Date(params.get('to'));
  assert.equal(toDayString(from), '2026-10-10');
  assert.equal(from.getHours(), 0);
  assert.equal(toDayString(to), '2026-10-17');
  assert.equal(to.getHours(), 0);
});

test('un solo día cubre exactamente ese día', () => {
  const built = rangeToQuery('2026-10-16', '2026-10-16', 'America/Mexico_City');
  assert.equal(built.days, 1);
});

test('el cambio de horario no cambia los días contados', () => {
  // 25 de octubre de 2026 (cambio de horario en EE. UU./Europa): sigue siendo un día calendario.
  const built = rangeToQuery('2026-10-25', '2026-10-25', 'UTC');
  assert.equal(built.days, 1);
});

test('rechaza fechas incompletas, imposibles o al revés', () => {
  assert.match(rangeToQuery('', '2026-10-16').error, /dos fechas/);
  assert.match(rangeToQuery('2026-10-16', '').error, /dos fechas/);
  assert.match(rangeToQuery('2026-02-31', '2026-03-01').error, /dos fechas/);
  assert.match(rangeToQuery('16/10/2026', '2026-10-16').error, /dos fechas/);
  assert.match(rangeToQuery('2026-10-16', '2026-10-15').error, /anterior/);
});

test('rechaza más de un año, acepta justo un año', () => {
  assert.match(rangeToQuery('2025-01-01', '2026-12-31').error, /un año/);
  assert.ok(rangeToQuery('2026-01-01', '2026-12-31').query);
});

const report = {
  range: { from: '', to: '' },
  timeZone: 'America/Mexico_City',
  totals: { orders: 3, gross: 1234.5, discounts: 20, returns: 1, returnsAmount: 100, net: 1134.5, averageTicket: 411.5, units: 5, refundedCash: 100, pendingOrders: 1, pendingAmount: 80 },
  paymentsByMethod: [{ method: 'cash', count: 2, amount: 900 }, { method: 'card', count: 1, amount: 334.5 }],
  refundsByMethod: [{ method: 'cash', count: 1, amount: 100 }],
  exchangeCredit: 50,
  byDay: [{ date: '2026-10-15', orders: 1, gross: 400, returnsAmount: 0, net: 400 }, { date: '2026-10-16', orders: 2, gross: 834.5, returnsAmount: 100, net: 734.5 }],
  topProducts: [
    { name: 'Collar "dorado", fino', sku: 'C1', quantity: 2, total: 600 },
    { name: '=HYPERLINK("http://malo")', sku: null, quantity: 1, total: 100 },
    { name: 'Ñandú café', sku: 'N1', quantity: 2, total: 534.5 },
  ],
};

test('CSV: abre bien en Excel (acentos, comillas y comas)', () => {
  const csv = reportToCsv(report, '2026-10-15', '2026-10-16');
  assert.ok(csv.startsWith('﻿'), 'lleva BOM para los acentos');
  assert.ok(csv.includes('\r\n'));
  assert.ok(csv.includes('Reporte de ventas,2026-10-15 a 2026-10-16'));
  assert.ok(csv.includes('Venta neta,1134.50'));
  assert.ok(csv.includes('Ticket promedio,411.50'));
  assert.ok(csv.includes('Efectivo,2,900'));
  assert.ok(csv.includes('Tarjeta,1,334.50'));
  assert.ok(csv.includes('Crédito por cambios (no es dinero),,50'));
  assert.ok(csv.includes('"Collar ""dorado"", fino",C1,2,600'));
  assert.ok(csv.includes('Ñandú café,N1,2,534.50'));
  assert.ok(csv.includes('2026-10-16,2,834.50,100,734.50'));
});

test('CSV: un nombre de producto no puede ejecutarse como fórmula', () => {
  const csv = reportToCsv(report, '2026-10-15', '2026-10-16');
  assert.ok(!/(^|,)=HYPERLINK/m.test(csv), 'no debe empezar con =');
  assert.ok(csv.includes(`"'=HYPERLINK(""http://malo"")"`));
});

test('CSV: reporte vacío no se rompe', () => {
  const empty = { ...report, totals: { ...report.totals, orders: 0, gross: 0, net: 0 }, paymentsByMethod: [], refundsByMethod: [], exchangeCredit: 0, byDay: [], topProducts: [] };
  const csv = reportToCsv(empty, '2026-10-01', '2026-10-01');
  assert.ok(csv.includes('Ventas (tickets),0'));
  assert.ok(!csv.includes('Crédito por cambios'));
});

test('nombres de métodos de pago', () => {
  assert.equal(methodLabel('cash'), 'Efectivo');
  assert.equal(methodLabel('card'), 'Tarjeta');
  assert.equal(methodLabel('transfer'), 'Transferencia');
  assert.equal(methodLabel('return_credit'), 'Crédito por cambio');
  assert.equal(methodLabel('cripto'), 'cripto');
});

test('semana pasada: de lunes a domingo completos', () => {
  assert.deepEqual(plain(presetRange('lastWeek', at(2026, 10, 16))), { from: '2026-10-05', to: '2026-10-11' }); // viernes
  assert.deepEqual(plain(presetRange('lastWeek', at(2026, 10, 12))), { from: '2026-10-05', to: '2026-10-11' }); // lunes
  assert.deepEqual(plain(presetRange('lastWeek', at(2026, 10, 18))), { from: '2026-10-05', to: '2026-10-11' }); // domingo
  assert.deepEqual(plain(presetRange('lastWeek', at(2026, 1, 2))), { from: '2025-12-22', to: '2025-12-28' });
});
