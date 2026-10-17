import { BadRequestException, NotFoundException } from '@nestjs/common';

import { OrderService } from './order.service';

/**
 * De la venta al inventario: confirmar descuenta, cancelar antes de cobrar
 * regresa, y una venta con pagos no se cancela desde caja. Prisma simulado.
 */

type Row = Record<string, any>;
const C = 'c1';

const line = (over: Row = {}) => ({
  id: 'oi1', productId: 'p1', variantId: null, productName: 'Collar', quantity: 2,
  lineTotal: 200, discount: 0, total: 200, ...over,
});
const draft = (over: Row = {}) => ({
  id: 'o1', orderNumber: 'V-1', companyId: C, status: 'draft', paymentStatus: 'pending',
  subtotal: 200, discount: 0, total: 200, reservationId: null, customerId: null, loyaltyProgramId: null,
  items: [line()], ...over,
});

/* --------------------------------------------------------------- confirmar */

function setupConfirm(opts: {
  order?: Row | null;
  priced?: Row;
  product?: Row;
  variant?: Row | null;
  locked?: number;
  stockOk?: boolean;
  variantOk?: boolean;
  reserved?: number;
  blocking?: Array<{ id: string }>;
} = {}) {
  const order = opts.order === undefined ? draft() : opts.order;
  const tx: Row = {
    order: {
      updateMany: jest.fn().mockResolvedValue({ count: opts.locked ?? 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(opts.priced ?? order),
      update: jest.fn().mockImplementation(({ data }: Row) => Promise.resolve({ ...order, ...data })),
    },
    commerceReservation: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue(opts.blocking ?? []),
    },
    commerceReservationItem: { aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: opts.reserved ?? 0 } }) },
    product: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'p1', name: 'Collar', trackInventory: true, stock: 8, ...opts.product }),
      updateMany: jest.fn().mockResolvedValue({ count: opts.stockOk === false ? 0 : 1 }),
    },
    productRecipe: { findUnique: jest.fn().mockResolvedValue(null) },
    productVariant: {
      findUnique: jest.fn().mockResolvedValue(opts.variant === undefined ? { id: 'v1', productId: 'p1', name: 'M', stock: 4 } : opts.variant),
      updateMany: jest.fn().mockResolvedValue({ count: opts.variantOk === false ? 0 : 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ stock: 2 }),
    },
  };
  const prisma: Row = {
    order: { findUnique: jest.fn().mockResolvedValue(order) },
    $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
  };
  return { service: new OrderService(prisma as never), tx, prisma };
}

