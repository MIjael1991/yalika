import { BadRequestException } from '@nestjs/common';

import { cashierMayCall } from '../commerce-security/cashier-policy';
import { OrderService } from './order.service';
import {
  buildSalesReport,
  dayKey,
  MAX_DETAIL_ROWS,
  MAX_REPORT_DAYS,
  parseReportRange,
  type SalesReportInput,
} from './sales-report';

/**
 * Reporte de ventas por fechas. Lo que se protege: que el rango se respete
 * (inicio incluido, fin excluido), que los días se cuenten en la hora del
 * negocio, que las devoluciones se resten y que el dinero cuadre al centavo.
 */

const TZ = 'America/Mexico_City';
const empty = (): SalesReportInput => ({
  orders: [],
  payments: [],
  refunds: [],
  returns: [],
  pendingOrders: [],
  timeZone: TZ,
});
const order = (
  total: number,
  confirmedAt: string | null,
  items: Array<{ name: string; sku?: string | null; qty: number; total: number }> = [],
  discount = 0,
) => ({
  total,
  discount,
  confirmedAt: confirmedAt ? new Date(confirmedAt) : null,
  createdAt: new Date('2026-10-01T12:00:00Z'),
  items: items.map((i) => ({ productName: i.name, sku: i.sku ?? null, quantity: i.qty, total: i.total })),
});

describe('Reporte · rango de fechas', () => {
  const ok = { from: '2026-10-01T06:00:00.000Z', to: '2026-10-08T06:00:00.000Z' };

  it('acepta un rango válido y usa la hora de Ciudad de México por defecto', () => {
    const range = parseReportRange(ok.from, ok.to);
    expect(range.timeZone).toBe(TZ);
    expect(range.from.toISOString()).toBe(ok.from);
    expect(range.to.toISOString()).toBe(ok.to);
  });

  it('acepta otra zona horaria válida', () => {
    expect(parseReportRange(ok.from, ok.to, 'America/Tijuana').timeZone).toBe('America/Tijuana');
  });

  it.each([
    [undefined, ok.to],
    [ok.from, undefined],
    ['', ''],
  ])('exige las dos fechas (%s, %s)', (from, to) => {
    expect(() => parseReportRange(from, to)).toThrow(BadRequestException);
  });

  it('rechaza fechas que no existen', () => {
    expect(() => parseReportRange('no-es-fecha', ok.to)).toThrow(/no son válidas/);
    expect(() => parseReportRange(ok.from, '2026-13-45')).toThrow(/no son válidas/);
  });

  it('rechaza un rango vacío o al revés', () => {
    expect(() => parseReportRange(ok.to, ok.from)).toThrow(/posterior/);
    expect(() => parseReportRange(ok.from, ok.from)).toThrow(/posterior/);
  });

  it('rechaza más de un año de reporte', () => {
    expect(() => parseReportRange('2025-01-01T00:00:00Z', '2026-12-01T00:00:00Z')).toThrow(
      new RegExp(`${MAX_REPORT_DAYS} días`),
    );
  });

  it('acepta justo un año', () => {
    expect(() => parseReportRange('2026-01-01T06:00:00Z', '2027-01-01T06:00:00Z')).not.toThrow();
  });

  it('rechaza una zona horaria inventada', () => {
    expect(() => parseReportRange(ok.from, ok.to, 'Marte/Olympus')).toThrow(/zona horaria/);
  });
});

