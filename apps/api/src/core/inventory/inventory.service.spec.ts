import { BadRequestException, NotFoundException } from '@nestjs/common';

import { InventoryService } from './inventory.service';

/**
 * Inventario de insumos (movimientos, conteos físicos y recepciones). Prisma simulado.
 * Lo que se protege: nunca dejar existencia negativa, que cada movimiento deje
 * rastro con su saldo, que el costo promedio se calcule bien y que nada cruce
 * de una empresa a otra.
 */

type Row = Record<string, any>;
const C = 'c1';

function item(over: Row = {}) {
  return { id: 'i1', companyId: C, name: 'Harina', unit: 'kg', quantity: 10, averageCost: 20, minimumStock: 3, trackingMode: 'quantity', ...over };
}

function setup(opts: { item?: Row | null; supplier?: Row | null; items?: Row[]; decrementCount?: number; company?: Row | null } = {}) {
  const current = opts.item === undefined ? item() : opts.item;
  const items = opts.items ?? (current ? [current] : []);
  const tx: Row = {
    company: { findUnique: jest.fn().mockResolvedValue(opts.company === undefined ? { id: C } : opts.company) },
    supplier: { findUnique: jest.fn().mockResolvedValue(opts.supplier === undefined ? null : opts.supplier) },
    inventoryItem: {
      findUnique: jest.fn().mockImplementation(({ where }: Row) => Promise.resolve(items.find((i) => i.id === where.id) ?? null)),
      findUniqueOrThrow: jest.fn().mockImplementation(({ where }: Row) => {
        const found = items.find((i) => i.id === where.id);
        return found ? Promise.resolve(found) : Promise.reject(new Error('no existe'));
      }),
      update: jest.fn().mockImplementation(({ where, data }: Row) => {
        const found = (items.find((i) => i.id === where.id) ?? current) as Row;
        const quantity = typeof data.quantity === 'object' ? found.quantity + data.quantity.increment : data.quantity ?? found.quantity;
        return Promise.resolve({ ...found, ...data, quantity });
      }),
      updateMany: jest.fn().mockResolvedValue({ count: opts.decrementCount ?? 1 }),
    },
    stockMovement: { create: jest.fn().mockImplementation(({ data }: Row) => Promise.resolve({ id: 'm1', ...data })) },
    inventoryCount: { create: jest.fn().mockResolvedValue({ id: 'k1' }) },
    stockReceipt: {
      create: jest.fn().mockResolvedValue({ id: 'rc1' }),
      findUnique: jest.fn().mockResolvedValue({ id: 'rc1', lines: [] }),
    },
    stockReceiptLine: { create: jest.fn().mockResolvedValue({}) },
  };
  // Tras una salida, la base devuelve la existencia ya descontada.
  tx.inventoryItem.updateMany.mockImplementation(({ data }: Row) => {
    if (opts.decrementCount === 0) return Promise.resolve({ count: 0 });
    if (current && data.quantity?.decrement) current.quantity -= data.quantity.decrement;
    return Promise.resolve({ count: 1 });
  });
  const prisma: Row = {
    $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
    supplier: { findUnique: jest.fn().mockResolvedValue(opts.supplier === undefined ? null : opts.supplier) },
  };
  return { service: new InventoryService(prisma as never), tx, prisma };
}

const move = (over: Row = {}): any => ({ companyId: C, inventoryItemId: 'i1', direction: 'in', reason: 'manual_purchase', quantity: 5, ...over });