describe('Venta · confirmar y descontar inventario', () => {
  it('pedido inexistente o que no está en borrador', async () => {
    await expect(setupConfirm({ order: null }).service.confirm('o1')).rejects.toBeInstanceOf(NotFoundException);
    for (const status of ['processing', 'confirmed', 'cancelled']) {
      const { service, prisma } = setupConfirm({ order: draft({ status }) });
      await expect(service.confirm('o1')).rejects.toThrow(/borrador/);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    }
  });

  it('dos cajas confirmando a la vez: solo una pasa', async () => {
    const { service, tx } = setupConfirm({ locked: 0 });
    await expect(service.confirm('o1')).rejects.toThrow(/ya está siendo procesado/);
    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it('descuenta del stock del producto, con la existencia comprobada en la misma consulta', async () => {
    const { service, tx } = setupConfirm();
    const result: any = await service.confirm('o1');
    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', stock: { gte: 2 } },
      data: { stock: { decrement: 2 } },
    });
    expect(tx.order.update.mock.calls[0][0].data).toMatchObject({ status: 'confirmed' });
    expect(result.order.status).toBe('confirmed');
    expect(result.inventoryEffects[0]).toMatchObject({ product: 'Collar', type: 'product' });
  });

  it('sin existencia suficiente no confirma la venta', async () => {
    const { service, tx } = setupConfirm({ stockOk: false });
    await expect(service.confirm('o1')).rejects.toThrow(/No hay existencia suficiente de Collar/);
    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it('con tallas descuenta la talla y no el producto', async () => {
    const { service, tx } = setupConfirm({ order: draft({ items: [line({ variantId: 'v1' })] }) });
    const result: any = await service.confirm('o1');
    expect(tx.productVariant.updateMany).toHaveBeenCalledWith({
      where: { id: 'v1', productId: 'p1', stock: { gte: 2 } },
      data: { stock: { decrement: 2 } },
    });
    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(result.inventoryEffects[0]).toMatchObject({ type: 'variant', detail: 'M: -2. Quedan 2' });
  });

  it('talla agotada: no confirma', async () => {
    const { service, tx } = setupConfirm({ order: draft({ items: [line({ variantId: 'v1' })] }), variantOk: false });
    await expect(service.confirm('o1')).rejects.toThrow(/No hay existencia suficiente de Collar - M/);
    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it('una talla de otro producto no es válida', async () => {
    const { service } = setupConfirm({
      order: draft({ items: [line({ variantId: 'v1' })] }),
      variant: { id: 'v1', productId: 'otro', name: 'M', stock: 4 },
    });
    await expect(service.confirm('o1')).rejects.toThrow(/variante .* no es válida/);
  });

  it('un producto que no controla inventario no se descuenta', async () => {
    const { service, tx } = setupConfirm({ product: { trackInventory: false } });
    await service.confirm('o1');
    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.order.update).toHaveBeenCalled();
  });

  it('stock por pieza: no vende fracciones', async () => {
    const { service, tx } = setupConfirm({ order: draft({ items: [line({ quantity: 1.5, lineTotal: 150, total: 150 })], subtotal: 150, total: 150 }) });
    await expect(service.confirm('o1')).rejects.toThrow(/cantidad entera/);
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });

  it('respeta lo apartado por otros: solo se puede vender lo que no está apartado', async () => {
    const { service, tx } = setupConfirm({ reserved: 5, blocking: [{ id: 'res1' }] });
    await service.confirm('o1');
    expect(tx.product.updateMany.mock.calls[0][0].where).toEqual({ id: 'p1', stock: { gte: 7 } });
  });

  it('libera los apartados vencidos antes de calcular la existencia', async () => {
    const { service, tx } = setupConfirm();
    await service.confirm('o1');
    expect(tx.commerceReservation.updateMany.mock.calls[0][0]).toMatchObject({ where: { companyId: C, status: 'hold' }, data: { status: 'expired' } });
    expect(tx.commerceReservation.updateMany.mock.invocationCallOrder[0]).toBeLessThan(tx.product.updateMany.mock.invocationCallOrder[0]);
  });

  it('los totales del pedido deben cuadrar con sus renglones y descuentos', async () => {
    const wrongTotal = setupConfirm({ priced: draft({ total: 150 }) });
    await expect(wrongTotal.service.confirm('o1')).rejects.toThrow(/totales del pedido no coinciden/);
    expect(wrongTotal.tx.product.updateMany).not.toHaveBeenCalled();

    const wrongDiscount = setupConfirm({ priced: draft({ items: [line({ discount: 50, total: 200 })] }) });
    await expect(wrongDiscount.service.confirm('o1')).rejects.toThrow(/no coinciden/);
  });

  it('con descuento correcto confirma', async () => {
    const priced = draft({ subtotal: 200, discount: 50, total: 150, items: [line({ discount: 50, total: 150 })] });
    const { service } = setupConfirm({ order: priced, priced });
    await expect(service.confirm('o1')).resolves.toBeDefined();
  });
});

/* ---------------------------------------------------------------- cancelar */

function setupCancel(opts: { order?: Row | null; product?: Row | null; reservation?: Row | null } = {}) {
  const order =
    opts.order === null
      ? null
      : { ...draft({ status: 'confirmed', paymentStatus: 'pending' }), notes: null, payments: [], ...opts.order };
  const tx: Row = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    order: {
      findUnique: jest.fn().mockResolvedValue(order),
      update: jest.fn().mockImplementation(({ data }: Row) => Promise.resolve({ ...order, ...data })),
    },
    stockMovement: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    productRecipe: { findMany: jest.fn().mockResolvedValue([]) },
    inventoryItem: { update: jest.fn() },
    product: {
      findUnique: jest.fn().mockResolvedValue(opts.product === undefined ? { id: 'p1', trackInventory: true } : opts.product),
      update: jest.fn().mockResolvedValue({}),
    },
    productVariant: { update: jest.fn().mockResolvedValue({}) },
    commerceReservation: { findFirst: jest.fn().mockResolvedValue(opts.reservation ?? null), update: jest.fn() },
    commerceReservationEvent: { create: jest.fn() },
    orderSplit: { updateMany: jest.fn().mockResolvedValue({}) },
    orderDiscount: { updateMany: jest.fn().mockResolvedValue({}) },
    visit: { updateMany: jest.fn(), count: jest.fn() },
    loyaltyProgram: { findUnique: jest.fn() },
    customerReward: { updateMany: jest.fn() },
  };
  const prisma: Row = { $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)) };
  return { service: new OrderService(prisma as never), tx };
}