describe('Reporte · cálculo', () => {
  it('sin movimientos todo es cero', () => {
    const report = buildSalesReport(empty());
    expect(report.totals).toEqual({
      orders: 0, gross: 0, discounts: 0, returns: 0, returnsAmount: 0, net: 0,
      averageTicket: 0, units: 0, refundedCash: 0, pendingOrders: 0, pendingAmount: 0,
    });
    expect(report.byDay).toEqual([]);
    expect(report.topProducts).toEqual([]);
    expect(report.paymentsByMethod).toEqual([]);
  });

  it('suma ventas, descuentos, ticket promedio y piezas', () => {
    const report = buildSalesReport({
      ...empty(),
      orders: [
        order(200, '2026-10-02T18:00:00Z', [{ name: 'Collar', sku: 'C1', qty: 2, total: 200 }], 20),
        order(100, '2026-10-03T18:00:00Z', [{ name: 'Pañuelo', sku: 'P1', qty: 1, total: 100 }]),
      ],
    });
    expect(report.totals.orders).toBe(2);
    expect(report.totals.gross).toBe(300);
    expect(report.totals.discounts).toBe(20);
    expect(report.totals.averageTicket).toBe(150);
    expect(report.totals.units).toBe(3);
    expect(report.totals.net).toBe(300);
  });

  it('la venta neta resta las devoluciones', () => {
    const report = buildSalesReport({
      ...empty(),
      orders: [order(500, '2026-10-02T18:00:00Z')],
      returns: [
        { type: 'return', totalAmount: 120, completedAt: new Date('2026-10-03T18:00:00Z') },
        { type: 'exchange', totalAmount: 80, completedAt: new Date('2026-10-04T18:00:00Z') },
      ],
    });
    expect(report.totals.returns).toBe(2);
    expect(report.totals.returnsAmount).toBe(200);
    expect(report.totals.net).toBe(300);
  });

  it('no pierde centavos con importes decimales', () => {
    const report = buildSalesReport({
      ...empty(),
      orders: [order(0.1, '2026-10-02T18:00:00Z'), order(0.2, '2026-10-02T19:00:00Z'), order(33.33, '2026-10-02T20:00:00Z')],
    });
    expect(report.totals.gross).toBe(33.63);
    expect(report.totals.averageTicket).toBe(11.21);
  });

  it('cobros por método: el crédito de un cambio no cuenta como dinero', () => {
    const report = buildSalesReport({
      ...empty(),
      payments: [
        { method: 'cash', amount: 300, paidAt: new Date('2026-10-02T18:00:00Z') },
        { method: 'cash', amount: 50.5, paidAt: new Date('2026-10-02T19:00:00Z') },
        { method: 'card', amount: 700, paidAt: new Date('2026-10-02T20:00:00Z') },
        { method: 'return_credit', amount: 150, paidAt: new Date('2026-10-02T21:00:00Z') },
      ],
    });
    expect(report.paymentsByMethod).toEqual([
      { method: 'card', count: 1, amount: 700 },
      { method: 'cash', count: 2, amount: 350.5 },
    ]);
    expect(report.exchangeCredit).toBe(150);
  });

  it('dinero devuelto por método', () => {
    const report = buildSalesReport({
      ...empty(),
      refunds: [
        { method: 'cash', amount: 40, refundedAt: new Date('2026-10-02T18:00:00Z') },
        { method: 'cash', amount: 10, refundedAt: new Date('2026-10-02T19:00:00Z') },
        { method: 'transfer', amount: 25.25, refundedAt: new Date('2026-10-02T20:00:00Z') },
      ],
    });
    expect(report.totals.refundedCash).toBe(75.25);
    expect(report.refundsByMethod).toEqual([
      { method: 'cash', count: 2, amount: 50 },
      { method: 'transfer', count: 1, amount: 25.25 },
    ]);
  });

  it('cuentas por cobrar: pedidos confirmados sin pagar completos', () => {
    const report = buildSalesReport({ ...empty(), pendingOrders: [{ total: 120 }, { total: 80.5 }] });
    expect(report.totals.pendingOrders).toBe(2);
    expect(report.totals.pendingAmount).toBe(200.5);
    expect(report.totals.gross).toBe(0);
  });

  it('un pedido sin fecha de confirmación se cuenta en su fecha de creación', () => {
    const report = buildSalesReport({ ...empty(), orders: [order(90, null)] });
    expect(report.byDay).toEqual([{ date: '2026-10-01', orders: 1, gross: 90, returnsAmount: 0, net: 90 }]);
  });
});

