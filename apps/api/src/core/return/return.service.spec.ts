import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { ReturnService } from './return.service';

/**
 * Devoluciones, cambios y reembolsos. Prisma simulado.
 * Lo que se protege: nunca devolver más de lo vendido, que la pieza vuelva al
 * stock solo cuando debe, que el dinero devuelto nunca supere lo devuelto y que
 * un reintento no duplique nada.
 */

type Row = Record<string, any>;

const COMPANY = 'c1';
const item = (over: Row = {}) => ({
  id: 'oi1',
  productId: 'p1',
  variantId: null,
  productName: 'Collar',
  sku: 'C1',
  quantity: 3,
  total: 100,
  variant: null,
  product: { id: 'p1', trackInventory: true, recipe: null },
  ...over,
});
const sale = (over: Row = {}) => ({
  id: 'o1',
  companyId: COMPANY,
  status: 'confirmed',
  paymentStatus: 'paid',
  items: [item()],
  returns: [],
  ...over,
});
const dto = (over: Row = {}): any => ({
  companyId: COMPANY,
  orderId: 'o1',
  authorizedById: 'u1',
  reason: 'customer_changed_mind',
  items: [{ orderItemId: 'oi1', quantity: 1, condition: 'sellable', disposition: 'restock' }],
  ...over,
});

/* ------------------------------------------------------------------ crear */

function setupCreate(opts: { order?: Row | null; user?: Row | null; company?: Row | null; active?: Row | null; exchange?: Row | null; existing?: Row | null } = {}) {
  const order = opts.order === undefined ? sale() : opts.order;
  const tx: Row = {
    company: { findUnique: jest.fn().mockResolvedValue(opts.company === undefined ? { id: COMPANY } : opts.company) },
    user: { findUnique: jest.fn().mockResolvedValue(opts.user === undefined ? { id: 'u1', companyId: COMPANY, status: 'active' } : opts.user) },
    order: {
      findUnique: jest.fn().mockImplementation(({ where }: Row) =>
        Promise.resolve(where.id === 'o1' ? order : where.id === 'ex1' ? opts.exchange ?? null : null),
      ),
    },
    return: {
      findFirst: jest.fn().mockImplementation(({ where }: Row) =>
        Promise.resolve(where.operationId ? opts.existing ?? null : opts.active ?? null),
      ),
      create: jest.fn().mockImplementation(({ data }: Row) => Promise.resolve({ id: 'r1', ...data })),
    },
  };
  const prisma: Row = {
    $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
    return: {
      findFirst: jest.fn().mockResolvedValue(opts.existing ?? null),
      findUnique: jest.fn().mockResolvedValue({ id: 'r-existing', items: [], refunds: [] }),
    },
  };
  return { service: new ReturnService(prisma as never), tx, prisma };
}

