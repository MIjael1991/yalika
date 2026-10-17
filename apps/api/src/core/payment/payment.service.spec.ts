import { BadRequestException, NotFoundException } from '@nestjs/common';

import { PaymentService } from './payment.service';

jest.mock('../engagement/ticket-claim', () => ({
  createTicketClaimToken: jest.fn(() => 'token-de-prueba'),
}));

/**
 * Cobros del punto de venta (caja, celular o apartado). Prisma simulado.
 * Lo que se protege: nunca cobrar de más, cambio correcto, pagos parciales,
 * cuentas divididas y que el estado de la venta refleje lo realmente pagado.
 */

type Row = Record<string, any>;

function setup(opts: { order?: Row | null; paid?: number; splits?: number; split?: Row | null } = {}) {
  const order =
    opts.order === null
      ? null
      : { id: 'o1', orderNumber: 'V-1', total: 620, status: 'confirmed', companyId: 'c1', customerId: null, loyaltyProgramId: null, ...opts.order };
  const tx: Record<string, any> = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    order: {
      findUnique: jest.fn().mockResolvedValue(order),
      update: jest.fn().mockImplementation(({ data }: Row) => Promise.resolve({ ...order, ...data })),
    },
    payment: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: opts.paid ?? 0 } }),
      create: jest.fn().mockImplementation(({ data }: Row) => Promise.resolve({ id: 'p1', ...data })),
    },
    orderSplit: {
      count: jest.fn().mockResolvedValue(opts.splits ?? 0),
      findUnique: jest.fn().mockResolvedValue(opts.split ?? null),
      update: jest.fn().mockResolvedValue({}),
    },
    loyaltyProgram: { findUnique: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
    visit: { findFirst: jest.fn(), create: jest.fn(), count: jest.fn() },
    customerReward: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    site: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const prisma = { $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)), order: { findUnique: jest.fn() }, payment: { findMany: jest.fn() } };
  return { service: new PaymentService(prisma as never), tx, prisma };
}