describe('Inventario · motivos de un movimiento', () => {
  it.each(['supplier_delivery', 'manual_purchase', 'return', 'adjustment_in'])('%s es un motivo válido de entrada', async (reason) => {
    const { service } = setup({ supplier: { id: 's1', companyId: C } });
    await expect(service.createMovement(move({ reason, supplierId: reason === 'supplier_delivery' ? 's1' : undefined }))).resolves.toBeDefined();
  });

  it.each(['sale', 'consumption', 'spoilage', 'damage', 'expiration', 'adjustment_out'])('%s es un motivo válido de salida', async (reason) => {
    const { service } = setup();
    await expect(service.createMovement(move({ direction: 'out', reason, quantity: 1 }))).resolves.toBeDefined();
  });

  it('una entrada no puede usar motivo de salida, ni al revés', async () => {
    const { service, prisma } = setup();
    await expect(service.createMovement(move({ direction: 'in', reason: 'spoilage' }))).rejects.toThrow(/entrada/);
    await expect(service.createMovement(move({ direction: 'out', reason: 'manual_purchase' }))).rejects.toThrow(/salida/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('entrega de proveedor exige proveedor, y el proveedor debe ser de la empresa', async () => {
    await expect(setup().service.createMovement(move({ reason: 'supplier_delivery' }))).rejects.toThrow(/supplierId/);
    await expect(setup({ supplier: null }).service.createMovement(move({ reason: 'supplier_delivery', supplierId: 's9' }))).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      setup({ supplier: { id: 's1', companyId: 'otra' } }).service.createMovement(move({ reason: 'supplier_delivery', supplierId: 's1' })),
    ).rejects.toThrow(/no pertenece/);
  });

  it('el artículo debe existir y ser de la empresa', async () => {
    await expect(setup({ item: null }).service.createMovement(move())).rejects.toBeInstanceOf(NotFoundException);
    await expect(setup({ item: item({ companyId: 'otra' }) }).service.createMovement(move())).rejects.toThrow(/no pertenece/);
  });
});

describe('Inventario · entradas y costo promedio', () => {
  it('suma a la existencia y deja el saldo en el movimiento', async () => {
    const { service, tx } = setup();
    const result: any = await service.createMovement(move({ quantity: 5 }));
    expect(tx.inventoryItem.update.mock.calls[0][0].data.quantity).toEqual({ increment: 5 });
    expect(tx.stockMovement.create.mock.calls[0][0].data).toMatchObject({ direction: 'in', quantity: 5, balanceAfter: 15, companyId: C, inventoryItemId: 'i1' });
    expect(result.inventory).toMatchObject({ quantity: 15, lowStock: false });
  });

  it('costo promedio ponderado: 10 a $20 + 10 a $30 = $25', async () => {
    const { service, tx } = setup();
    await service.createMovement(move({ quantity: 10, unitCost: 30 }));
    expect(tx.inventoryItem.update.mock.calls[0][0].data.averageCost).toBe(25);
    expect(tx.stockMovement.create.mock.calls[0][0].data).toMatchObject({ unitCost: 30, totalCost: 300 });
  });

  it('sin costo, el promedio no se mueve ni se vuelve cero', async () => {
    const { service, tx } = setup();
    await service.createMovement(move({ quantity: 10 }));
    expect(tx.inventoryItem.update.mock.calls[0][0].data.averageCost).toBe(20);
    expect(tx.stockMovement.create.mock.calls[0][0].data.totalCost).toBeUndefined();
  });

  it('con existencia en cero, el costo nuevo es el promedio', async () => {
    const { service, tx } = setup({ item: item({ quantity: 0, averageCost: 99 }) });
    await service.createMovement(move({ quantity: 4, unitCost: 12 }));
    expect(tx.inventoryItem.update.mock.calls[0][0].data.averageCost).toBe(12);
  });
});

describe('Inventario · salidas', () => {
  it('descuenta solo si alcanza (condición en la misma consulta, no en memoria)', async () => {
    const { service, tx } = setup();
    const result: any = await service.createMovement(move({ direction: 'out', reason: 'consumption', quantity: 4 }));
    expect(tx.inventoryItem.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'i1', quantity: { gte: 4 } },
      data: { quantity: { decrement: 4 } },
    });
    expect(result.movement).toMatchObject({ direction: 'out', balanceAfter: 6 });
  });

  it('sin existencia suficiente no registra el movimiento', async () => {
    const { service, tx } = setup({ decrementCount: 0 });
    await expect(service.createMovement(move({ direction: 'out', reason: 'consumption', quantity: 11 }))).rejects.toThrow(/No hay existencia suficiente/);
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it('avisa existencia baja cuando llega al mínimo', async () => {
    const { service } = setup();
    const result: any = await service.createMovement(move({ direction: 'out', reason: 'spoilage', quantity: 7 }));
    expect(result.inventory).toMatchObject({ quantity: 3, lowStock: true });
  });
});

describe('Inventario · conteo físico', () => {
  const count = (over: Row = {}): any => ({ companyId: C, inventoryItemId: 'i1', countedQuantity: 8, ...over });

  it('si falta mercancía registra la diferencia y una salida de ajuste', async () => {
    const { service, tx } = setup();
    const result: any = await service.countInventory(count({ countedQuantity: 8, reason: 'merma' }));
    expect(result.count).toEqual({ expectedQuantity: 10, countedQuantity: 8, variance: -2, reason: 'merma' });
    expect(tx.stockMovement.create.mock.calls[0][0].data).toMatchObject({ direction: 'out', reason: 'adjustment_out', quantity: 2, balanceAfter: 8 });
    expect(tx.inventoryItem.update.mock.calls[0][0].data.quantity).toBe(8);
  });

  it('si sobra mercancía registra una entrada de ajuste', async () => {
    const { service, tx } = setup();
    const result: any = await service.countInventory(count({ countedQuantity: 12.5 }));
    expect(result.count.variance).toBe(2.5);
    expect(tx.stockMovement.create.mock.calls[0][0].data).toMatchObject({ direction: 'in', reason: 'adjustment_in', quantity: 2.5 });
  });

  it('si coincide, guarda el conteo pero no inventa un movimiento', async () => {
    const { service, tx } = setup();
    const result: any = await service.countInventory(count({ countedQuantity: 10 }));
    expect(result.count.variance).toBe(0);
    expect(tx.inventoryCount.create).toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it('contar en cero deja el artículo en cero', async () => {
    const { service, tx } = setup();
    await service.countInventory(count({ countedQuantity: 0 }));
    expect(tx.inventoryItem.update.mock.calls[0][0].data.quantity).toBe(0);
    expect(tx.stockMovement.create.mock.calls[0][0].data).toMatchObject({ direction: 'out', quantity: 10 });
  });

  it('el artículo debe existir y ser de la empresa', async () => {
    await expect(setup({ item: null }).service.countInventory(count())).rejects.toBeInstanceOf(NotFoundException);
    await expect(setup({ item: item({ companyId: 'otra' }) }).service.countInventory(count())).rejects.toThrow(/no pertenece/);
  });
});

describe('Inventario · recepción de mercancía', () => {
  const receipt = (over: Row = {}): any => ({
    companyId: C,
    sourceType: 'manual_purchase',
    sourceName: 'Mercado',
    lines: [{ inventoryItemId: 'i1', quantity: 2, unitCost: 100, conversionToBase: 5 }],
    ...over,
  });

  it('compra manual exige indicar dónde; proveedor exige supplierId', async () => {
    await expect(setup().service.createReceipt(receipt({ sourceName: '  ' }))).rejects.toThrow(/dónde se realizó/);
    await expect(setup().service.createReceipt(receipt({ sourceType: 'supplier' }))).rejects.toThrow(/supplierId/);
  });

  it('necesita al menos una línea y una empresa existente', async () => {
    await expect(setup().service.createReceipt(receipt({ lines: [] }))).rejects.toThrow(/al menos un producto/);
    await expect(setup({ company: null }).service.createReceipt(receipt())).rejects.toBeInstanceOf(NotFoundException);
  });

  it('convierte la unidad de compra a la unidad base (2 bultos × 5 kg = 10 kg)', async () => {
    const { service, tx } = setup();
    await service.createReceipt(receipt());
    expect(tx.inventoryItem.update.mock.calls[0][0].data.quantity).toEqual({ increment: 10 });
    expect(tx.stockReceiptLine.create.mock.calls[0][0].data).toMatchObject({
      quantity: 2, conversionToBase: 5, stockQuantity: 10, unitCost: 100, baseUnitCost: 20, totalCost: 200,
    });
    expect(tx.stockMovement.create.mock.calls[0][0].data).toMatchObject({ direction: 'in', reason: 'manual_purchase', quantity: 10, balanceAfter: 20 });
  });

  it('el costo del bulto actualiza el promedio por unidad base', async () => {
    const { service, tx } = setup({ item: item({ quantity: 10, averageCost: 10 }) });
    await service.createReceipt(receipt({ lines: [{ inventoryItemId: 'i1', quantity: 2, unitCost: 100, conversionToBase: 5 }] }));
    // 10 kg a $10 + 10 kg a $20 = $15 por kg
    expect(tx.inventoryItem.update.mock.calls[0][0].data.averageCost).toBe(15);
  });

  it('el total del comprobante suma todas sus líneas', async () => {
    const { service, tx } = setup({ items: [item(), item({ id: 'i2', name: 'Azúcar' })] });
    await service.createReceipt(receipt({ lines: [
      { inventoryItemId: 'i1', quantity: 1, unitCost: 50 },
      { inventoryItemId: 'i2', quantity: 3, unitCost: 10 },
    ] }));
    expect(tx.stockReceipt.create.mock.calls[0][0].data.totalCost).toBe(80);
    expect(tx.stockMovement.create).toHaveBeenCalledTimes(2);
  });

  it('un artículo de otra empresa cancela toda la recepción', async () => {
    const { service, tx } = setup({ items: [item(), item({ id: 'i2', companyId: 'otra' })] });
    await expect(service.createReceipt(receipt({ lines: [
      { inventoryItemId: 'i1', quantity: 1 },
      { inventoryItemId: 'i2', quantity: 1 },
    ] }))).rejects.toThrow(/no pertenece/);
    expect(tx.stockReceipt.create).not.toHaveBeenCalled();
    expect(tx.inventoryItem.update).not.toHaveBeenCalled();
  });

  it('un artículo inexistente cancela toda la recepción', async () => {
    const { service, tx } = setup();
    await expect(service.createReceipt(receipt({ lines: [{ inventoryItemId: 'nope', quantity: 1 }] }))).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.stockReceipt.create).not.toHaveBeenCalled();
  });

  it('proveedor ajeno o inexistente', async () => {
    await expect(setup({ supplier: null }).service.createReceipt(receipt({ sourceType: 'supplier', supplierId: 's9' }))).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      setup({ supplier: { id: 's1', companyId: 'otra' } }).service.createReceipt(receipt({ sourceType: 'supplier', supplierId: 's1' })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