describe('Devoluciones · crear', () => {
  it('crea un borrador con el importe proporcional al precio pagado', async () => {
    const { service, tx } = setupCreate();
    const result: any = await service.create(dto());
    const data = tx.return.create.mock.calls[0][0].data;
    expect(data.status).toBe('draft');
    expect(data.type).toBe('return');
    expect(data.totalAmount).toBe(33.33);
    expect(data.items.create[0]).toMatchObject({ orderItemId: 'oi1', quantity: 1, lineTotal: 33.33, refundAmount: 33.33, restockedQuantity: 0 });
    expect(result.id).toBe('r1');
  });

  it('devolver todo suma exactamente lo pagado, sin centavos de más ni de menos', async () => {
    const first = setupCreate();
    await first.service.create(dto({ items: [{ orderItemId: 'oi1', quantity: 1, condition: 'sellable', disposition: 'restock' }] }));
    const a = first.tx.return.create.mock.calls[0][0].data.totalAmount;

    const second = setupCreate({ order: sale({ returns: [{ items: [{ orderItemId: 'oi1', quantity: 1 }] }] }) });
    await second.service.create(dto({ items: [{ orderItemId: 'oi1', quantity: 2, condition: 'sellable', disposition: 'restock' }] }));
    const b = second.tx.return.create.mock.calls[0][0].data.totalAmount;

    expect(a).toBe(33.33);
    expect(b).toBe(66.67);
    expect(Math.round((a + b) * 100) / 100).toBe(100);
  });

  it('un reintento con el mismo operationId devuelve la devolución existente y no crea otra', async () => {
    const { service, prisma, tx } = setupCreate({ existing: { id: 'r-existing' } });
    await service.create(dto({ operationId: 'a3c1f3a8-5d2b-4a3c-9a10-111111111111' }));
    expect(prisma.return.findUnique).toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.return.create).not.toHaveBeenCalled();
  });

  it('empresa o autorizador inexistente', async () => {
    await expect(setupCreate({ company: null }).service.create(dto())).rejects.toBeInstanceOf(NotFoundException);
    await expect(setupCreate({ user: null }).service.create(dto())).rejects.toBeInstanceOf(NotFoundException);
  });

  it('el autorizador debe ser de la empresa y estar activo', async () => {
    await expect(setupCreate({ user: { id: 'u1', companyId: 'otra', status: 'active' } }).service.create(dto())).rejects.toThrow(/no pertenece/);
    await expect(setupCreate({ user: { id: 'u1', companyId: COMPANY, status: 'inactive' } }).service.create(dto())).rejects.toThrow(/no está activo/);
  });

  it('venta inexistente, de otra empresa, sin confirmar o sin pagar', async () => {
    await expect(setupCreate({ order: null }).service.create(dto())).rejects.toBeInstanceOf(NotFoundException);
    await expect(setupCreate({ order: sale({ companyId: 'otra' }) }).service.create(dto())).rejects.toThrow(/no pertenece/);
    await expect(setupCreate({ order: sale({ status: 'draft' }) }).service.create(dto())).rejects.toThrow(/confirmada/);
    await expect(setupCreate({ order: sale({ status: 'cancelled' }) }).service.create(dto())).rejects.toThrow(/confirmada/);
    await expect(setupCreate({ order: sale({ paymentStatus: 'partial' }) }).service.create(dto())).rejects.toThrow(/pagadas/);
    await expect(setupCreate({ order: sale({ paymentStatus: 'pending' }) }).service.create(dto())).rejects.toThrow(/pagadas/);
  });

  it('no permite dos devoluciones abiertas de la misma venta', async () => {
    const { service, tx } = setupCreate({ active: { id: 'r-abierta' } });
    await expect(service.create(dto())).rejects.toBeInstanceOf(ConflictException);
    expect(tx.return.create).not.toHaveBeenCalled();
  });

  it('no devuelve más de lo vendido', async () => {
    const { service, tx } = setupCreate();
    await expect(
      service.create(dto({ items: [{ orderItemId: 'oi1', quantity: 4, condition: 'sellable', disposition: 'restock' }] })),
    ).rejects.toThrow(/Quedan 3 disponibles/);
    expect(tx.return.create).not.toHaveBeenCalled();
  });

  it('descuenta lo ya devuelto antes', async () => {
    const { service } = setupCreate({ order: sale({ returns: [{ items: [{ orderItemId: 'oi1', quantity: 2 }] }] }) });
    await expect(
      service.create(dto({ items: [{ orderItemId: 'oi1', quantity: 2, condition: 'sellable', disposition: 'restock' }] })),
    ).rejects.toThrow(/Quedan 1 disponibles/);
  });

  it('rechaza un producto repetido o que no es de la venta', async () => {
    const line = { orderItemId: 'oi1', quantity: 1, condition: 'sellable', disposition: 'restock' };
    await expect(setupCreate().service.create(dto({ items: [line, line] }))).rejects.toThrow(/repetirse/);
    await expect(setupCreate().service.create(dto({ items: [{ ...line, orderItemId: 'otro' }] }))).rejects.toThrow(/no pertenece a la venta/);
  });

  describe('regreso al stock', () => {
    const restock = (over: Row) => dto({ items: [{ orderItemId: 'oi1', quantity: 1, condition: 'sellable', disposition: 'restock', ...over }] });

    it.each(['opened', 'damaged', 'defective', 'incomplete', 'prepared', 'consumed', 'other'])(
      'una pieza %s no puede volver al stock vendible',
      async (condition) => {
        await expect(setupCreate().service.create(restock({ condition }))).rejects.toThrow(/sellable/);
      },
    );

    it('no repone productos con receta ni sin control de inventario', async () => {
      const recipe = sale({ items: [item({ product: { id: 'p1', trackInventory: true, recipe: { status: 'active' } } })] });
      await expect(setupCreate({ order: recipe }).service.create(restock({}))).rejects.toThrow(/receta/);
      const free = sale({ items: [item({ product: { id: 'p1', trackInventory: false, recipe: null } })] });
      await expect(setupCreate({ order: free }).service.create(restock({}))).rejects.toThrow(/no controla inventario/);
    });

    it('stock por pieza: cantidad entera', async () => {
      await expect(setupCreate().service.create(restock({ quantity: 1.5 }))).rejects.toThrow(/entera/);
    });

    it.each(['quarantine', 'discard', 'no_restock'])('con destino %s no exige condición vendible', async (disposition) => {
      const { service, tx } = setupCreate();
      await service.create(restock({ condition: 'damaged', disposition }));
      expect(tx.return.create).toHaveBeenCalled();
    });
  });

  describe('cambios', () => {
    const exchangeDto = (over: Row = {}) => dto({ type: 'exchange', exchangeOrderId: 'ex1', ...over });
    const openExchange = { id: 'ex1', companyId: COMPANY, status: 'confirmed', total: 200, payments: [{ amount: 50 }] };

    it('un cambio necesita la nueva orden y un retorno no puede traerla', async () => {
      await expect(setupCreate().service.create(dto({ type: 'exchange' }))).rejects.toThrow(/exchangeOrderId/);
      await expect(setupCreate().service.create(dto({ exchangeOrderId: 'ex1' }))).rejects.toThrow(/solo puede utilizarse en un cambio/);
    });

    it('la nueva orden debe ser distinta, existir, ser de la empresa y estar confirmada', async () => {
      await expect(setupCreate().service.create(exchangeDto({ exchangeOrderId: 'o1' }))).rejects.toThrow(/diferente/);
      await expect(setupCreate({ exchange: null }).service.create(exchangeDto())).rejects.toBeInstanceOf(NotFoundException);
      await expect(setupCreate({ exchange: { ...openExchange, companyId: 'otra' } }).service.create(exchangeDto())).rejects.toThrow(/no pertenece/);
      await expect(setupCreate({ exchange: { ...openExchange, status: 'draft' } }).service.create(exchangeDto())).rejects.toThrow(/confirmada/);
    });

    it('la nueva orden no puede estar ya pagada', async () => {
      await expect(
        setupCreate({ exchange: { ...openExchange, payments: [{ amount: 200 }] } }).service.create(exchangeDto()),
      ).rejects.toThrow(/completamente pagada/);
    });

    it('crea el cambio ligado a la nueva orden', async () => {
      const { service, tx } = setupCreate({ exchange: openExchange });
      await service.create(exchangeDto());
      expect(tx.return.create.mock.calls[0][0].data).toMatchObject({ type: 'exchange', exchangeOrderId: 'ex1' });
    });
  });
});

