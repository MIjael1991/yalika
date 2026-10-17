import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { ReservationService } from './reservation.service';

/**
 * Pruebas con Prisma simulado (sin base de datos). Cubren las reglas de
 * Apartados: existencia, anticipo, expiración, cancelación y cierre.
 */

const COMPANY = 'company-1';
const OTHER_COMPANY = 'company-2';
const PRODUCT = '11111111-1111-4111-8111-111111111111';
const PRODUCT_B = '22222222-2222-4222-8222-222222222222';
const VARIANT = '33333333-3333-4333-8333-333333333333';
const OP = '44444444-4444-4444-8444-444444444444';

type Mock = jest.Mock;

function makePrisma() {
  const prisma: Record<string, any> = {
    site: { findFirst: jest.fn(), findUnique: jest.fn() },
    product: { findFirst: jest.fn() },
    productVariant: { findFirst: jest.fn() },
    order: { findFirst: jest.fn() },
    commerceReservationPolicy: { findUnique: jest.fn(), upsert: jest.fn() },
    commerceReservation: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    commerceReservationItem: { aggregate: jest.fn() },
    commerceReservationEvent: { create: jest.fn().mockResolvedValue({}) },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  prisma.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  return prisma;
}

function dto(overrides: Record<string, unknown> = {}) {
  return {
    siteSlug: 'luna',
    operationId: OP,
    contactName: ' Ana ',
    contactPhone: '(555) 123-4567',
    items: [{ productId: PRODUCT, quantity: 1 }],
    ...overrides,
  } as never;
}

const POLICY_ON = {
  enabled: true,
  depositRequired: true,
  depositType: 'fixed',
  depositValue: 100,
  holdMinutes: 15,
  activeDays: 2,
};

const PRODUCT_ROW = {
  id: PRODUCT,
  name: 'Vestido',
  price: 620,
  stock: 5,
  catalogId: 'cat-1',
  trackInventory: true,
  variants: [],
};

function setupHold(prisma: ReturnType<typeof makePrisma>, policy = POLICY_ON) {
  prisma.site.findFirst.mockResolvedValue({
    id: 'site-1',
    companyId: COMPANY,
    slug: 'luna',
    catalogId: 'cat-1',
  });
  prisma.commerceReservationPolicy.findUnique.mockResolvedValue({ companyId: COMPANY, ...policy });
  prisma.commerceReservation.findFirst.mockResolvedValue(null);
  prisma.product.findFirst.mockResolvedValue({ ...PRODUCT_ROW });
  prisma.commerceReservationItem.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });
  prisma.commerceReservation.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'res-1', ...data }));
}

