import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import type { AuthenticatedUser } from '../../auth/auth.types';
import { PosInventoryService } from './pos-inventory.service';

/**
 * Entrada de mercancía (captura manual, por código o desde el celular).
 * Prisma simulado: se prueba que el stock suba exacto, una sola vez, y que
 * ningún dato dudoso llegue a la base.
 */

const actor = { id: 'u1', companyId: 'c1' } as AuthenticatedUser;
const P1 = 'e6815696-5f34-4497-ac89-817718ed25a2';
const P2 = '0b6d3a0e-6a2c-4a3c-9a5a-2f2f3b9f8a11';
const V1 = '7c1d5d4e-0f33-4d0c-8f5e-3d5f0a6b2c99';
const OP = '11111111-2222-4333-8444-555555555555';

type Row = Record<string, any>;

function setup(overrides: { product?: Row | null; recipe?: Row | null; variant?: Row | null; previous?: Row | null } = {}) {
  const product =
    overrides.product === null
      ? null
      : { id: P1, name: 'Cuaderno', status: 'active', trackInventory: true, unitsPerPack: 12, variants: [], ...overrides.product };
  const tx: Record<string, any> = {
    posStockReceipt: {
      create: jest.fn().mockImplementation(({ data }: Row) => Promise.resolve({ id: 'rc1', ...data })),
      findUniqueOrThrow: jest.fn().mockImplementation(({ where }: Row) => Promise.resolve({ id: where.id, movements: [] })),
    },
    product: {
      findFirst: jest.fn().mockResolvedValue(product),
      update: jest.fn().mockImplementation(({ data }: Row) => Promise.resolve({ stock: 100 + (data.stock?.increment ?? 0) })),
    },
    productRecipe: { findUnique: jest.fn().mockResolvedValue(overrides.recipe ?? null) },
    productVariant: {
      findFirst: jest.fn().mockResolvedValue(overrides.variant === undefined ? { id: V1 } : overrides.variant),
      update: jest.fn().mockImplementation(({ data }: Row) => Promise.resolve({ stock: 10 + (data.stock?.increment ?? 0) })),
    },
    posStockMovement: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma: Record<string, any> = {
    posStockReceipt: { findUnique: jest.fn().mockResolvedValue(overrides.previous ?? null) },
    $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
  };
  return { service: new PosInventoryService(prisma as never), tx, prisma };
}

const dto = (lines: Row[], extra: Row = {}) =>
  ({ companyId: 'c1', operationId: OP, sourceName: ' Proveedor ', lines, ...extra }) as never;
const line = (extra: Row = {}) => ({ productId: P1, packs: 5, unitsPerPack: 12, costPerPack: 90, ...extra });

describe('Entrada de mercancía · caso normal', () => {
  it('suma las unidades exactas, guarda el costo por unidad y registra el movimiento', async () => {
    const { service, tx } = setup();
    await service.receive(dto([line()]), actor);
    expect(tx.product.update.mock.calls[0][0]).toEqual({
      where: { id: P1 },
      data: { stock: { increment: 60 }, unitCost: 7.5 },
    });
    expect(tx.posStockMovement.create.mock.calls[0][0].data).toMatchObject({
      companyId: 'c1',
      productId: P1,
      direction: 'in',
      reason: 'goods_receipt',
      quantity: 60,
      balanceAfter: 160,
      packs: 5,
      unitsPerPack: 12,
      costPerPack: 90,
      totalCost: 450,
      unitCost: 7.5,
      actorId: 'u1',
    });
    expect(tx.posStockReceipt.create.mock.calls[0][0].data).toMatchObject({ sourceName: 'Proveedor', totalCost: 450, actorId: 'u1' });
  });

  it('con varios renglones suma el costo total de la recepción', async () => {
    const { service, tx } = setup();
    tx.product.findFirst.mockImplementation(({ where }: Row) => Promise.resolve({ id: where.id, name: 'X', status: 'active', trackInventory: true, unitsPerPack: 12, variants: [] }));
    await service.receive(dto([line(), line({ productId: P2, packs: 2, costPerPack: 33.33 })]), actor);
    expect(tx.posStockReceipt.create.mock.calls[0][0].data.totalCost).toBe(516.66);
    expect(tx.product.update).toHaveBeenCalledTimes(2);
  });

  it('costo desconocido no inventa un costo cero: no toca el costo guardado y el total queda nulo', async () => {
    const { service, tx } = setup();
    await service.receive(dto([line({ costPerPack: undefined })]), actor);
    expect(tx.product.update.mock.calls[0][0].data.unitCost).toBeUndefined();
    expect(tx.posStockReceipt.create.mock.calls[0][0].data.totalCost).toBeNull();
    expect(tx.posStockMovement.create.mock.calls[0][0].data).toMatchObject({ unitCost: null, totalCost: null });
  });

  it('costo cero escrito a propósito sí se guarda como cero', async () => {
    const { service, tx } = setup();
    await service.receive(dto([line({ costPerPack: 0 })]), actor);
    expect(tx.product.update.mock.calls[0][0].data.unitCost).toBe(0);
    expect(tx.posStockReceipt.create.mock.calls[0][0].data.totalCost).toBe(0);
  });

  it('si un renglón no trae costo, el total de la recepción queda nulo (no parcial)', async () => {
    const { service, tx } = setup();
    tx.product.findFirst.mockImplementation(({ where }: Row) => Promise.resolve({ id: where.id, name: 'X', status: 'active', trackInventory: true, unitsPerPack: 12, variants: [] }));
    await service.receive(dto([line(), line({ productId: P2, costPerPack: undefined })]), actor);
    expect(tx.posStockReceipt.create.mock.calls[0][0].data.totalCost).toBeNull();
  });
});

describe('Entrada de mercancía · variantes (tallas, colores)', () => {
  const withVariants = { product: { variants: [{ id: V1 }] } };

  it('exige elegir variante cuando el producto las tiene', async () => {
    const { service, tx } = setup(withVariants);
    await expect(service.receive(dto([line({ unitsPerPack: 1 })]), actor)).rejects.toThrow(/Selecciona una talla/);
    expect(tx.product.update).not.toHaveBeenCalled();
  });

  it('suma al stock de la variante, no al del producto', async () => {
    const { service, tx } = setup(withVariants);
    await service.receive(dto([line({ variantId: V1, unitsPerPack: 1, packs: 3, costPerPack: 100 })]), actor);
    expect(tx.productVariant.update.mock.calls[0][0].data).toMatchObject({ stock: { increment: 3 }, unitCost: 100 });
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(tx.posStockMovement.create.mock.calls[0][0].data).toMatchObject({ variantId: V1, quantity: 3, balanceAfter: 13 });
  });

  it('las variantes se reciben por pieza', async () => {
    const { service } = setup(withVariants);
    await expect(service.receive(dto([line({ variantId: V1, unitsPerPack: 6 })]), actor)).rejects.toThrow(/por pieza/);
  });

  it('variante de otro producto o inactiva', async () => {
    const { service, tx } = setup({ ...withVariants, variant: null });
    await expect(service.receive(dto([line({ variantId: V1, unitsPerPack: 1 })]), actor)).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.productVariant.update).not.toHaveBeenCalled();
  });
});