/* -------------------------------------------------------------- confirmar */

function returnRow(over: Row = {}) {
  return {
    id: 'r1',
    companyId: COMPANY,
    type: 'return',
    status: 'processing',
    totalAmount: 33.33,
    returnNumber: 'RET-1',
    order: { id: 'o1', status: 'confirmed', paymentStatus: 'paid' },
    exchangeOrder: null,
    items: [
      { id: 'ri1', orderItemId: 'oi1', quantity: 1, condition: 'sellable', disposition: 'restock', orderItem: item() },
    ],
    ...over,
  };
}

function setupConfirm(opts: { status?: string | null; locked?: number; row?: Row; prior?: Row[]; variantCount?: number; productCount?: number } = {}) {
  const tx: Row = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    return: {
      updateMany: jest.fn().mockResolvedValue({ count: opts.locked ?? 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(opts.row ?? returnRow()),
      update: jest.fn().mockImplementation(({ data }: Row) => Promise.resolve({ id: 'r1', ...data })),
    },
    returnItem: { findMany: jest.fn().mockResolvedValue(opts.prior ?? []), update: jest.fn().mockResolvedValue({}) },
    productVariant: {
      updateMany: jest.fn().mockResolvedValue({ count: opts.variantCount ?? 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ stock: 9 }),
    },
    product: {
      updateMany: jest.fn().mockResolvedValue({ count: opts.productCount ?? 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ stock: 7 }),
    },
    payment: { create: jest.fn().mockResolvedValue({}) },
    order: { update: jest.fn().mockResolvedValue({}) },
  };
  const prisma: Row = {
    return: {
      findUnique: jest.fn().mockResolvedValue(
        opts.status === null ? null : { id: 'r1', orderId: 'o1', status: opts.status ?? 'draft' },
      ),
    },
    $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
  };
  return { service: new ReturnService(prisma as never), tx, prisma };
}

describe('Devoluciones · confirmar', () => {
  it('devolución inexistente', async () => {
    await expect(setupConfirm({ status: null }).service.confirm('r1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each(['processing', 'completed', 'cancelled'])('solo se confirma un borrador (no %s)', async (status) => {
    const { service, prisma } = setupConfirm({ status });
    await expect(service.confirm('r1')).rejects.toThrow(/borrador/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('bloquea la venta antes de tocar nada y evita el doble confirmado', async () => {
    const { service, tx } = setupConfirm();
    await service.confirm('r1');
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.return.updateMany.mock.invocationCallOrder[0]);

    const raced = setupConfirm({ locked: 0 });
    await expect(raced.service.confirm('r1')).rejects.toThrow(/ya está siendo procesada/);
    expect(raced.tx.product.updateMany).not.toHaveBeenCalled();
  });

  it('suma la pieza al stock del producto y termina la devolución', async () => {
    const { service, tx } = setupConfirm();
    const result: any = await service.confirm('r1');
    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', companyId: COMPANY },
      data: { stock: { increment: 1 } },
    });
    expect(tx.returnItem.update).toHaveBeenCalledWith({ where: { id: 'ri1' }, data: { restockedQuantity: 1 } });
    expect(tx.return.update.mock.calls[0][0].data).toMatchObject({ status: 'completed' });
    expect(result.inventoryEffects[0]).toMatchObject({ type: 'product', detail: 'Stock: +1. Quedan 7' });
  });

  it('si la pieza era de una talla, sube el stock de esa talla y no el del producto', async () => {
    const row = returnRow({
      items: [{ id: 'ri1', orderItemId: 'oi1', quantity: 2, condition: 'sellable', disposition: 'restock', orderItem: item({ variantId: 'v1', variant: { name: 'M' } }) }],
    });
    const { service, tx } = setupConfirm({ row });
    const result: any = await service.confirm('r1');
    expect(tx.productVariant.updateMany).toHaveBeenCalledWith({
      where: { id: 'v1', productId: 'p1' },
      data: { stock: { increment: 2 } },
    });
    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(result.inventoryEffects[0].detail).toBe('M: +2. Quedan 9');
  });

  it.each(['quarantine', 'discard', 'no_restock'])('con destino %s el stock vendible no cambia', async (disposition) => {
    const row = returnRow({
      items: [{ id: 'ri1', orderItemId: 'oi1', quantity: 1, condition: 'damaged', disposition, orderItem: item() }],
    });
    const { service, tx } = setupConfirm({ row });
    const result: any = await service.confirm('r1');
    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.productVariant.updateMany).not.toHaveBeenCalled();
    expect(result.inventoryEffects[0].detail).toMatch(/No regresó al stock vendible/);
  });

  it('revalida al confirmar: no deja devolver más de lo comprado aunque otra devolución se haya terminado antes', async () => {
    const row = returnRow({ items: [{ id: 'ri1', orderItemId: 'oi1', quantity: 2, condition: 'sellable', disposition: 'restock', orderItem: item() }] });
    const { service, tx } = setupConfirm({ row, prior: [{ orderItemId: 'oi1', quantity: 2 }] });
    await expect(service.confirm('r1')).rejects.toThrow(/supera la cantidad comprada/);
    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.return.update).not.toHaveBeenCalled();
  });

  it('si la venta ya no está confirmada o pagada, no devuelve nada', async () => {
    await expect(setupConfirm({ row: returnRow({ order: { id: 'o1', status: 'cancelled', paymentStatus: 'paid' } }) }).service.confirm('r1')).rejects.toThrow(/ya no está confirmada/);
    await expect(setupConfirm({ row: returnRow({ order: { id: 'o1', status: 'confirmed', paymentStatus: 'partial' } }) }).service.confirm('r1')).rejects.toThrow(/completamente pagada/);
  });

  it('si el producto desapareció, falla y no marca la devolución como terminada', async () => {
    const { service, tx } = setupConfirm({ productCount: 0 });
    await expect(service.confirm('r1')).rejects.toThrow(/ya no está disponible/);
    expect(tx.return.update).not.toHaveBeenCalled();
  });

  it('rechaza reponer lo que dejó de cumplir las condiciones', async () => {
    const recipe = returnRow({ items: [{ id: 'ri1', orderItemId: 'oi1', quantity: 1, condition: 'sellable', disposition: 'restock', orderItem: item({ product: { id: 'p1', trackInventory: true, recipe: { status: 'active' } } }) }] });
    await expect(setupConfirm({ row: recipe }).service.confirm('r1')).rejects.toThrow(/receta/);
    const damaged = returnRow({ items: [{ id: 'ri1', orderItemId: 'oi1', quantity: 1, condition: 'damaged', disposition: 'restock', orderItem: item() }] });
    await expect(setupConfirm({ row: damaged }).service.confirm('r1')).rejects.toThrow(/condición/);
  });

  describe('cambio', () => {
    const exchangeRow = (paid: number, total: number, credit = 33.33): any =>
      returnRow({
        type: 'exchange',
        totalAmount: credit,
        exchangeOrder: { id: 'ex1', companyId: COMPANY, status: 'confirmed', total, orderNumber: 'V-2', payments: paid ? [{ amount: paid }] : [] },
      });

    it('aplica la devolución como crédito a la nueva orden y deja la diferencia por pagar', async () => {
      const { service, tx } = setupConfirm({ row: exchangeRow(0, 100) });
      const result: any = await service.confirm('r1');
      expect(tx.payment.create.mock.calls[0][0].data).toMatchObject({
        method: 'return_credit', status: 'completed', amount: 33.33, orderId: 'ex1', sourceReturnId: 'r1',
      });
      expect(tx.order.update).toHaveBeenCalledWith({ where: { id: 'ex1' }, data: { paymentStatus: 'partial' } });
      expect(result.exchange).toMatchObject({ creditApplied: 33.33, differenceToPay: 66.67, refundableBalance: 0 });
    });

    it('si el crédito cubre todo, la nueva orden queda pagada y sobra saldo a reembolsar', async () => {
      const { service, tx } = setupConfirm({ row: exchangeRow(0, 20) });
      const result: any = await service.confirm('r1');
      expect(tx.payment.create.mock.calls[0][0].data.amount).toBe(20);
      expect(tx.order.update).toHaveBeenCalledWith({ where: { id: 'ex1' }, data: { paymentStatus: 'paid' } });
      expect(result.exchange).toMatchObject({ creditApplied: 20, differenceToPay: 0, refundableBalance: 13.33 });
    });

    it('el crédito nunca supera lo que falta por pagar', async () => {
      const { service, tx } = setupConfirm({ row: exchangeRow(90, 100) });
      await service.confirm('r1');
      expect(tx.payment.create.mock.calls[0][0].data.amount).toBe(10);
    });

    it('rechaza una nueva orden ya pagada, ausente, ajena o sin confirmar', async () => {
      await expect(setupConfirm({ row: exchangeRow(100, 100) }).service.confirm('r1')).rejects.toThrow(/completamente pagada/);
      await expect(setupConfirm({ row: returnRow({ type: 'exchange', exchangeOrder: null }) }).service.confirm('r1')).rejects.toThrow(/no tiene nueva orden/);
      const foreign = exchangeRow(0, 100);
      (foreign.exchangeOrder as Row).companyId = 'otra';
      await expect(setupConfirm({ row: foreign }).service.confirm('r1')).rejects.toThrow(/no pertenece/);
      const draft = exchangeRow(0, 100);
      (draft.exchangeOrder as Row).status = 'draft';
      await expect(setupConfirm({ row: draft }).service.confirm('r1')).rejects.toThrow(/confirmada/);
    });
  });
});

/* --------------------------------------------------------------- cancelar */

describe('Devoluciones · cancelar', () => {
  function setup(count: number, existing: Row | null = { status: 'completed' }) {
    const prisma: Row = {
      return: {
        updateMany: jest.fn().mockResolvedValue({ count }),
        findUnique: jest.fn().mockResolvedValue(existing),
      },
    };
    return { service: new ReturnService(prisma as never), prisma };
  }

  it('cancela solo borradores', async () => {
    const { service, prisma } = setup(1, { id: 'r1', items: [], refunds: [] });
    await service.cancel('r1');
    expect(prisma.return.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'r1', status: 'draft' },
      data: { status: 'cancelled' },
    });
  });

  it('no cancela una devolución ya terminada ni en proceso', async () => {
    await expect(setup(0).service.cancel('r1')).rejects.toThrow(/en borrador/);
  });

  it('devolución inexistente', async () => {
    await expect(setup(0, null).service.cancel('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});

/* ------------------------------------------------------------ reembolsos */

function setupRefund(opts: {
  ret?: Row | null;
  user?: Row | null;
  payment?: Row | null;
  existingRefund?: Row | null;
  paymentRefunded?: number;
  orderRefunded?: number;
  outerReturn?: Row | null;
} = {}) {
  const returnRecord =
    opts.ret === null
      ? null
      : {
          id: 'r1',
          companyId: COMPANY,
          orderId: 'o1',
          status: 'completed',
          totalAmount: 100,
          refunds: [],
          creditPayment: null,
          order: { id: 'o1', total: 100, orderNumber: 'V-1', customerId: null, loyaltyProgramId: null, payments: [] },
          ...opts.ret,
        };
  const tx: Row = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    return: { findUnique: jest.fn().mockResolvedValue(returnRecord) },
    user: { findUnique: jest.fn().mockResolvedValue(opts.user === undefined ? { id: 'u1', companyId: COMPANY, status: 'active' } : opts.user) },
    refund: {
      findFirst: jest.fn().mockResolvedValue(opts.existingRefund ?? null),
      aggregate: jest.fn().mockImplementation(({ where }: Row) =>
        Promise.resolve({ _sum: { amount: where.paymentId ? opts.paymentRefunded ?? 0 : opts.orderRefunded ?? 0 } }),
      ),
      create: jest.fn().mockImplementation(({ data }: Row) => Promise.resolve({ id: 'rf1', ...data })),
    },
    payment: { findUnique: jest.fn().mockResolvedValue(opts.payment === undefined ? null : opts.payment) },
    visit: { findMany: jest.fn().mockResolvedValue([{ id: 'v1' }]), updateMany: jest.fn().mockResolvedValue({ count: 1 }), count: jest.fn().mockResolvedValue(0) },
    scratchAttempt: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    scratchPrize: { update: jest.fn() },
    loyaltyProgram: { findUnique: jest.fn().mockResolvedValue({ requiredVisits: 5 }) },
    customerReward: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const prisma: Row = {
    return: { findUnique: jest.fn().mockResolvedValue(opts.outerReturn === undefined ? (returnRecord ? { id: 'r1', companyId: COMPANY } : null) : opts.outerReturn) },
    refund: { findFirst: jest.fn().mockResolvedValue(opts.existingRefund ?? null) },
    $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
  };
  return { service: new ReturnService(prisma as never), tx, prisma };
}
const refundDto = (over: Row = {}): any => ({ processedById: 'u1', method: 'cash', ...over });

describe('Reembolsos', () => {
  it('sin monto, devuelve todo el saldo disponible', async () => {
    const { service, tx } = setupRefund();
    const result: any = await service.createRefund('r1', refundDto());
    expect(tx.refund.create.mock.calls[0][0].data).toMatchObject({ amount: 100, status: 'completed', method: 'cash', returnId: 'r1', companyId: COMPANY });
    expect(result.summary).toEqual({ returnAmount: 100, exchangeCreditApplied: 0, previouslyRefunded: 0, refundedNow: 100, remainingToRefund: 0 });
  });

  it('permite reembolsos parciales y el siguiente solo ve lo que falta', async () => {
    const first = setupRefund();
    const a: any = await first.service.createRefund('r1', refundDto({ amount: 40 }));
    expect(a.summary.remainingToRefund).toBe(60);

    const second = setupRefund({ ret: { refunds: [{ amount: 40 }] } });
    const b: any = await second.service.createRefund('r1', refundDto());
    expect(b.summary).toMatchObject({ previouslyRefunded: 40, refundedNow: 60, remainingToRefund: 0 });
  });

  it('nunca reembolsa más que el saldo', async () => {
    const { service, tx } = setupRefund({ ret: { refunds: [{ amount: 70 }] } });
    await expect(service.createRefund('r1', refundDto({ amount: 30.01 }))).rejects.toThrow(/saldo disponible de \$30/);
    expect(tx.refund.create).not.toHaveBeenCalled();
  });

  it('una devolución ya reembolsada por completo no admite más dinero', async () => {
    const { service, tx } = setupRefund({ ret: { refunds: [{ amount: 100 }] } });
    await expect(service.createRefund('r1', refundDto())).rejects.toThrow(/ya no tiene saldo/);
    expect(tx.refund.create).not.toHaveBeenCalled();
  });

  it('el crédito aplicado a un cambio se descuenta del saldo reembolsable', async () => {
    const { service } = setupRefund({ ret: { creditPayment: { amount: 80 } } });
    const result: any = await service.createRefund('r1', refundDto());
    expect(result.refund.amount).toBe(20);
    expect(result.summary.exchangeCreditApplied).toBe(80);
  });

  it('un cambio cubierto por completo con crédito no deja nada que reembolsar', async () => {
    const { service } = setupRefund({ ret: { creditPayment: { amount: 100 } } });
    await expect(service.createRefund('r1', refundDto())).rejects.toThrow(/ya no tiene saldo/);
  });

  it('solo se reembolsa una devolución ya confirmada', async () => {
    for (const status of ['draft', 'processing', 'cancelled']) {
      const { service, tx } = setupRefund({ ret: { status } });
      await expect(service.createRefund('r1', refundDto())).rejects.toThrow(/confirmada/);
      expect(tx.refund.create).not.toHaveBeenCalled();
    }
  });

  it('devolución inexistente', async () => {
    await expect(setupRefund({ ret: null }).service.createRefund('r1', refundDto())).rejects.toBeInstanceOf(NotFoundException);
  });

  it('quien procesa debe existir, ser de la empresa y estar activo', async () => {
    await expect(setupRefund({ user: null }).service.createRefund('r1', refundDto())).rejects.toBeInstanceOf(NotFoundException);
    await expect(setupRefund({ user: { id: 'u1', companyId: 'otra', status: 'active' } }).service.createRefund('r1', refundDto())).rejects.toThrow(/no pertenece/);
    await expect(setupRefund({ user: { id: 'u1', companyId: COMPANY, status: 'inactive' } }).service.createRefund('r1', refundDto())).rejects.toThrow(/no está activo/);
  });

  it('un reintento con el mismo operationId no duplica el reembolso', async () => {
    const { service, prisma, tx } = setupRefund({ existingRefund: { id: 'rf-previo', amount: 100 } });
    const result: any = await service.createRefund('r1', refundDto({ operationId: 'a3c1f3a8-5d2b-4a3c-9a10-222222222222' }));
    expect(result.id).toBe('rf-previo');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.refund.create).not.toHaveBeenCalled();
  });

  it('bloquea la devolución mientras reembolsa (evita dos reembolsos simultáneos)', async () => {
    const { service, tx } = setupRefund();
    await service.createRefund('r1', refundDto());
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.return.findUnique.mock.invocationCallOrder[0]);
  });

  describe('contra un pago original', () => {
    const card = { id: 'pay1', orderId: 'o1', companyId: COMPANY, status: 'completed', method: 'card', amount: 60 };

    it('tarjeta exige indicar el pago original', async () => {
      await expect(setupRefund().service.createRefund('r1', refundDto({ method: 'card' }))).rejects.toThrow(/necesita el paymentId/);
    });

    it('el pago debe existir, ser de esa venta y de la empresa, y estar completado', async () => {
      await expect(setupRefund({ payment: null }).service.createRefund('r1', refundDto({ method: 'card', paymentId: 'pay1' }))).rejects.toBeInstanceOf(NotFoundException);
      await expect(setupRefund({ payment: { ...card, orderId: 'otra-venta' } }).service.createRefund('r1', refundDto({ method: 'card', paymentId: 'pay1' }))).rejects.toThrow(/no pertenece a la venta/);
      await expect(setupRefund({ payment: { ...card, companyId: 'otra' } }).service.createRefund('r1', refundDto({ method: 'card', paymentId: 'pay1' }))).rejects.toThrow(/no pertenece a la venta/);
      await expect(setupRefund({ payment: { ...card, status: 'failed' } }).service.createRefund('r1', refundDto({ method: 'card', paymentId: 'pay1' }))).rejects.toThrow(/pago completado/);
    });

    it('un reembolso a tarjeta no puede apuntar a un pago en efectivo', async () => {
      await expect(setupRefund({ payment: { ...card, method: 'cash' } }).service.createRefund('r1', refundDto({ method: 'card', paymentId: 'pay1' }))).rejects.toThrow(/no corresponde a una tarjeta/);
    });

    it('no devuelve a un pago más de lo que ese pago aportó', async () => {
      const { service, tx } = setupRefund({ payment: card, paymentRefunded: 30 });
      await expect(service.createRefund('r1', refundDto({ method: 'card', paymentId: 'pay1', amount: 40 }))).rejects.toThrow(/solo tiene \$30/);
      expect(tx.refund.create).not.toHaveBeenCalled();
    });

    it('reembolso a tarjeta dentro del límite del pago', async () => {
      const { service, tx } = setupRefund({ payment: card, paymentRefunded: 10 });
      await service.createRefund('r1', refundDto({ method: 'card', paymentId: 'pay1', amount: 50 }));
      expect(tx.refund.create.mock.calls[0][0].data).toMatchObject({ amount: 50, paymentId: 'pay1', method: 'card' });
    });
  });

  describe('programa de lealtad', () => {
    const loyalOrder = { id: 'o1', total: 100, orderNumber: 'V-1', customerId: 'cu1', loyaltyProgramId: 'lp1', payments: [] };

    it('al reembolsar la venta completa se anula la visita y los premios sin canjear', async () => {
      const { service, tx } = setupRefund({ ret: { order: loyalOrder }, orderRefunded: 100 });
      const result: any = await service.createRefund('r1', refundDto());
      expect(tx.visit.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'cancelled' } }));
      expect(tx.customerReward.updateMany).toHaveBeenCalled();
      expect(result.loyaltyRevoked).toBe(true);
    });

    it('un reembolso parcial NO anula la visita', async () => {
      const { service, tx } = setupRefund({ ret: { order: loyalOrder }, orderRefunded: 40 });
      const result: any = await service.createRefund('r1', refundDto({ amount: 40 }));
      expect(tx.visit.updateMany).not.toHaveBeenCalled();
      expect(result.loyaltyRevoked).toBe(false);
    });

    it('un premio ya canjeado queda para revisión, no se borra', async () => {
      const { service, tx } = setupRefund({ ret: { order: loyalOrder }, orderRefunded: 100 });
      tx.scratchAttempt.findMany.mockResolvedValue([{ id: 'a1', status: 'redeemed', prize: null }]);
      const result: any = await service.createRefund('r1', refundDto());
      expect(tx.scratchAttempt.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { status: 'review_required' } });
      expect(result.scratchReviewRequired).toBe(true);
    });

    it('un premio ganado y sin canjear se cancela y se regresa al inventario de premios', async () => {
      const { service, tx } = setupRefund({ ret: { order: loyalOrder }, orderRefunded: 100 });
      tx.scratchAttempt.findMany.mockResolvedValue([{ id: 'a2', status: 'won', prize: { id: 'pz1', remaining: 3 } }]);
      await service.createRefund('r1', refundDto());
      expect(tx.scratchAttempt.update).toHaveBeenCalledWith({ where: { id: 'a2' }, data: { status: 'cancelled' } });
      expect(tx.scratchPrize.update).toHaveBeenCalledWith({ where: { id: 'pz1' }, data: { remaining: { increment: 1 } } });
    });
  });
});