describe('ReservationService · crear apartado público', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: ReservationService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new ReservationService(prisma as never);
  });

  it('rechaza una tienda no publicada', async () => {
    prisma.site.findFirst.mockResolvedValue(null);
    await expect(service.createPublicHold(dto())).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.site.findFirst.mock.calls[0][0].where.status).toBe('published');
  });

  it('rechaza tiendas con apartados desactivados (política por defecto)', async () => {
    setupHold(prisma);
    prisma.commerceReservationPolicy.findUnique.mockResolvedValue(null);
    await expect(service.createPublicHold(dto())).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.commerceReservation.create).not.toHaveBeenCalled();
  });

  it('es idempotente: la misma operación devuelve el apartado existente', async () => {
    setupHold(prisma);
    const existing = { id: 'res-old', operationId: OP };
    prisma.commerceReservation.findFirst.mockResolvedValue(existing);
    await expect(service.createPublicHold(dto())).resolves.toBe(existing);
    expect(prisma.commerceReservation.create).not.toHaveBeenCalled();
  });

  it('valida el teléfono', async () => {
    setupHold(prisma);
    await expect(service.createPublicHold(dto({ contactPhone: '123' }))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('no permite repetir producto y variante', async () => {
    setupHold(prisma);
    await expect(
      service.createPublicHold(dto({ items: [{ productId: PRODUCT, quantity: 1 }, { productId: PRODUCT, quantity: 2 }] })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('con anticipo requerido crea una reserva temporal con el anticipo calculado', async () => {
    setupHold(prisma);
    const before = Date.now();
    const created: any = await service.createPublicHold(dto());
    expect(created.status).toBe('hold');
    expect(created.depositStatus).toBe('pending');
    expect(created.depositRequiredAmount).toBe(100);
    expect(created.pickupDeadline).toBeNull();
    expect(created.holdExpiresAt.getTime()).toBeGreaterThanOrEqual(before + 15 * 60000 - 50);
    expect(created.contactPhone).toBe('5551234567');
    expect(created.contactName).toBe('Ana');
    expect(created.catalogId).toBe('cat-1');
    expect(created.items.create[0]).toMatchObject({ unitPriceSnapshot: 620, productNameSnapshot: 'Vestido' });
  });

  it('el anticipo porcentual nunca supera el total', async () => {
    setupHold(prisma, { ...POLICY_ON, depositType: 'percentage', depositValue: 20 });
    const created: any = await service.createPublicHold(dto({ items: [{ productId: PRODUCT, quantity: 2 }] }));
    expect(created.depositRequiredAmount).toBe(248);
  });

  it('sin anticipo requerido nace activo con fecha límite y sin reloj de reserva', async () => {
    setupHold(prisma, { ...POLICY_ON, depositRequired: false });
    const created: any = await service.createPublicHold(dto());
    expect(created.status).toBe('active');
    expect(created.depositStatus).toBe('none');
    expect(created.holdExpiresAt).toBeNull();
    expect(created.pickupDeadline).toBeInstanceOf(Date);
  });

  it('bloquea si la mercancía ya está apartada', async () => {
    setupHold(prisma);
    prisma.commerceReservationItem.aggregate.mockResolvedValue({ _sum: { quantity: 5 } });
    await expect(service.createPublicHold(dto())).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.commerceReservation.create).not.toHaveBeenCalled();
  });

  it('informa cuántas piezas quedan cuando hay menos de las pedidas', async () => {
    setupHold(prisma);
    prisma.commerceReservationItem.aggregate.mockResolvedValue({ _sum: { quantity: 3 } });
    await expect(service.createPublicHold(dto({ items: [{ productId: PRODUCT, quantity: 3 }] }))).rejects.toThrow(/Sólo quedan 2/);
  });

  it('descuenta del stock solo reservas que bloquean mercancía', async () => {
    setupHold(prisma);
    await service.createPublicHold(dto());
    const where = prisma.commerceReservationItem.aggregate.mock.calls[0][0].where;
    expect(where.reservation.status.in).toEqual(['hold', 'deposit_reported', 'active', 'review_expired']);
    expect(where.variantId).toBeNull();
  });

  it('filtra producto por empresa, catálogo del sitio, activo y visible en web', async () => {
    setupHold(prisma);
    await service.createPublicHold(dto());
    const where = prisma.product.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ companyId: COMPANY, catalogId: 'cat-1', status: 'active', webVisible: true });
  });

  it('rechaza productos que no llevan inventario', async () => {
    setupHold(prisma);
    prisma.product.findFirst.mockResolvedValue({ ...PRODUCT_ROW, trackInventory: false });
    await expect(service.createPublicHold(dto())).rejects.toThrow(/no utiliza inventario/);
  });

  it('exige elegir variante cuando el producto las tiene', async () => {
    setupHold(prisma);
    prisma.product.findFirst.mockResolvedValue({ ...PRODUCT_ROW, variants: [{ id: VARIANT }] });
    await expect(service.createPublicHold(dto())).rejects.toThrow(/Selecciona una variante/);
  });

  it('usa precio y existencia de la variante', async () => {
    setupHold(prisma);
    prisma.product.findFirst.mockResolvedValue({ ...PRODUCT_ROW, variants: [{ id: VARIANT }] });
    prisma.productVariant.findFirst.mockResolvedValue({ id: VARIANT, name: 'Talla M', price: 700, stock: 2 });
    const created: any = await service.createPublicHold(dto({ items: [{ productId: PRODUCT, variantId: VARIANT, quantity: 2 }] }));
    expect(created.items.create[0]).toMatchObject({ unitPriceSnapshot: 700, variantSnapshot: 'Talla M' });
    expect(prisma.commerceReservationItem.aggregate.mock.calls[0][0].where.variantId).toBe(VARIANT);
  });

  it('rechaza productos de catálogos distintos en un mismo apartado', async () => {
    setupHold(prisma);
    prisma.site.findFirst.mockResolvedValue({ id: 'site-1', companyId: COMPANY, slug: 'luna', catalogId: null });
    prisma.product.findFirst
      .mockResolvedValueOnce({ ...PRODUCT_ROW, id: PRODUCT, catalogId: 'cat-1' })
      .mockResolvedValueOnce({ ...PRODUCT_ROW, id: PRODUCT, catalogId: 'cat-1' })
      .mockResolvedValueOnce({ ...PRODUCT_ROW, id: PRODUCT_B, catalogId: 'cat-2' })
      .mockResolvedValueOnce({ ...PRODUCT_ROW, id: PRODUCT_B, catalogId: 'cat-2' });
    await expect(
      service.createPublicHold(dto({ items: [{ productId: PRODUCT, quantity: 1 }, { productId: PRODUCT_B, quantity: 1 }] })),
    ).rejects.toThrow(/distintos catálogos/);
  });

  it('rechaza productos sin catálogo asignado', async () => {
    setupHold(prisma);
    prisma.product.findFirst.mockResolvedValue({ ...PRODUCT_ROW, catalogId: null });
    await expect(service.createPublicHold(dto())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ante una carrera de operationId (P2002) devuelve el apartado ya creado', async () => {
    setupHold(prisma);
    const existing = { id: 'res-race' };
    prisma.commerceReservation.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(existing);
    prisma.commerceReservation.create.mockRejectedValue({ code: 'P2002' });
    await expect(service.createPublicHold(dto())).resolves.toBe(existing);
  });

  it('propaga otros errores de base de datos', async () => {
    setupHold(prisma);
    prisma.commerceReservation.create.mockRejectedValue(new Error('boom'));
    await expect(service.createPublicHold(dto())).rejects.toThrow('boom');
  });
});

describe('ReservationService · expiración', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: ReservationService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new ReservationService(prisma as never);
  });

  const past = () => new Date(Date.now() - 60000);
  const future = () => new Date(Date.now() + 3600000);

  it('libera la reserva temporal vencida y deja evento', async () => {
    prisma.commerceReservation.findMany.mockResolvedValueOnce([{ id: 'r1' }]).mockResolvedValue([]);
    prisma.commerceReservation.findUnique.mockResolvedValue({ id: 'r1', status: 'hold', holdExpiresAt: past() });
    const result = await service.expire(COMPANY);
    expect(result).toEqual({ expired: 1, reportedReview: 0, reviewExpired: 0 });
    expect(prisma.commerceReservation.update.mock.calls[0][0].data.status).toBe('expired');
    expect(prisma.commerceReservationEvent.create.mock.calls[0][0].data.type).toBe('expired');
  });

  it('no libera si otro proceso la renovó entre la lectura y el bloqueo', async () => {
    prisma.commerceReservation.findMany.mockResolvedValueOnce([{ id: 'r1' }]).mockResolvedValue([]);
    prisma.commerceReservation.findUnique.mockResolvedValue({ id: 'r1', status: 'hold', holdExpiresAt: future() });
    await service.expire(COMPANY);
    expect(prisma.commerceReservation.update).not.toHaveBeenCalled();
  });

  it('no libera una reserva que ya cambió de estado', async () => {
    prisma.commerceReservation.findMany.mockResolvedValueOnce([{ id: 'r1' }]).mockResolvedValue([]);
    prisma.commerceReservation.findUnique.mockResolvedValue({ id: 'r1', status: 'deposit_reported', holdExpiresAt: past() });
    await service.expire(COMPANY);
    expect(prisma.commerceReservation.update).not.toHaveBeenCalled();
  });

  it('anticipo reportado sin verificar pasa a revisión y la mercancía sigue protegida', async () => {
    prisma.commerceReservation.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'r2' }])
      .mockResolvedValueOnce([]);
    prisma.commerceReservation.updateMany.mockResolvedValue({ count: 1 });
    const result = await service.expire(COMPANY);
    expect(result.reportedReview).toBe(1);
    expect(prisma.commerceReservation.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'r2', status: 'deposit_reported' },
      data: { status: 'review_expired' },
    });
  });

  it('apartado pagado vencido va a revisión manual, nunca se libera solo', async () => {
    prisma.commerceReservation.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'r3' }]);
    prisma.commerceReservation.updateMany.mockResolvedValue({ count: 1 });
    const result = await service.expire(COMPANY);
    expect(result.reviewExpired).toBe(1);
    const data = prisma.commerceReservation.updateMany.mock.calls[0][0].data;
    expect(data).toEqual({ status: 'review_expired' });
    expect(prisma.commerceReservationEvent.create.mock.calls[0][0].data.type).toBe('deadline_reached');
  });

  it('no deja evento si otro proceso ya cambió el estado (count 0)', async () => {
    prisma.commerceReservation.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'r3' }]);
    prisma.commerceReservation.updateMany.mockResolvedValue({ count: 0 });
    await service.expire(COMPANY);
    expect(prisma.commerceReservationEvent.create).not.toHaveBeenCalled();
  });

  it('solo mira apartados de la empresa indicada', async () => {
    await service.expire(OTHER_COMPANY);
    for (const call of prisma.commerceReservation.findMany.mock.calls) {
      expect(call[0].where.companyId).toBe(OTHER_COMPANY);
    }
  });
});