describe('Reporte · días en la hora del negocio', () => {
  it('las 23:30 de México caen en el día de México, no en el de UTC', () => {
    // 2026-10-16 05:30 UTC = 2026-10-15 23:30 en Ciudad de México (UTC-6)
    const instant = new Date('2026-10-16T05:30:00Z');
    expect(dayKey(instant, TZ)).toBe('2026-10-15');
    expect(dayKey(instant, 'UTC')).toBe('2026-10-16');
  });

  it('agrupa por día, en orden, y resta las devoluciones del día en que terminaron', () => {
    const report = buildSalesReport({
      ...empty(),
      orders: [
        order(100, '2026-10-16T05:30:00Z'), // 15 oct local
        order(50, '2026-10-16T07:00:00Z'), // 16 oct local
        order(70, '2026-10-16T20:00:00Z'), // 16 oct local
      ],
      returns: [{ type: 'return', totalAmount: 30, completedAt: new Date('2026-10-16T21:00:00Z') }],
    });
    expect(report.byDay).toEqual([
      { date: '2026-10-15', orders: 1, gross: 100, returnsAmount: 0, net: 100 },
      { date: '2026-10-16', orders: 2, gross: 120, returnsAmount: 30, net: 90 },
    ]);
  });

  it('una devolución sin ventas ese día también aparece', () => {
    const report = buildSalesReport({
      ...empty(),
      returns: [{ type: 'return', totalAmount: 40, completedAt: new Date('2026-10-20T18:00:00Z') }],
    });
    expect(report.byDay).toEqual([{ date: '2026-10-20', orders: 0, gross: 0, returnsAmount: 40, net: -40 }]);
  });
});

describe('Reporte · productos más vendidos', () => {
  it('junta el mismo SKU, ordena por importe y limita a 10', () => {
    const orders = [
      order(300, '2026-10-02T18:00:00Z', [
        { name: 'Collar', sku: 'C1', qty: 1, total: 100 },
        { name: 'Collar dorado', sku: 'C1', qty: 2, total: 200 },
      ]),
      order(400, '2026-10-03T18:00:00Z', [{ name: 'Reloj', sku: 'R1', qty: 1, total: 400 }]),
    ];
    const report = buildSalesReport({ ...empty(), orders });
    expect(report.topProducts[0]).toEqual({ name: 'Reloj', sku: 'R1', quantity: 1, total: 400 });
    expect(report.topProducts[1]).toEqual({ name: 'Collar', sku: 'C1', quantity: 3, total: 300 });

    const many = Array.from({ length: 15 }, (_, i) => ({ name: `P${i}`, sku: `S${i}`, qty: 1, total: 10 + i }));
    const big = buildSalesReport({ ...empty(), orders: [order(500, '2026-10-02T18:00:00Z', many)] });
    expect(big.topProducts).toHaveLength(10);
    expect(big.topProducts[0].name).toBe('P14');
  });

  it('sin SKU junta por nombre', () => {
    const report = buildSalesReport({
      ...empty(),
      orders: [
        order(20, '2026-10-02T18:00:00Z', [{ name: 'Bolsa', qty: 1, total: 20 }]),
        order(20, '2026-10-03T18:00:00Z', [{ name: 'Bolsa', qty: 1, total: 20 }]),
      ],
    });
    expect(report.topProducts).toEqual([{ name: 'Bolsa', sku: null, quantity: 2, total: 40 }]);
  });
});

