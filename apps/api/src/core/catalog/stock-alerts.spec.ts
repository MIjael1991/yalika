import { BadRequestException } from '@nestjs/common';

import { CatalogService } from './catalog.service';
import {
  buildStockAlerts,
  daysUntil,
  DEFAULT_STOCK_ALERT_SETTINGS,
  normalizeSettings,
  type StockAlertProduct,
} from './stock-alerts';

/**
 * Alertas de inventario. Lo que se protege: que avise lo que de verdad hay que
 * atender (agotado, poco, resagado, fecha límite) y no se queje de lo recién
 * llegado ni de lo que no controla inventario.
 */

const NOW = new Date('2026-10-16T18:00:00Z'); // 12:00 en Ciudad de México
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

function product(over: Partial<StockAlertProduct> = {}): StockAlertProduct {
  return {
    id: 'p1',
    name: 'Collar',
    sku: 'C1',
    catalogId: 'cat-bout',
    categoryName: 'Accesorios',
    trackInventory: true,
    stock: 20,
    lowStockAt: 5,
    createdAt: daysAgo(200),
    deadlineAt: null,
    lastEntryAt: daysAgo(10),
    lastSaleAt: daysAgo(2),
    sold90: 30,
    ...over,
  };
}
const run = (items: StockAlertProduct[], settings = {}) => buildStockAlerts(items, settings, NOW);
const kinds = (item: StockAlertProduct, settings = {}) => {
  const report = run([item], settings);
  return [...report.out, ...report.low, ...report.soonOut, ...report.slow, ...report.deadline]
    .filter((v, i, all) => all.indexOf(v) === i)
    .flatMap((i) => i.kinds);
};

describe('Alertas · existencia', () => {
  it('agotado', () => {
    const report = run([product({ stock: 0 })]);
    expect(report.out).toHaveLength(1);
    expect(report.out[0].message).toBe('Collar: Agotado');
    expect(report.low).toHaveLength(0);
    expect(report.totals).toEqual({ products: 1, withStock: 0, withAlerts: 1 });
  });

  it('existencia negativa por un error previo cuenta como agotado, no como número raro', () => {
    const report = run([product({ stock: -3 })]);
    expect(report.out[0].stock).toBe(0);
  });

  it('poco: igual o menos que el aviso del producto, pero no cero', () => {
    expect(run([product({ stock: 5, lowStockAt: 5 })]).low).toHaveLength(1);
    expect(run([product({ stock: 1, lowStockAt: 5 })]).low).toHaveLength(1);
    expect(run([product({ stock: 6, lowStockAt: 5 })]).low).toHaveLength(0);
    expect(run([product({ stock: 0, lowStockAt: 5 })]).low).toHaveLength(0);
  });

  it('un aviso en cero solo avisa cuando se agota', () => {
    expect(run([product({ stock: 1, lowStockAt: 0 })]).low).toHaveLength(0);
    expect(run([product({ stock: 0, lowStockAt: 0 })]).out).toHaveLength(1);
  });

  it('lo que no controla inventario nunca genera alertas', () => {
    const report = run([product({ trackInventory: false, stock: 0 })]);
    expect(report.out).toHaveLength(0);
    expect(report.totals.products).toBe(0);
  });

  it('el mensaje de poco dice cuánto queda', () => {
    expect(run([product({ stock: 3 })]).low[0].message).toBe('Collar: Quedan 3 (aviso en 5)');
  });
});