describe('Cobros · validaciones previas', () => {
  it('pedido inexistente', async () => {
    const { service, tx } = setup({ order: null });
    await expect(service.createPayment('o1', { method: 'cash' } as never)).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('bloquea la fila del pedido antes de cobrar (evita dobles cobros simultáneos)', async () => {
    const { service, tx } = setup();
    await service.createPayment('o1', { method: 'cash' } as never);
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.order.findUnique.mock.invocationCallOrder[0]);
  });

  it.each(['draft', 'cancelled', 'voided', 'completed'])('no cobra un pedido en estado %s', async (status) => {
    const { service, tx } = setup({ order: { status } });
    await expect(service.createPayment('o1', { method: 'cash' } as never)).rejects.toThrow(/confirmado/);
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it.each(['confirmed', 'held'])('sí cobra un pedido %s', async (status) => {
    const { service } = setup({ order: { status } });
    await expect(service.createPayment('o1', { method: 'cash' } as never)).resolves.toBeDefined();
  });

  it('un pedido ya pagado no se cobra otra vez', async () => {
    const { service, tx } = setup({ paid: 620 });
    await expect(service.createPayment('o1', { method: 'cash' } as never)).rejects.toThrow(/ya está pagado/);
    expect(tx.payment.create).not.toHaveBeenCalled();
  });
});

describe('Cobros · importes y cambio', () => {
  it('sin monto cobra todo lo pendiente y marca la venta como pagada', async () => {
    const { service, tx } = setup();
    const result = await service.createPayment('o1', { method: 'card' } as never);
    expect(result.payment.amount).toBe(620);
    expect(result.order.paymentStatus).toBe('paid');
    expect(result.summary).toMatchObject({ previouslyPaid: 0, paymentApplied: 620, totalPaid: 620, remaining: 0 });
    expect(tx.order.update.mock.calls[0][0].data).toMatchObject({ paymentStatus: 'paid', status: 'confirmed' });
  });

  it('pago parcial deja la venta en parcial con el saldo correcto', async () => {
    const { service } = setup();
    const result = await service.createPayment('o1', { method: 'transfer', amount: 200 } as never);
    expect(result.order.paymentStatus).toBe('partial');
    expect(result.summary).toMatchObject({ paymentApplied: 200, totalPaid: 200, remaining: 420 });
  });

  it('el segundo pago completa la venta', async () => {
    const { service } = setup({ paid: 200 });
    const result = await service.createPayment('o1', { method: 'card' } as never);
    expect(result.payment.amount).toBe(420);
    expect(result.order.paymentStatus).toBe('paid');
    expect(result.summary).toMatchObject({ previouslyPaid: 200, totalPaid: 620, remaining: 0 });
  });

  it('no permite cobrar más que el saldo', async () => {
    const { service, tx } = setup({ paid: 200 });
    await expect(service.createPayment('o1', { method: 'card', amount: 421 } as never)).rejects.toThrow(/no puede superar el saldo/);
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('tolera una milésima de diferencia por redondeo', async () => {
    const { service } = setup({ order: { total: 100.1 }, paid: 33.4 });
    await expect(service.createPayment('o1', { method: 'card', amount: 66.7 } as never)).resolves.toBeDefined();
  });

  it('rechaza montos cero o negativos', async () => {
    const { service } = setup();
    await expect(service.createPayment('o1', { method: 'cash', amount: 0 } as never)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createPayment('o1', { method: 'cash', amount: -5 } as never)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('efectivo: calcula el cambio con centavos exactos', async () => {
    const { service } = setup({ order: { total: 99.9 } });
    const result = await service.createPayment('o1', { method: 'cash', receivedAmount: 200 } as never);
    expect(result.summary).toMatchObject({ receivedAmount: 200, changeAmount: 100.1 });
    expect(result.payment).toMatchObject({ receivedAmount: 200, changeAmount: 100.1 });
  });

  it('efectivo sin monto recibido asume pago exacto y cero cambio', async () => {
    const { service } = setup();
    const result = await service.createPayment('o1', { method: 'cash' } as never);
    expect(result.summary).toMatchObject({ receivedAmount: 620, changeAmount: 0 });
  });

  it('efectivo insuficiente se rechaza', async () => {
    const { service, tx } = setup();
    await expect(service.createPayment('o1', { method: 'cash', receivedAmount: 500 } as never)).rejects.toThrow(/efectivo recibido es menor/);
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it.each(['card', 'transfer', 'other'])('%s nunca registra efectivo recibido ni cambio', async (method) => {
    const { service } = setup();
    const result = await service.createPayment('o1', { method, receivedAmount: 1000 } as never);
    expect(result.payment.receivedAmount).toBeUndefined();
    expect(result.payment.changeAmount).toBe(0);
    expect(result.summary).toMatchObject({ receivedAmount: null, changeAmount: 0 });
  });

  it('limpia espacios en referencia y notas y liga el pago a la empresa del pedido', async () => {
    const { service } = setup();
    const result = await service.createPayment('o1', { method: 'transfer', reference: ' SPEI-1 ', notes: ' anticipo ' } as never);
    expect(result.payment).toMatchObject({ reference: 'SPEI-1', notes: 'anticipo', orderId: 'o1', companyId: 'c1', status: 'completed' });
  });

  it('no deja de redondear el total de varios pagos con decimales (0.1 + 0.2)', async () => {
    const { service } = setup({ order: { total: 0.3 }, paid: 0.1 });
    const result = await service.createPayment('o1', { method: 'card', amount: 0.2 } as never);
    expect(result.summary.totalPaid).toBe(0.3);
    expect(result.order.paymentStatus).toBe('paid');
  });
});

describe('Cobros · cuentas divididas', () => {
  const split = (extra: Row = {}) => ({ id: 'sp1', orderId: 'o1', label: 'Ana', total: 300, payments: [], ...extra });

  it('si la venta tiene cuentas divididas, exige elegir una', async () => {
    const { service, tx } = setup({ splits: 2 });
    await expect(service.createPayment('o1', { method: 'cash' } as never)).rejects.toThrow(/Selecciona una de las cuentas/);
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('cuenta inexistente o de otra venta', async () => {
    const missing = setup({ splits: 2, split: null });
    await expect(missing.service.createPayment('o1', { method: 'cash', orderSplitId: 'x' } as never)).rejects.toBeInstanceOf(NotFoundException);
    const other = setup({ splits: 2, split: split({ orderId: 'otra' }) });
    await expect(other.service.createPayment('o1', { method: 'cash', orderSplitId: 'sp1' } as never)).rejects.toThrow(/no pertenece a este pedido/);
    expect(other.tx.payment.create).not.toHaveBeenCalled();
  });

  it('cobra por omisión lo que falta de esa cuenta, no de toda la venta', async () => {
    const { service } = setup({ splits: 2, split: split({ payments: [{ amount: 100 }] }) });
    const result = await service.createPayment('o1', { method: 'card', orderSplitId: 'sp1' } as never);
    expect(result.payment.amount).toBe(200);
    expect(result.split).toMatchObject({ totalPaid: 300, remaining: 0, status: 'paid' });
  });

  it('no deja pagar más que lo que falta de la cuenta', async () => {
    const { service } = setup({ splits: 2, split: split() });
    await expect(service.createPayment('o1', { method: 'card', orderSplitId: 'sp1', amount: 301 } as never)).rejects.toThrow(/no puede superar el saldo/);
  });

  it('una cuenta ya pagada no se cobra otra vez', async () => {
    const { service } = setup({ splits: 2, split: split({ payments: [{ amount: 300 }] }) });
    await expect(service.createPayment('o1', { method: 'card', orderSplitId: 'sp1' } as never)).rejects.toThrow(/cuenta dividida ya está pagada/);
  });

  it('pago parcial de una cuenta la deja en parcial y actualiza su estado', async () => {
    const { service, tx } = setup({ splits: 2, split: split() });
    const result = await service.createPayment('o1', { method: 'cash', amount: 120, orderSplitId: 'sp1' } as never);
    expect(result.split).toMatchObject({ totalPaid: 120, remaining: 180, status: 'partial' });
    expect(tx.orderSplit.update.mock.calls[0][0]).toMatchObject({ where: { id: 'sp1' }, data: { status: 'partial' } });
    expect(result.payment.orderSplitId).toBe('sp1');
  });

  it('pagar una cuenta no marca pagada la venta completa', async () => {
    const { service } = setup({ splits: 2, split: split() });
    const result = await service.createPayment('o1', { method: 'card', orderSplitId: 'sp1' } as never);
    expect(result.order.paymentStatus).toBe('partial');
  });
});

describe('Cobros · lealtad y beneficio del ticket al pagar completo', () => {
  const program = (extra: Row = {}) => ({
    id: 'lp1',
    status: 'active',
    startsAt: new Date(Date.now() - 86400000),
    endsAt: new Date(Date.now() + 86400000),
    requiredVisits: 3,
    rewardType: 'gift',
    rewardDescription: 'Café gratis',
    rewardValidDays: 30,
    ...extra,
  });

  function loyaltySetup(visits: number, reward: Row | null = null, programExtra: Row = {}) {
    const ctx = setup({ order: { customerId: 'cus1', loyaltyProgramId: 'lp1' } });
    ctx.tx.loyaltyProgram.findUnique.mockResolvedValue(program(programExtra));
    ctx.tx.visit.findFirst.mockResolvedValue(null);
    ctx.tx.visit.count.mockResolvedValue(visits);
    ctx.tx.customerReward.findFirst.mockResolvedValue(reward);
    ctx.tx.customerReward.create.mockImplementation(({ data }: Row) => Promise.resolve({ id: 'rw1', ...data }));
    return ctx;
  }

  it('suma una visita confirmada y avisa cuántas faltan', async () => {
    const { service, tx } = loyaltySetup(1);
    const result = await service.createPayment('o1', { method: 'cash' } as never);
    expect(tx.visit.create).toHaveBeenCalledTimes(1);
    expect(result.loyalty).toMatchObject({ confirmedVisits: 1, requiredVisits: 3, remainingVisits: 2, rewardCreated: false });
    expect(tx.customerReward.create).not.toHaveBeenCalled();
  });

  it('no duplica la visita si el pedido ya la registró', async () => {
    const { service, tx } = loyaltySetup(1);
    tx.visit.findFirst.mockResolvedValue({ id: 'v1' });
    await service.createPayment('o1', { method: 'cash' } as never);
    expect(tx.visit.create).not.toHaveBeenCalled();
  });

  it('al llegar a las visitas requeridas crea el premio con vigencia', async () => {
    const { service, tx } = loyaltySetup(3);
    const result = await service.createPayment('o1', { method: 'cash' } as never);
    expect(result.loyalty).toMatchObject({ rewardCreated: true, remainingVisits: 0 });
    const data = tx.customerReward.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: 'available', customerId: 'cus1', companyId: 'c1' });
    expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 86400000);
  });

  it('no repite el premio si ya existe uno disponible', async () => {
    const { service, tx } = loyaltySetup(4, { id: 'rw0', status: 'available' });
    const result = await service.createPayment('o1', { method: 'cash' } as never);
    expect(tx.customerReward.create).not.toHaveBeenCalled();
    expect(result.loyalty?.rewardCreated).toBe(false);
  });

  it('reactiva un premio cancelado en lugar de crear otro', async () => {
    const { service, tx } = loyaltySetup(3, { id: 'rw0', status: 'cancelled' });
    tx.customerReward.update.mockResolvedValue({ id: 'rw0', status: 'available' });
    const result = await service.createPayment('o1', { method: 'cash' } as never);
    expect(tx.customerReward.update.mock.calls[0][0].data).toMatchObject({ status: 'available', redeemedAt: null });
    expect(result.loyalty?.rewardCreated).toBe(true);
  });

  it('un programa vencido o pausado no suma visitas', async () => {
    const expired = loyaltySetup(1, null, { endsAt: new Date(Date.now() - 1000) });
    await expired.service.createPayment('o1', { method: 'cash' } as never);
    expect(expired.tx.visit.create).not.toHaveBeenCalled();
    const paused = loyaltySetup(1, null, { status: 'paused' });
    await paused.service.createPayment('o1', { method: 'cash' } as never);
    expect(paused.tx.visit.create).not.toHaveBeenCalled();
  });

  it('un pago parcial no suma visitas ni premios', async () => {
    const { service, tx } = loyaltySetup(1);
    const result = await service.createPayment('o1', { method: 'cash', amount: 100 } as never);
    expect(tx.visit.create).not.toHaveBeenCalled();
    expect(result.loyalty).toBeNull();
    expect(result.benefitClaim).toBeNull();
  });

  it('sin cliente asignado no hay lealtad', async () => {
    const { service, tx } = setup();
    const result = await service.createPayment('o1', { method: 'cash' } as never);
    expect(tx.loyaltyProgram.findUnique).not.toHaveBeenCalled();
    expect(result.loyalty).toBeNull();
  });

  it('con página publicada y programa vigente entrega el enlace para reclamar beneficio', async () => {
    const { service, tx } = setup();
    tx.site.findFirst.mockResolvedValue({ status: 'published', slug: 'luna' });
    tx.loyaltyProgram.findFirst.mockResolvedValue({ id: 'lp1' });
    const result = await service.createPayment('o1', { method: 'cash' } as never);
    expect(result.benefitClaim).toEqual({ siteSlug: 'luna', orderId: 'o1', token: 'token-de-prueba' });
  });

  it('sin página publicada no hay enlace de beneficio', async () => {
    const { service, tx } = setup();
    tx.site.findFirst.mockResolvedValue({ status: 'draft', slug: 'luna' });
    tx.loyaltyProgram.findFirst.mockResolvedValue({ id: 'lp1' });
    const result = await service.createPayment('o1', { method: 'cash' } as never);
    expect(result.benefitClaim).toBeNull();
  });
});

describe('Cobros · consulta', () => {
  it('lista solo pagos completados y exige que el pedido exista', async () => {
    const { service, prisma } = setup();
    prisma.order.findUnique.mockResolvedValue(null);
    await expect(service.findByOrder('o1')).rejects.toBeInstanceOf(NotFoundException);
    prisma.order.findUnique.mockResolvedValue({ id: 'o1' });
    prisma.payment.findMany.mockResolvedValue([]);
    await service.findByOrder('o1');
    expect(prisma.payment.findMany.mock.calls[0][0].where).toEqual({ orderId: 'o1', status: 'completed' });
  });
});