describe('Entrada de mercancía · productos que no se pueden recibir', () => {
  it('producto de otra empresa o inexistente', async () => {
    const { service, tx } = setup({ product: null });
    await expect(service.receive(dto([line()]), actor)).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.product.findFirst.mock.calls[0][0].where).toEqual({ id: P1, companyId: 'c1' });
    expect(tx.posStockMovement.create).not.toHaveBeenCalled();
  });

  it('producto inactivo', async () => {
    const { service } = setup({ product: { status: 'archived' } });
    await expect(service.receive(dto([line()]), actor)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('producto que no controla existencias', async () => {
    const { service } = setup({ product: { trackInventory: false } });
    await expect(service.receive(dto([line()]), actor)).rejects.toThrow(/no controla existencias/);
  });

  it('producto con receta activa se recibe como ingredientes', async () => {
    const { service } = setup({ recipe: { status: 'active' } });
    await expect(service.receive(dto([line()]), actor)).rejects.toThrow(/receta/);
  });

  it('la presentación debe coincidir con la del producto', async () => {
    const { service, tx } = setup();
    await expect(service.receive(dto([line({ unitsPerPack: 6 })]), actor)).rejects.toThrow(/presentación .* 12 unidades/);
    expect(tx.product.update).not.toHaveBeenCalled();
  });
});

describe('Entrada de mercancía · datos inválidos antes de tocar la base', () => {
  it.each([
    ['sin proveedor', { sourceName: '   ' }],
    ['sin renglones', { lines: [] }],
    ['más de 100 renglones', { lines: Array.from({ length: 101 }, (_, i) => line({ productId: `p-${i}` })) }],
  ])('%s', async (_name, extra) => {
    const { service, prisma } = setup();
    await expect(service.receive({ companyId: 'c1', operationId: OP, sourceName: 'X', lines: [line()], ...extra } as never, actor)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['cajas en cero', { packs: 0 }],
    ['cajas decimales', { packs: 1.5 }],
    ['demasiadas cajas', { packs: 10001 }],
    ['costo negativo', { costPerPack: -1 }],
    ['más de un millón de unidades', { packs: 10000, unitsPerPack: 1000 }],
  ])('%s', async (_name, extra) => {
    const { service, prisma } = setup();
    await expect(service.receive(dto([line(extra)]), actor)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('una recepción de otra empresa se rechaza antes de leer la base', async () => {
    const { service, prisma } = setup();
    await expect(service.receive({ ...(dto([line()]) as object), companyId: 'c2' } as never, actor)).rejects.toThrow();
    expect(prisma.posStockReceipt.findUnique).not.toHaveBeenCalled();
  });
});

describe('Entrada de mercancía · reintentos (celular con mala señal)', () => {
  async function firstHash() {
    const { service, tx } = setup();
    await service.receive(dto([line()]), actor);
    return tx.posStockReceipt.create.mock.calls[0][0].data.payloadHash as string;
  }

  it('repetir la misma operación devuelve la recepción original sin volver a sumar', async () => {
    const hash = await firstHash();
    const { service, prisma } = setup({ previous: { id: 'rc1', companyId: 'c1', payloadHash: hash, movements: [] } });
    const result: any = await service.receive(dto([line()]), actor);
    expect(result.repeated).toBe(true);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('la misma operación con otros datos es conflicto, no una segunda entrada', async () => {
    const { service, prisma } = setup({ previous: { id: 'rc1', companyId: 'c1', payloadHash: 'otro', movements: [] } });
    await expect(service.receive(dto([line({ packs: 6 })]), actor)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('el espacio extra en proveedor no cambia la operación', async () => {
    const a = await firstHash();
    const { service, tx } = setup();
    await service.receive(dto([line()], { sourceName: 'Proveedor' }), actor);
    expect(tx.posStockReceipt.create.mock.calls[0][0].data.payloadHash).toBe(a);
  });

  it('carrera de dos envíos simultáneos con el mismo contenido: gana uno y el otro recibe el mismo resultado', async () => {
    const hash = await firstHash();
    const { service, prisma } = setup();
    prisma.$transaction.mockRejectedValue({ code: 'P2002' });
    prisma.posStockReceipt.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'rc1', companyId: 'c1', payloadHash: hash, movements: [] });
    const result: any = await service.receive(dto([line()]), actor);
    expect(result.repeated).toBe(true);
  });

  it('carrera con contenido distinto es conflicto', async () => {
    const { service, prisma } = setup();
    prisma.$transaction.mockRejectedValue({ code: 'P2002' });
    prisma.posStockReceipt.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'rc1', companyId: 'c1', payloadHash: 'otro', movements: [] });
    await expect(service.receive(dto([line()]), actor)).rejects.toBeInstanceOf(ConflictException);
  });

  it('otros errores se propagan tal cual', async () => {
    const { service, prisma } = setup();
    prisma.$transaction.mockRejectedValue(new Error('boom'));
    await expect(service.receive(dto([line()]), actor)).rejects.toThrow('boom');
  });
});

describe('Publicar productos en la web', () => {
  it('rechaza listas vacías, repetidas o de más de 100', async () => {
    const { service } = setup();
    const call = (productIds: string[]) => service.setVisibility({ companyId: 'c1', productIds, webVisible: true } as never, actor);
    await expect(call([])).rejects.toBeInstanceOf(BadRequestException);
    await expect(call([P1, P1])).rejects.toBeInstanceOf(BadRequestException);
    await expect(call(Array.from({ length: 101 }, (_, i) => `p${i}`))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('actualiza solo productos de la empresa', async () => {
    const { service, prisma } = setup();
    const tx = { product: { count: jest.fn().mockResolvedValue(2), updateMany: jest.fn().mockResolvedValue({ count: 2 }) } };
    prisma.$transaction.mockImplementation((fn: (t: unknown) => unknown) => fn(tx));
    await service.setVisibility({ companyId: 'c1', productIds: [P1, P2], webVisible: false } as never, actor);
    expect(tx.product.updateMany.mock.calls[0][0]).toEqual({ where: { id: { in: [P1, P2] }, companyId: 'c1' }, data: { webVisible: false } });
  });

  it('empresa distinta a la sesión', async () => {
    const { service, prisma } = setup();
    await expect(service.setVisibility({ companyId: 'c2', productIds: [P1], webVisible: true } as never, actor)).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