describe('Venta · cancelar antes de cobrar', () => {
  it('bloquea la venta mientras la cancela', async () => {
    const { service, tx } = setupCancel();
    await service.cancel('o1');
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.order.findUnique.mock.invocationCallOrder[0]);
  });

  it('una venta confirmada regresa las piezas al stock', async () => {
    const { service, tx } = setupCancel();
    await service.cancel('o1', 'el cliente se arrepintió');
    expect(tx.product.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { stock: { increment: 2 } } });
    const data = tx.order.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: 'cancelled', paymentStatus: 'cancelled' });
    expect(data.notes).toMatch(/el cliente se arrepintió/);
    expect(tx.orderDiscount.updateMany.mock.calls[0][0]).toMatchObject({ where: { orderId: 'o1', status: 'applied' }, data: { status: 'voided' } });
  });

  it('con tallas regresa la talla', async () => {
    const { service, tx } = setupCancel({ order: { items: [line({ variantId: 'v1' })] } });
    await service.cancel('o1');
    expect(tx.productVariant.update).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { stock: { increment: 2 } } });
    expect(tx.product.update).not.toHaveBeenCalled();
  });

  it('un borrador nunca descontó nada, así que no regresa nada', async () => {
    const { service, tx } = setupCancel({ order: { status: 'draft' } });
    await service.cancel('o1');
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(tx.productVariant.update).not.toHaveBeenCalled();
    expect(tx.order.update.mock.calls[0][0].data.status).toBe('cancelled');
  });

  it('no regresa stock de productos que no controlan inventario', async () => {
    const { service, tx } = setupCancel({ product: { id: 'p1', trackInventory: false } });
    await service.cancel('o1');
    expect(tx.product.update).not.toHaveBeenCalled();
  });

  it('una venta con pagos NO se cancela desde caja: se anula con devolución y reembolso', async () => {
    for (const over of [{ payments: [{ id: 'pay1' }] }, { paymentStatus: 'partial' }, { paymentStatus: 'paid' }]) {
      const { service, tx } = setupCancel({ order: over });
      await expect(service.cancel('o1')).rejects.toThrow(/devolución y reembolso/);
      expect(tx.product.update).not.toHaveBeenCalled();
      expect(tx.order.update).not.toHaveBeenCalled();
    }
  });

  it('cancelar dos veces es seguro y no regresa el stock dos veces', async () => {
    const { service, tx } = setupCancel({ order: { status: 'cancelled' } });
    const result: any = await service.cancel('o1');
    expect(result.status).toBe('cancelled');
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it('inexistente, o en un estado que ya no se cancela', async () => {
    await expect(setupCancel({ order: null }).service.cancel('o1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(setupCancel({ order: { status: 'completed' } }).service.cancel('o1')).rejects.toThrow(/ya no puede cancelarse/);
  });

  it('si venía de un apartado, el apartado se reactiva', async () => {
    const { service, tx } = setupCancel({
      order: { reservationId: 'res1' },
      reservation: { id: 'res1', pickupDeadline: new Date(Date.now() + 86_400_000) },
    });
    await service.cancel('o1');
    expect(tx.commerceReservation.update.mock.calls[0][0]).toMatchObject({ data: { status: 'active', orderId: null } });
  });

  it('un apartado vencido vuelve a revisión, no a activo', async () => {
    const { service, tx } = setupCancel({
      order: { reservationId: 'res1' },
      reservation: { id: 'res1', pickupDeadline: new Date(Date.now() - 1000) },
    });
    await service.cancel('o1');
    expect(tx.commerceReservation.update.mock.calls[0][0].data.status).toBe('review_expired');
  });

  it('el motivo se limita a 500 caracteres', async () => {
    const { service, tx } = setupCancel();
    await service.cancel('o1', 'x'.repeat(900));
    const note: string = tx.order.update.mock.calls[0][0].data.notes;
    expect(note.length).toBeLessThan(600);
  });
});