describe('ReservationService · cliente: anticipo y cancelación', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: ReservationService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new ReservationService(prisma as never);
  });

  const row = (status: string, extra: Record<string, unknown> = {}) => ({ id: 'r1', companyId: COMPANY, status, ...extra });

  it('reportar anticipo en un token inexistente da 404', async () => {
    prisma.commerceReservation.findUnique.mockResolvedValue(null);
    await expect(service.reportDeposit('x', { amount: 100, method: 'cash' } as never)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reportar anticipo cambia a deposit_reported y da una hora de revisión', async () => {
    prisma.commerceReservation.findUnique.mockResolvedValue(row('hold'));
    prisma.commerceReservation.findUniqueOrThrow.mockResolvedValue(row('hold'));
    prisma.commerceReservation.update.mockImplementation(({ data }: any) => Promise.resolve({ id: 'r1', ...data }));
    const before = Date.now();
    const result: any = await service.reportDeposit('t', { amount: 120, method: 'transfer', reference: ' ABC ' } as never);
    expect(result.status).toBe('deposit_reported');
    expect(result.depositStatus).toBe('reported');
    expect(result.depositReference).toBe('ABC');
    expect(result.holdExpiresAt.getTime()).toBeGreaterThanOrEqual(before + 3600000 - 50);
    expect(prisma.commerceReservationEvent.create.mock.calls[0][0].data.note).toContain('Pendiente de verificación');
  });

  it('volver a reportar no extiende el plazo de revisión ya fijado', async () => {
    const firstDeadline = new Date(Date.now() + 10 * 60000);
    const current = row('deposit_reported', { holdExpiresAt: firstDeadline });
    prisma.commerceReservation.findUnique.mockResolvedValue(current);
    prisma.commerceReservation.findUniqueOrThrow.mockResolvedValue(current);
    prisma.commerceReservation.update.mockImplementation(({ data }: any) => Promise.resolve({ id: 'r1', ...data }));
    const result: any = await service.reportDeposit('t', { amount: 150, method: 'cash' } as never);
    expect(result.holdExpiresAt).toBe(firstDeadline);
    expect(result.depositAmount).toBe(150);
  });

  it.each(['active', 'expired', 'cancelled', 'released', 'completed', 'review_expired'])('no se puede reportar anticipo en estado %s', async (status) => {
    prisma.commerceReservation.findUnique.mockResolvedValue(row(status));
    prisma.commerceReservation.findUniqueOrThrow.mockResolvedValue(row(status));
    await expect(service.reportDeposit('t', { amount: 100, method: 'cash' } as never)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.commerceReservation.update).not.toHaveBeenCalled();
  });

  it('el cliente solo puede cancelar una reserva temporal', async () => {
    prisma.commerceReservation.findUnique.mockResolvedValue(row('hold'));
    prisma.commerceReservation.update.mockImplementation(({ data }: any) => Promise.resolve({ id: 'r1', ...data }));
    const result: any = await service.cancelPublic('t');
    expect(result.status).toBe('cancelled');
    expect(result.releasedAt).toBeInstanceOf(Date);
  });

  it('con anticipo reportado debe hablar con la tienda para cancelar', async () => {
    prisma.commerceReservation.findUnique.mockResolvedValue(row('deposit_reported'));
    await expect(service.cancelPublic('t')).rejects.toThrow(/Contacta a la tienda/);
    expect(prisma.commerceReservation.update).not.toHaveBeenCalled();
  });

  it.each(['active', 'review_expired', 'completed'])('apartado %s no lo cancela el cliente', async (status) => {
    prisma.commerceReservation.findUnique.mockResolvedValue(row(status));
    await expect(service.cancelPublic('t')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('la consulta pública por token no expone datos del cliente ni de la empresa', async () => {
    const full = row('active', {
      reservationNumber: 'AP-261016-ABCDE',
      publicToken: 't',
      holdExpiresAt: null,
      pickupDeadline: null,
      depositRequiredAmount: 100,
      depositAmount: 100,
      depositStatus: 'confirmed',
      deliveryMode: 'pickup',
      contactPhone: '5551234567',
      contactName: 'Ana',
      siteId: 'site-1',
      items: [{ productNameSnapshot: 'Vestido', variantSnapshot: null, quantity: 1, unitPriceSnapshot: 620 }],
    });
    prisma.commerceReservation.findUnique.mockResolvedValue(full);
    prisma.commerceReservation.findUniqueOrThrow.mockResolvedValue(full);
    prisma.site.findUnique.mockResolvedValue({ name: 'Luna', slug: 'luna', whatsappPhone: '5551112222' });
    const view: any = await service.publicByToken('t');
    expect(view.items[0]).toEqual({ productName: 'Vestido', variant: null, quantity: 1, unitPrice: 620 });
    expect(JSON.stringify(view)).not.toContain('5551234567');
    expect(JSON.stringify(view)).not.toContain('company-1');
    expect(view).not.toHaveProperty('contactPhone');
    expect(view).not.toHaveProperty('companyId');
  });
});

describe('ReservationService · tienda: confirmar, extender, liberar y cerrar', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: ReservationService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new ReservationService(prisma as never);
    prisma.commerceReservationPolicy.findUnique.mockResolvedValue({ companyId: COMPANY, ...POLICY_ON, activeDays: 3 });
    prisma.commerceReservation.update.mockImplementation(({ data }: any) => Promise.resolve({ id: 'r1', ...data }));
  });

  const owned = (status: string, extra: Record<string, unknown> = {}) => prisma.commerceReservation.findFirst.mockResolvedValue({ id: 'r1', companyId: COMPANY, status, notes: null, ...extra });

  it('un apartado de otra empresa se comporta como inexistente', async () => {
    prisma.commerceReservation.findFirst.mockResolvedValue(null);
    await expect(service.release(OTHER_COMPANY, 'r1', {} as never, 'u1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.commerceReservation.findFirst.mock.calls[0][0].where).toEqual({ id: 'r1', companyId: OTHER_COMPANY });
  });

  it('confirmar anticipo menor al requerido se rechaza', async () => {
    owned('hold', { depositRequiredAmount: 124, depositStatus: 'pending' });
    await expect(service.confirmDeposit(COMPANY, 'r1', { amount: 100, method: 'cash' } as never, 'u1')).rejects.toThrow(/al menos \$124\.00/);
    expect(prisma.commerceReservation.update).not.toHaveBeenCalled();
  });

  it('confirmar anticipo activa el apartado, fija fecha límite y registra al responsable', async () => {
    owned('deposit_reported', { depositRequiredAmount: 100, depositStatus: 'reported' });
    const before = Date.now();
    const result: any = await service.confirmDeposit(COMPANY, 'r1', { amount: 100, method: 'cash', reference: ' R ' } as never, 'u1');
    expect(result).toMatchObject({ status: 'active', depositStatus: 'confirmed', holdExpiresAt: null, depositReference: 'R' });
    expect(result.pickupDeadline.getTime()).toBeGreaterThanOrEqual(before + 3 * 86400000 - 50);
    expect(prisma.commerceReservationEvent.create.mock.calls[0][0].data).toMatchObject({ type: 'deposit_confirmed', actorId: 'u1' });
  });

  it('permite confirmar un anticipo reportado aunque ya estuviera en revisión por tiempo', async () => {
    owned('review_expired', { depositRequiredAmount: 100, depositStatus: 'reported' });
    await expect(service.confirmDeposit(COMPANY, 'r1', { amount: 100, method: 'cash' } as never, 'u1')).resolves.toMatchObject({ status: 'active' });
  });

  it('no confirma un apartado en revisión que nunca reportó anticipo', async () => {
    owned('review_expired', { depositRequiredAmount: 100, depositStatus: 'confirmed' });
    await expect(service.confirmDeposit(COMPANY, 'r1', { amount: 100, method: 'cash' } as never, 'u1')).rejects.toThrow(/ya no espera anticipo/);
  });

  it.each(['active', 'expired', 'cancelled', 'released', 'completed'])('no se confirma anticipo en estado %s', async (status) => {
    owned(status, { depositRequiredAmount: 100, depositStatus: 'pending' });
    await expect(service.confirmDeposit(COMPANY, 'r1', { amount: 100, method: 'cash' } as never, 'u1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('extender suma días a la fecha límite vigente', async () => {
    const deadline = new Date(Date.now() + 2 * 86400000);
    owned('active', { pickupDeadline: deadline });
    const result: any = await service.extend(COMPANY, 'r1', { days: 3 } as never, 'u1');
    expect(result.pickupDeadline.getTime()).toBe(deadline.getTime() + 3 * 86400000);
    expect(result.status).toBe('active');
  });

  it('extender un apartado vencido cuenta desde hoy y lo reactiva', async () => {
    owned('review_expired', { pickupDeadline: new Date(Date.now() - 5 * 86400000) });
    const before = Date.now();
    const result: any = await service.extend(COMPANY, 'r1', { days: 2 } as never, 'u1');
    expect(result.pickupDeadline.getTime()).toBeGreaterThanOrEqual(before + 2 * 86400000 - 50);
    expect(result.status).toBe('active');
  });

  it.each(['hold', 'deposit_reported', 'expired', 'cancelled', 'released', 'completed'])('no se extiende un apartado en estado %s', async (status) => {
    owned(status);
    await expect(service.extend(COMPANY, 'r1', { days: 2 } as never, 'u1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each(['hold', 'deposit_reported', 'active', 'review_expired'])('liberar un apartado %s devuelve la mercancía y guarda el motivo', async (status) => {
    owned(status, { notes: 'nota previa' });
    const result: any = await service.release(COMPANY, 'r1', { reason: ' Cliente no llegó ' } as never, 'u1');
    expect(result.status).toBe('released');
    expect(result.notes).toBe('nota previa\nLiberación: Cliente no llegó');
    expect(prisma.commerceReservationEvent.create.mock.calls[0][0].data).toMatchObject({ type: 'released', actorId: 'u1', note: 'Cliente no llegó' });
  });

  it.each(['expired', 'cancelled', 'released', 'completed'])('no se libera un apartado %s', async (status) => {
    owned(status);
    await expect(service.release(COMPANY, 'r1', {} as never, 'u1')).rejects.toThrow(/ya no bloquea mercancía/);
  });

  it('no se completa sin venta vinculada', async () => {
    owned('active', { orderId: null });
    await expect(service.complete(COMPANY, 'r1', 'u1')).rejects.toThrow(/todavía no tiene una venta/);
  });

  it('no se completa si la venta vinculada tiene saldo pendiente', async () => {
    owned('active', { orderId: 'o1' });
    prisma.order.findFirst.mockResolvedValue(null);
    await expect(service.complete(COMPANY, 'r1', 'u1')).rejects.toThrow(/saldo pendiente/);
    expect(prisma.order.findFirst.mock.calls[0][0].where).toEqual({ id: 'o1', companyId: COMPANY, paymentStatus: 'paid' });
  });

  it('se completa cuando la venta está pagada', async () => {
    owned('active', { orderId: 'o1' });
    prisma.order.findFirst.mockResolvedValue({ id: 'o1', orderNumber: 'V-100' });
    const result: any = await service.complete(COMPANY, 'r1', 'u1');
    expect(result.status).toBe('completed');
    expect(prisma.commerceReservationEvent.create.mock.calls[0][0].data.note).toContain('V-100');
  });

  it('el porcentaje de anticipo no puede superar 100', async () => {
    await expect(service.updatePolicy(COMPANY, { enabled: true, depositRequired: true, depositType: 'percentage', depositValue: 120, holdMinutes: 15, activeDays: 2 } as never)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.commerceReservationPolicy.upsert).not.toHaveBeenCalled();
  });
});

describe('ReservationService · cambios simultáneos', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: ReservationService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new ReservationService(prisma as never);
    prisma.commerceReservationPolicy.findUnique.mockResolvedValue({ companyId: COMPANY, ...POLICY_ON });
  });

  const conflict = () => Object.assign(new Error('Record not found'), { code: 'P2025' });
  const owned = (status: string, extra: Record<string, unknown> = {}) =>
    prisma.commerceReservation.findFirst.mockResolvedValue({ id: 'r1', companyId: COMPANY, status, notes: null, ...extra });

  it('cada cambio exige que el apartado siga en el estado leído', async () => {
    prisma.commerceReservation.update.mockImplementation(({ data }: any) => Promise.resolve({ id: 'r1', ...data }));

    owned('active');
    await service.extend(COMPANY, 'r1', { days: 1 } as never, 'u1');
    expect(prisma.commerceReservation.update.mock.calls[0][0].where).toEqual({ id: 'r1', status: 'active' });

    owned('hold');
    await service.release(COMPANY, 'r1', {} as never, 'u1');
    expect(prisma.commerceReservation.update.mock.calls[1][0].where).toEqual({ id: 'r1', status: 'hold' });

    owned('deposit_reported', { depositRequiredAmount: 0, depositStatus: 'reported' });
    await service.confirmDeposit(COMPANY, 'r1', { amount: 100, method: 'cash' } as never, 'u1');
    expect(prisma.commerceReservation.update.mock.calls[2][0].where).toEqual({ id: 'r1', status: 'deposit_reported' });

    owned('active', { orderId: 'o1' });
    prisma.order.findFirst.mockResolvedValue({ id: 'o1', orderNumber: 'V-1' });
    await service.complete(COMPANY, 'r1', 'u1');
    expect(prisma.commerceReservation.update.mock.calls[3][0].where).toEqual({ id: 'r1', status: 'active' });
  });

  it('si otra persona lo cambió antes, avisa con conflicto y no deja evento', async () => {
    owned('active');
    prisma.commerceReservation.update.mockRejectedValue(conflict());
    await expect(service.release(COMPANY, 'r1', {} as never, 'u1')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.extend(COMPANY, 'r1', { days: 1 } as never, 'u1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.commerceReservationEvent.create).not.toHaveBeenCalled();
  });

  it('confirmar anticipo y completar también avisan con conflicto', async () => {
    owned('hold', { depositRequiredAmount: 0, depositStatus: 'pending' });
    prisma.commerceReservation.update.mockRejectedValue(conflict());
    await expect(service.confirmDeposit(COMPANY, 'r1', { amount: 100, method: 'cash' } as never, 'u1')).rejects.toBeInstanceOf(ConflictException);
    owned('active', { orderId: 'o1' });
    prisma.order.findFirst.mockResolvedValue({ id: 'o1', orderNumber: 'V-1' });
    await expect(service.complete(COMPANY, 'r1', 'u1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('el cliente que cancela o reporta justo cuando cambió el estado recibe conflicto', async () => {
    prisma.commerceReservation.findUnique.mockResolvedValue({ id: 'r1', companyId: COMPANY, status: 'hold' });
    prisma.commerceReservation.findUniqueOrThrow.mockResolvedValue({ id: 'r1', companyId: COMPANY, status: 'hold' });
    prisma.commerceReservation.update.mockRejectedValue(conflict());
    await expect(service.cancelPublic('t')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.reportDeposit('t', { amount: 100, method: 'cash' } as never)).rejects.toBeInstanceOf(ConflictException);
  });

  it('otros errores de base de datos no se disfrazan de conflicto', async () => {
    owned('active');
    prisma.commerceReservation.update.mockRejectedValue(new Error('boom'));
    await expect(service.release(COMPANY, 'r1', {} as never, 'u1')).rejects.toThrow('boom');
  });
});