describe('Reporte · consulta al servidor', () => {
  function setup() {
    const find = () => jest.fn().mockResolvedValue([]);
    const prisma = {
      order: { findMany: find() },
      payment: { findMany: find() },
      refund: { findMany: find() },
      return: { findMany: find() },
    };
    return { prisma, service: new OrderService(prisma as never) };
  }
  const from = '2026-10-01T06:00:00.000Z';
  const to = '2026-10-08T06:00:00.000Z';

  it('rango inválido: falla antes de consultar la base', async () => {
    const { prisma, service } = setup();
    await expect(service.salesReport('c1', to, from)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.salesReport('c1', undefined, undefined)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.order.findMany).not.toHaveBeenCalled();
    expect(prisma.payment.findMany).not.toHaveBeenCalled();
  });

  it('todas las consultas son de la empresa y del rango (inicio incluido, fin excluido)', async () => {
    const { prisma, service } = setup();
    const result = await service.salesReport('c1', from, to);
    const range = { gte: new Date(from), lt: new Date(to) };

    expect(result.range).toEqual({ from, to });
    for (const model of [prisma.order, prisma.payment, prisma.refund, prisma.return]) {
      for (const [args] of model.findMany.mock.calls) {
        expect(args.where.companyId).toBe('c1');
      }
    }
    const [sales, pending] = prisma.order.findMany.mock.calls.map(([a]) => a.where);
    expect(sales).toMatchObject({ status: 'confirmed', paymentStatus: 'paid' });
    expect(sales.OR).toEqual([{ confirmedAt: range }, { confirmedAt: null, createdAt: range }]);
    expect(pending).toMatchObject({ status: 'confirmed', paymentStatus: { not: 'paid' }, createdAt: range });
    expect(prisma.payment.findMany.mock.calls[0][0].where).toMatchObject({ status: 'completed', paidAt: range });
    expect(prisma.refund.findMany.mock.calls[0][0].where).toMatchObject({ status: 'completed', refundedAt: range });
    expect(prisma.return.findMany.mock.calls[0][0].where).toMatchObject({ status: 'completed', completedAt: range });
  });

  it('arma el reporte con lo que devuelve la base', async () => {
    const { prisma, service } = setup();
    prisma.order.findMany
      .mockResolvedValueOnce([order(250, '2026-10-02T18:00:00Z', [{ name: 'Collar', sku: 'C1', qty: 1, total: 250 }])])
      .mockResolvedValueOnce([{ total: 99 }]);
    prisma.payment.findMany.mockResolvedValue([{ method: 'cash', amount: 250, paidAt: new Date('2026-10-02T18:00:00Z') }]);
    const result = await service.salesReport('c1', from, to);
    expect(result.totals.gross).toBe(250);
    expect(result.totals.pendingAmount).toBe(99);
    expect(result.paymentsByMethod).toEqual([{ method: 'cash', count: 1, amount: 250 }]);
  });
});

describe('Reporte · permisos', () => {
  const may = (method: string, path: string) => cashierMayCall(method, path.split('/').filter(Boolean));

  it('el cajero NO puede ver el reporte de ventas', () => {
    expect(may('GET', '/order/company/c1/report')).toBe(false);
  });

  it('el cajero sigue pudiendo consultar ventas, tickets y cobrar', () => {
    expect(may('GET', '/order/company/c1')).toBe(true);
    expect(may('GET', '/order/o1/ticket')).toBe(true);
    expect(may('GET', '/order/o1')).toBe(true);
    expect(may('POST', '/order')).toBe(true);
    expect(may('POST', '/payment/order/o1')).toBe(true);
  });

  it('no se puede esquivar con rutas parecidas', () => {
    expect(may('POST', '/order/company/c1/report')).toBe(false);
  });
});