describe('Alertas · se agota pronto (cobertura)', () => {
  it('con 30 vendidos en 90 días y 6 piezas alcanza para 18 días: no avisa con 7', () => {
    // 30/90 = 0.33/día → 6 / 0.33 = 18 días
    expect(run([product({ stock: 6, lowStockAt: 1 })]).soonOut).toHaveLength(0);
  });

  it('avisa cuando alcanza para menos días que el límite', () => {
    // 90 vendidas en 90 días = 1/día; 6 piezas = 6 días < 7
    const report = run([product({ stock: 6, lowStockAt: 1, sold90: 90 })]);
    expect(report.soonOut).toHaveLength(1);
    expect(report.soonOut[0].coverDays).toBe(6);
    expect(report.soonOut[0].message).toContain('alcanza para 6 días');
  });

  it('el límite se puede cambiar', () => {
    const item = product({ stock: 10, lowStockAt: 1, sold90: 90 });
    expect(run([item]).soonOut).toHaveLength(0);
    expect(run([item], { coverDays: 14 }).soonOut).toHaveLength(1);
  });

  it('si ya está en poco o agotado, no se repite como "se agota pronto"', () => {
    expect(run([product({ stock: 2, lowStockAt: 5, sold90: 90 })]).soonOut).toHaveLength(0);
    expect(run([product({ stock: 0, sold90: 90 })]).soonOut).toHaveLength(0);
  });

  it('sin ventas no hay ritmo ni cobertura', () => {
    const report = run([product({ sold90: 0, lastSaleAt: null })]);
    expect(report.byAge[0].coverDays).toBeNull();
    expect(report.soonOut).toHaveLength(0);
  });

  it('un producto muy nuevo no inventa un ritmo exagerado (ventana mínima de 14 días)', () => {
    // 14 vendidas en 3 días de vida: ritmo sobre 14 días = 1/día, no 4.7/día
    const report = run([product({ stock: 20, lowStockAt: 1, sold90: 14, createdAt: daysAgo(3), lastEntryAt: null })]);
    expect(report.byAge[0].coverDays).toBe(20);
  });
});