/* ------------------------------------------------ permiso por artículo */

describe('Devoluciones · permiso por artículo', () => {
  it('con permiso del producto, devuelve ese producto', async () => {
    const { service, tx } = setupCreate();
    await service.create(dto(), { actorId: 'u1', onlyProductIds: ['p1'] });
    expect(tx.return.create).toHaveBeenCalled();
  });

  it('si el producto no está autorizado, no crea nada y lo dice por nombre', async () => {
    const { service, tx } = setupCreate();
    await expect(service.create(dto(), { actorId: 'u1', onlyProductIds: ['otro'] })).rejects.toThrow(
      /No tienes autorización para devolver Collar/,
    );
    expect(tx.return.create).not.toHaveBeenCalled();
  });

  it('sin límite (administrador o permiso general) devuelve cualquier producto', async () => {
    const { service, tx } = setupCreate();
    await service.create(dto(), { actorId: 'u1', onlyProductIds: null });
    expect(tx.return.create).toHaveBeenCalled();
  });

  it('con permiso por artículo solo confirma o cancela lo que él mismo registró', async () => {
    const prisma: Row = {
      return: {
        findUnique: jest.fn().mockResolvedValue({ authorizedById: 'otra-persona' }),
        updateMany: jest.fn(),
      },
    };
    const service = new ReturnService(prisma as never);
    const scope = { actorId: 'u1', onlyProductIds: ['p1'] };
    await expect(service.confirm('r1', scope)).rejects.toThrow(/que tú registraste/);
    await expect(service.cancel('r1', scope)).rejects.toThrow(/que tú registraste/);
    expect(prisma.return.updateMany).not.toHaveBeenCalled();
  });
});

describe('Devoluciones · lo que se entrega al navegador', () => {
  it('la lista y el detalle solo traen id y nombre de quien autorizó, nunca el usuario completo', async () => {
    const prisma: Row = {
      return: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({ id: 'r1', items: [], refunds: [] }),
      },
    };
    const service = new ReturnService(prisma as never);
    await service.findByCompany(COMPANY);
    await service.findOne('r1');
    expect(prisma.return.findMany.mock.calls[0][0].include.authorizedBy).toEqual({ select: { id: true, name: true } });
    expect(prisma.return.findUnique.mock.calls[0][0].include.authorizedBy).toEqual({ select: { id: true, name: true } });
  });
});