describe('Reporte · detalle para el contador (Excel)', () => {
  it('cada ticket trae folio, día local, cliente, descuento y cómo se pagó', () => {
    const report = buildSalesReport({
      ...empty(),
      orders: [
        {
          ...order(300, '2026-10-16T05:30:00Z', [], 20),
          orderNumber: 'V-2',
          customerName: 'Ana',
          payments: [
            { method: 'cash', amount: 100, status: 'completed' },
            { method: 'card', amount: 200, status: 'completed' },
            { method: 'card', amount: 999, status: 'failed' },
          ],
        },
        { ...order(50, '2026-10-15T20:00:00Z'), orderNumber: 'V-1' },
      ],
    });
    expect(report.tickets.map((t) => t.orderNumber)).toEqual(['V-1', 'V-2']);
    expect(report.tickets[1]).toMatchObject({
      day: '2026-10-15', // 23:30 hora de México
      customer: 'Ana',
      discount: 20,
      total: 300,
      methods: [
        { method: 'card', amount: 200 },
        { method: 'cash', amount: 100 },
      ],
    });
    expect(report.tickets[0]).toMatchObject({ customer: null, methods: [] });
    expect(report.ticketsTruncated).toBe(false);
  });

  it('el detalle se corta al tope, pero los totales cuentan todo', () => {
    const many = Array.from({ length: MAX_DETAIL_ROWS + 1 }, (_, i) => ({
      ...order(1, '2026-10-02T18:00:00Z'),
      orderNumber: `V-${i}`,
    }));
    const report = buildSalesReport({ ...empty(), orders: many });
    expect(report.tickets).toHaveLength(MAX_DETAIL_ROWS);
    expect(report.ticketsTruncated).toBe(true);
    expect(report.totals.orders).toBe(MAX_DETAIL_ROWS + 1);
    expect(report.totals.gross).toBe(MAX_DETAIL_ROWS + 1);
  });

  it('devoluciones con folio, venta original, motivo y lo reembolsado', () => {
    const report = buildSalesReport({
      ...empty(),
      returns: [
        { returnNumber: 'RET-2', orderNumber: 'V-9', type: 'exchange', reason: 'wrong_size_or_color', totalAmount: 80, refunded: 0, completedAt: new Date('2026-10-17T18:00:00Z') },
        { returnNumber: 'RET-1', orderNumber: 'V-8', type: 'return', reason: 'defective', totalAmount: 120.5, refunded: 120.5, completedAt: new Date('2026-10-16T18:00:00Z') },
        { returnNumber: 'RET-X', orderNumber: 'V-7', type: 'return', reason: 'other', totalAmount: 5, completedAt: null },
      ],
    });
    expect(report.returnsDetail.map((r) => r.returnNumber)).toEqual(['RET-1', 'RET-2']);
    expect(report.returnsDetail[0]).toMatchObject({ orderNumber: 'V-8', amount: 120.5, refunded: 120.5, reason: 'defective', day: '2026-10-16' });
    expect(report.returnsDetail[1]).toMatchObject({ type: 'exchange', refunded: 0 });
  });

  it('lista completa de productos vendidos (no solo los 10 primeros)', () => {
    const items = Array.from({ length: 25 }, (_, i) => ({ name: `P${i}`, sku: `S${i}`, qty: 1, total: 10 + i }));
    const report = buildSalesReport({ ...empty(), orders: [order(1000, '2026-10-02T18:00:00Z', items)] });
    expect(report.products).toHaveLength(25);
    expect(report.topProducts).toHaveLength(10);
    expect(report.products[0].name).toBe('P24');
    expect(report.topProducts).toEqual(report.products.slice(0, 10));
  });

  it('el servidor pide cliente, pagos completados y reembolsos de cada devolución', async () => {
    const find = () => jest.fn().mockResolvedValue([]);
    const prisma = { order: { findMany: find() }, payment: { findMany: find() }, refund: { findMany: find() }, return: { findMany: find() } };
    const service = new OrderService(prisma as never);
    prisma.order.findMany.mockResolvedValueOnce([
      { ...order(100, '2026-10-02T18:00:00Z'), orderNumber: 'V-1', customer: { name: 'Luis' }, payments: [{ method: 'cash', amount: 100, status: 'completed' }] },
    ]);
    prisma.return.findMany.mockResolvedValueOnce([
      { returnNumber: 'RET-1', type: 'return', reason: 'defective', totalAmount: 30, completedAt: new Date('2026-10-03T18:00:00Z'), order: { orderNumber: 'V-1' }, refunds: [{ amount: 10 }, { amount: 20 }] },
    ]);
    const result = await service.salesReport('c1', '2026-10-01T06:00:00.000Z', '2026-10-08T06:00:00.000Z');
    const select = prisma.order.findMany.mock.calls[0][0].select;
    expect(select.customer).toEqual({ select: { name: true } });
    expect(select.payments.where).toEqual({ status: 'completed' });
    expect(result.tickets[0]).toMatchObject({ orderNumber: 'V-1', customer: 'Luis', methods: [{ method: 'cash', amount: 100 }] });
    expect(result.returnsDetail[0]).toMatchObject({ returnNumber: 'RET-1', orderNumber: 'V-1', refunded: 30 });
  });
});