describe('Alertas · resagados', () => {
  it('sin vender en 45 días con existencia: resagado', () => {
    const report = run([product({ lastSaleAt: daysAgo(60), lastEntryAt: daysAgo(100), sold90: 0 })]);
    expect(report.slow).toHaveLength(1);
    expect(report.slow[0].daysSinceSale).toBe(60);
    expect(report.slow[0].message).toBe('Collar: Lleva 60 días sin venderse');
  });

  it('el límite de días se puede cambiar', () => {
    const item = product({ lastSaleAt: daysAgo(30), lastEntryAt: daysAgo(100), sold90: 3 });
    expect(run([item]).slow).toHaveLength(0);
    expect(run([item], { slowDays: 21 }).slow).toHaveLength(1);
  });

  it('nunca vendido y con más de 45 días en inventario: resagado', () => {
    const report = run([product({ lastSaleAt: null, sold90: 0, createdAt: daysAgo(100), lastEntryAt: null })]);
    expect(report.slow[0].message).toBe('Collar: Nunca se ha vendido (lleva 100 días en inventario)');
  });

  it('lo recién llegado no es resagado aunque no se haya vendido', () => {
    expect(run([product({ lastSaleAt: null, sold90: 0, createdAt: daysAgo(5), lastEntryAt: daysAgo(5) })]).slow).toHaveLength(0);
  });

  it('lo que se vendió hace mucho pero acaba de reponerse no es resagado', () => {
    expect(run([product({ lastSaleAt: daysAgo(80), lastEntryAt: daysAgo(3) })]).slow).toHaveLength(0);
  });

  it('si estuvo agotado mucho tiempo y se repuso hace poco, no cuenta como resagado', () => {
    expect(run([product({ lastSaleAt: daysAgo(70), lastEntryAt: daysAgo(5), sold90: 0 })]).slow).toHaveLength(0);
  });

  it('sin existencia no hay nada resagado', () => {
    expect(run([product({ stock: 0, lastSaleAt: daysAgo(90) })]).slow).toHaveLength(0);
  });

  it('el más rezagado aparece primero', () => {
    const report = run([
      product({ id: 'a', name: 'A', lastSaleAt: daysAgo(50), lastEntryAt: daysAgo(200) }),
      product({ id: 'b', name: 'B', lastSaleAt: daysAgo(120), lastEntryAt: daysAgo(200) }),
      product({ id: 'c', name: 'C', lastSaleAt: null, createdAt: daysAgo(80), lastEntryAt: null, sold90: 0 }),
    ]);
    expect(report.slow.map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('Alertas · nuevo y viejo', () => {
  it('clasifica por días desde la última entrada', () => {
    const bucket = (days: number) => run([product({ lastEntryAt: daysAgo(days), lastSaleAt: daysAgo(1) })]).byAge[0].ageBucket;
    expect(bucket(3)).toBe('new');
    expect(bucket(14)).toBe('new');
    expect(bucket(15)).toBe('recent');
    expect(bucket(45)).toBe('recent');
    expect(bucket(46)).toBe('old');
    expect(bucket(90)).toBe('old');
    expect(bucket(91)).toBe('very_old');
  });

  it('sin entradas registradas usa la fecha en que se creó el producto', () => {
    const report = run([product({ lastEntryAt: null, createdAt: daysAgo(120), lastSaleAt: daysAgo(1) })]);
    expect(report.byAge[0].ageDays).toBe(120);
    expect(report.byAge[0].ageBucket).toBe('very_old');
  });

  it('lo más viejo va primero y lo más nuevo en novedades', () => {
    const report = run([
      product({ id: 'nuevo', name: 'N', lastEntryAt: daysAgo(2) }),
      product({ id: 'viejo', name: 'V', lastEntryAt: daysAgo(150) }),
      product({ id: 'medio', name: 'M', lastEntryAt: daysAgo(30) }),
    ]);
    expect(report.byAge.map((i) => i.id)).toEqual(['viejo', 'medio', 'nuevo']);
    expect(report.newArrivals.map((i) => i.id)).toEqual(['nuevo']);
  });

  it('solo lo que tiene existencia entra a la lista por antigüedad', () => {
    const report = run([product({ id: 'a', stock: 0 }), product({ id: 'b' })]);
    expect(report.byAge.map((i) => i.id)).toEqual(['b']);
    expect(report.totals.withStock).toBe(1);
  });

  it('un reloj adelantado no da días negativos', () => {
    const report = run([product({ lastEntryAt: new Date(NOW.getTime() + 3 * 86_400_000), lastSaleAt: null })]);
    expect(report.byAge[0].ageDays).toBe(0);
  });
});

describe('Alertas · fecha límite opcional', () => {
  const at = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

  it('avisa unos días antes', () => {
    const report = run([product({ deadlineAt: at('2026-10-25') })]);
    expect(report.deadline).toHaveLength(1);
    expect(report.deadline[0].deadlineInDays).toBe(9);
    expect(report.deadline[0].kinds).toContain('deadline_soon');
    expect(report.deadline[0].message).toMatch(/su fecha límite es en 9 días y quedan 20/i);
  });

  it('no avisa antes de tiempo', () => {
    expect(run([product({ deadlineAt: at('2026-12-31') })]).deadline).toHaveLength(0);
  });

  it('el día de la fecha límite es "hoy"', () => {
    const item = run([product({ deadlineAt: at('2026-10-16') })]).deadline[0];
    expect(item.deadlineInDays).toBe(0);
    expect(item.message).toMatch(/su fecha límite es hoy/i);
  });

  it('después de la fecha, con existencia: pasó', () => {
    const item = run([product({ deadlineAt: at('2026-10-13') })]).deadline[0];
    expect(item.kinds).toContain('deadline_passed');
    expect(item.message).toMatch(/pasó su fecha límite hace 3 días y aún quedan 20/i);
  });

  it('si ya no queda nada, no hay nada que retirar', () => {
    expect(run([product({ stock: 0, deadlineAt: at('2026-10-01') })]).deadline).toHaveLength(0);
  });

  it('el aviso previo se puede cambiar', () => {
    const item = product({ deadlineAt: at('2026-11-10') });
    expect(run([item]).deadline).toHaveLength(0);
    expect(run([item], { deadlineWarnDays: 30 }).deadline).toHaveLength(1);
  });

  it('cuenta por día calendario en la hora del negocio, no en UTC', () => {
    // 20:00 en México del 16 de octubre = 02:00 UTC del 17 de octubre
    const evening = new Date('2026-10-17T02:00:00Z');
    const deadline = at('2026-10-17');
    expect(daysUntil(deadline, evening, 'America/Mexico_City')).toBe(1);
    expect(daysUntil(deadline, evening, 'UTC')).toBe(0);
  });

  it('el orden es de lo más urgente a lo menos', () => {
    const report = run([
      product({ id: 'a', name: 'A', deadlineAt: at('2026-10-28') }),
      product({ id: 'b', name: 'B', deadlineAt: at('2026-10-10') }),
      product({ id: 'c', name: 'C', deadlineAt: at('2026-10-20') }),
    ]);
    expect(report.deadline.map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('Alertas · ajustes', () => {
  it('valores por defecto cuando no se manda nada o viene basura', () => {
    expect(normalizeSettings()).toEqual(DEFAULT_STOCK_ALERT_SETTINGS);
    expect(normalizeSettings({ slowDays: 'abc', newDays: -4, coverDays: 1.5, agedDays: '' })).toEqual(DEFAULT_STOCK_ALERT_SETTINGS);
  });

  it('acepta números en texto (vienen de la dirección web)', () => {
    expect(normalizeSettings({ slowDays: '30', newDays: '7' })).toMatchObject({ slowDays: 30, newDays: 7 });
  });

  it('respeta los límites', () => {
    expect(normalizeSettings({ slowDays: 1 }).slowDays).toBe(DEFAULT_STOCK_ALERT_SETTINGS.slowDays);
    expect(normalizeSettings({ slowDays: 9999 }).slowDays).toBe(DEFAULT_STOCK_ALERT_SETTINGS.slowDays);
    expect(normalizeSettings({ slowDays: 7 }).slowDays).toBe(7);
  });

  it('"viejo" siempre es más viejo que "nuevo"', () => {
    const settings = normalizeSettings({ newDays: 60, agedDays: 30 });
    expect(settings.agedDays).toBeGreaterThan(settings.newDays);
  });

  it('un producto puede tener varias alertas a la vez', () => {
    const all = run([product({ stock: 3, lastSaleAt: daysAgo(70), lastEntryAt: daysAgo(100), sold90: 0, deadlineAt: new Date('2026-10-20T12:00:00Z') })]);
    expect(all.low).toHaveLength(1);
    expect(all.slow).toHaveLength(1);
    expect(all.deadline).toHaveLength(1);
    expect(all.totals.withAlerts).toBe(1);
    expect(all.low[0].message).toContain('Quedan 3');
    expect(all.low[0].message).toContain('sin venderse');
  });

  it('un producto sano no genera ninguna alerta', () => {
    expect(kinds(product())).toEqual([]);
    expect(run([product()]).totals).toEqual({ products: 1, withStock: 1, withAlerts: 0 });
  });
});

/* ---------------------------------------------------------------- servicio */

describe('Alertas · consulta al servidor', () => {
  function setup() {
    const prisma = {
      company: { findUnique: jest.fn().mockResolvedValue({ id: 'c1' }) },
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'p1', name: 'Playera', sku: 'P1', catalogId: 'cat-bout', trackInventory: true, stock: 99, lowStockAt: 4,
            createdAt: daysAgo(100), seasonal: true, seasonEndsAt: new Date('2026-10-20T12:00:00Z'),
            category: { name: 'Ropa' }, variants: [{ stock: 2 }, { stock: 1 }],
          },
          {
            id: 'p2', name: 'Pluma', sku: null, catalogId: null, trackInventory: true, stock: 40, lowStockAt: 5,
            createdAt: daysAgo(100), seasonal: false, seasonEndsAt: new Date('2026-10-01T12:00:00Z'),
            category: null, variants: [],
          },
        ]),
      },
      posStockMovement: { groupBy: jest.fn().mockResolvedValue([{ productId: 'p1', _max: { createdAt: daysAgo(20) } }]) },
      orderItem: {
        groupBy: jest
          .fn()
          .mockResolvedValueOnce([{ productId: 'p1', _max: { createdAt: daysAgo(1) } }])
          .mockResolvedValueOnce([{ productId: 'p1', _sum: { quantity: 18 } }]),
      },
    };
    return { prisma, service: new CatalogService(prisma as never) };
  }

  it('empresa inexistente', async () => {
    const { prisma, service } = setup();
    prisma.company.findUnique.mockResolvedValue(null);
    await expect(service.stockAlerts('x')).rejects.toThrow(/no existe/);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it('todo se consulta solo de la empresa, solo productos activos que controlan inventario', async () => {
    const { prisma, service } = setup();
    await service.stockAlerts('c1');
    expect(prisma.product.findMany.mock.calls[0][0].where).toEqual({ companyId: 'c1', status: 'active', trackInventory: true });
    expect(prisma.posStockMovement.groupBy.mock.calls[0][0].where).toEqual({ companyId: 'c1', direction: 'in' });
    for (const [args] of prisma.orderItem.groupBy.mock.calls) {
      expect(args.where.order).toMatchObject({ companyId: 'c1', status: 'confirmed', paymentStatus: 'paid' });
    }
  });

  it('suma las tallas activas cuando el producto las tiene, y usa el stock si no', async () => {
    const { service } = setup();
    const report = await service.stockAlerts('c1');
    const playera = report.byAge.find((i) => i.id === 'p1');
    const pluma = report.byAge.find((i) => i.id === 'p2');
    expect(playera?.stock).toBe(3);
    expect(pluma?.stock).toBe(40);
    expect(report.low.map((i) => i.id)).toEqual(['p1']);
  });

  it('la fecha límite solo cuenta si el producto está marcado como de temporada', async () => {
    const { service } = setup();
    const report = await service.stockAlerts('c1');
    expect(report.deadline.map((i) => i.id)).toEqual(['p1']);
  });

  it('pasa los ajustes de la dirección web y la zona horaria válida', async () => {
    const { service } = setup();
    const report = await service.stockAlerts('c1', { slowDays: '30', tz: 'America/Tijuana' });
    expect(report.settings.slowDays).toBe(30);
  });

  it('una zona horaria inventada no rompe el reporte', async () => {
    const { service } = setup();
    await expect(service.stockAlerts('c1', { tz: 'Marte/Olympus' })).resolves.toBeDefined();
  });
});

/* -------------------------------------------------- editar producto: fechas */

describe('Producto · aviso de poca existencia y fecha límite', () => {
  function setup(existing: Record<string, unknown> = {}) {
    const prisma = {
      product: {
        findUnique: jest.fn().mockResolvedValue({ id: 'p1', companyId: 'c1', sku: 'X', seasonStartsAt: null, ...existing }),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockImplementation(({ data }: { data: unknown }) => Promise.resolve(data)),
      },
    };
    return { prisma, service: new CatalogService(prisma as never) };
  }

  it('guarda el aviso de poca existencia', async () => {
    const { prisma, service } = setup();
    await service.updateProduct('p1', { lowStockAt: 12 } as never);
    expect(prisma.product.update.mock.calls[0][0].data).toMatchObject({ lowStockAt: 12, seasonal: undefined, seasonEndsAt: undefined });
  });

  it('poner una fecha límite marca el producto como de temporada', async () => {
    const { prisma, service } = setup();
    await service.updateProduct('p1', { seasonEndsAt: '2026-12-31T12:00:00.000Z' } as never);
    const data = prisma.product.update.mock.calls[0][0].data;
    expect(data.seasonal).toBe(true);
    expect(data.seasonEndsAt).toEqual(new Date('2026-12-31T12:00:00.000Z'));
  });

  it('quitar la fecha límite (null) la borra y deja de ser de temporada', async () => {
    const { prisma, service } = setup();
    await service.updateProduct('p1', { seasonEndsAt: null } as never);
    const data = prisma.product.update.mock.calls[0][0].data;
    expect(data.seasonal).toBe(false);
    expect(data.seasonEndsAt).toBeNull();
  });

  it('no tocar la fecha no la modifica', async () => {
    const { prisma, service } = setup();
    await service.updateProduct('p1', { name: 'Nuevo nombre' } as never);
    const data = prisma.product.update.mock.calls[0][0].data;
    expect(data.seasonal).toBeUndefined();
    expect(data.seasonEndsAt).toBeUndefined();
  });

  it('rechaza una fecha inválida o anterior al inicio de la temporada', async () => {
    const bad = setup();
    await expect(bad.service.updateProduct('p1', { seasonEndsAt: 'no-es-fecha' } as never)).rejects.toBeInstanceOf(BadRequestException);
    const early = setup({ seasonStartsAt: new Date('2026-11-01T00:00:00Z') });
    await expect(early.service.updateProduct('p1', { seasonEndsAt: '2026-10-01T12:00:00.000Z' } as never)).rejects.toThrow(/posterior al inicio/);
    expect(early.prisma.product.update).not.toHaveBeenCalled();
  });
});
