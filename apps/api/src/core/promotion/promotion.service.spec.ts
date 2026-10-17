import { BadRequestException, NotFoundException } from '@nestjs/common';

import { PromotionService } from './promotion.service';

/**
 * Pruebas con Prisma simulado (sin base de datos). Cubren las reglas de las
 * promociones: validación al crear, ciclo de vida y vista pública sin datos internos.
 */

const COMPANY = '11111111-1111-4111-8111-111111111111';
const PRODUCT_A = '22222222-2222-4222-8222-222222222222';
const PRODUCT_B = '33333333-3333-4333-8333-333333333333';

const DAY = 86_400_000;
const inDays = (days: number) => new Date(Date.now() + days * DAY).toISOString();

function makePrisma() {
  return {
    company: { findUnique: jest.fn().mockResolvedValue({ id: COMPANY }) },
    product: { findMany: jest.fn().mockResolvedValue([]) },
    site: { findFirst: jest.fn() },
    promotion: {
      create: jest.fn((args: { data: unknown }) => Promise.resolve({ id: 'promo-1', ...(args.data as object) })),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      update: jest.fn((args: { where: { id: string }; data: object }) => Promise.resolve({ id: args.where.id, ...args.data })),
      delete: jest.fn().mockResolvedValue({}),
    },
  };
}

function build() {
  const prisma = makePrisma();
  return { prisma, service: new PromotionService(prisma as never) };
}

function dto(overrides: Record<string, unknown> = {}) {
  return {
    title: '  Verano  ',
    type: 'percentage',
    discountValue: 20,
    startsAt: inDays(-1),
    endsAt: inDays(10),
    companyId: COMPANY,
    ...overrides,
  } as never;
}

describe('Promociones: crear', () => {
  it('la empresa debe existir', async () => {
    const { prisma, service } = build();
    prisma.company.findUnique.mockResolvedValue(null);

    await expect(service.create(dto())).rejects.toThrow(NotFoundException);
    expect(prisma.promotion.create).not.toHaveBeenCalled();
  });

  it('la fecha final debe ser posterior a la inicial (también si son iguales)', async () => {
    const { service } = build();
    const same = inDays(3);

    await expect(service.create(dto({ startsAt: same, endsAt: same }))).rejects.toThrow('posterior');
    await expect(service.create(dto({ startsAt: inDays(5), endsAt: inDays(2) }))).rejects.toThrow('posterior');
  });

  it.each([
    ['sin valor', undefined],
    ['cero', 0],
    ['negativo', -5],
    ['más de 100', 100.01],
  ])('porcentaje %s se rechaza', async (_name, value) => {
    const { prisma, service } = build();

    await expect(service.create(dto({ discountValue: value }))).rejects.toThrow('porcentaje');
    expect(prisma.promotion.create).not.toHaveBeenCalled();
  });

  it('porcentaje de 100 y de 0.01 se aceptan', async () => {
    const { service } = build();

    await expect(service.create(dto({ discountValue: 100 }))).resolves.toBeDefined();
    await expect(service.create(dto({ discountValue: 0.01 }))).resolves.toBeDefined();
  });

  it('descuento fijo debe ser mayor a 0', async () => {
    const { service } = build();

    await expect(service.create(dto({ type: 'fixed', discountValue: 0 }))).rejects.toThrow('mayor a 0');
    await expect(service.create(dto({ type: 'fixed', discountValue: undefined }))).rejects.toThrow('mayor a 0');
    await expect(service.create(dto({ type: 'fixed', discountValue: 50 }))).resolves.toBeDefined();
  });

  it('precio especial necesita el precio', async () => {
    const { service } = build();

    await expect(service.create(dto({ type: 'special_price', discountValue: undefined }))).rejects.toThrow('precio especial');
    await expect(service.create(dto({ type: 'special_price', specialPrice: 99 }))).resolves.toBeDefined();
  });

  it('compra X y recibe Y necesita las dos cantidades y un solo producto', async () => {
    const { prisma, service } = build();
    prisma.product.findMany.mockResolvedValue([{ id: PRODUCT_A }]);

    await expect(service.create(dto({ type: 'buy_x_get_y', buyQuantity: 2 }))).rejects.toThrow('cantidad de compra');
    await expect(service.create(dto({ type: 'buy_x_get_y', buyQuantity: 2, getQuantity: 1 }))).rejects.toThrow('un solo producto');
    await expect(
      service.create(dto({ type: 'buy_x_get_y', buyQuantity: 2, getQuantity: 1, productIds: [PRODUCT_A, PRODUCT_B] })),
    ).rejects.toThrow('un solo producto');
    await expect(
      service.create(dto({ type: 'buy_x_get_y', buyQuantity: 2, getQuantity: 1, productIds: [PRODUCT_A] })),
    ).resolves.toBeDefined();
  });

  it('no deja ligar productos de otro negocio', async () => {
    const { prisma, service } = build();
    // Solo uno de los dos productos pertenece a la empresa.
    prisma.product.findMany.mockResolvedValue([{ id: PRODUCT_A }]);

    await expect(service.create(dto({ productIds: [PRODUCT_A, PRODUCT_B] }))).rejects.toThrow('no pertenecen a esta empresa');

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [PRODUCT_A, PRODUCT_B] }, companyId: COMPANY } }),
    );
    expect(prisma.promotion.create).not.toHaveBeenCalled();
  });

  it('nace como borrador, para toda la tienda, con textos limpios', async () => {
    const { prisma, service } = build();

    await service.create(dto({ description: '  20% en todo  ', rewardDescription: ' x ', imageUrl: ' /api/yalika/media/image/a.png ' }));

    const data = prisma.promotion.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      title: 'Verano',
      description: '20% en todo',
      rewardDescription: 'x',
      imageUrl: '/api/yalika/media/image/a.png',
      status: 'draft',
      scope: 'all',
      featured: false,
      companyId: COMPANY,
    });
    expect(data.products).toBeUndefined();
  });

  it('con productos queda limitada a los seleccionados', async () => {
    const { prisma, service } = build();
    prisma.product.findMany.mockResolvedValue([{ id: PRODUCT_A }, { id: PRODUCT_B }]);

    await service.create(dto({ productIds: [PRODUCT_A, PRODUCT_B] }));

    const data = prisma.promotion.create.mock.calls[0][0].data;
    expect(data.scope).toBe('selected_products');
    expect(data.products).toEqual({ create: [{ productId: PRODUCT_A }, { productId: PRODUCT_B }] });
  });
});

describe('Promociones: consultar', () => {
  it('listar exige que la empresa exista', async () => {
    const { prisma, service } = build();
    prisma.company.findUnique.mockResolvedValue(null);

    await expect(service.findByCompany(COMPANY)).rejects.toThrow(NotFoundException);
  });

  it('listar solo trae las de esa empresa, las más nuevas primero', async () => {
    const { prisma, service } = build();

    await service.findByCompany(COMPANY);

    expect(prisma.promotion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: COMPANY }, orderBy: { createdAt: 'desc' } }),
    );
  });

  it('una promoción que no existe da 404', async () => {
    const { prisma, service } = build();
    prisma.promotion.findUnique.mockResolvedValue(null);

    await expect(service.findOne('nada')).rejects.toThrow('La promoción no existe');
  });

  describe('vista pública', () => {
    it.each([
      ['sin sitio', null],
      ['sitio en borrador', { status: 'draft' }],
      ['sitio despublicado', { status: 'archived' }],
    ])('%s: no muestra promociones', async (_name, site) => {
      const { prisma, service } = build();
      prisma.site.findFirst.mockResolvedValue(site);

      await expect(service.findPublicByCompany(COMPANY)).rejects.toThrow('no está publicado');
      expect(prisma.promotion.findMany).not.toHaveBeenCalled();
    });

    it('solo trae activas y vigentes de esa empresa', async () => {
      const { prisma, service } = build();
      prisma.site.findFirst.mockResolvedValue({ status: 'published' });
      const before = Date.now();

      await service.findPublicByCompany(COMPANY);

      const where = prisma.promotion.findMany.mock.calls[0][0].where;
      expect(where.companyId).toBe(COMPANY);
      expect(where.status).toBe('active');
      expect(where.startsAt.lte.getTime()).toBeGreaterThanOrEqual(before);
      expect(where.endsAt.gte.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('no expone costo, SKU ni existencias de los productos', async () => {
      const { prisma, service } = build();
      prisma.site.findFirst.mockResolvedValue({ status: 'published' });

      await service.findPublicByCompany(COMPANY);

      const query = prisma.promotion.findMany.mock.calls[0][0];
      expect(query.include.products.include.product).toEqual({ select: { id: true, name: true } });
    });

    it('las destacadas salen primero', async () => {
      const { prisma, service } = build();
      prisma.site.findFirst.mockResolvedValue({ status: 'published' });

      await service.findPublicByCompany(COMPANY);

      expect(prisma.promotion.findMany.mock.calls[0][0].orderBy).toEqual([{ featured: 'desc' }, { createdAt: 'desc' }]);
    });
  });
});

describe('Promociones: ciclo de vida', () => {
  const found = (service: ReturnType<typeof build>, row: object | null) => service.prisma.promotion.findUnique.mockResolvedValue(row);

  describe('activar', () => {
    it('no existe', async () => {
      const ctx = build();
      found(ctx, null);
      await expect(ctx.service.activate('p')).rejects.toThrow(NotFoundException);
    });

    it('una cerrada no vuelve a activarse', async () => {
      const ctx = build();
      found(ctx, { status: 'closed', endsAt: new Date(Date.now() + DAY) });
      await expect(ctx.service.activate('p')).rejects.toThrow('cerrada');
      expect(ctx.prisma.promotion.update).not.toHaveBeenCalled();
    });

    it('una vencida no se activa', async () => {
      const ctx = build();
      found(ctx, { status: 'draft', endsAt: new Date(Date.now() - 1000) });
      await expect(ctx.service.activate('p')).rejects.toThrow('terminó su vigencia');
    });

    it.each(['draft', 'paused'])('desde %s pasa a activa', async (status) => {
      const ctx = build();
      found(ctx, { status, endsAt: new Date(Date.now() + DAY) });

      await ctx.service.activate('p');

      expect(ctx.prisma.promotion.update).toHaveBeenCalledWith({ where: { id: 'p' }, data: { status: 'active' } });
    });
  });

  describe('pausar', () => {
    it.each(['draft', 'paused', 'closed'])('no se puede pausar una %s', async (status) => {
      const ctx = build();
      found(ctx, { status });
      await expect(ctx.service.pause('p')).rejects.toThrow('Solo una promoción activa');
      expect(ctx.prisma.promotion.update).not.toHaveBeenCalled();
    });

    it('una activa se pausa', async () => {
      const ctx = build();
      found(ctx, { status: 'active' });
      await ctx.service.pause('p');
      expect(ctx.prisma.promotion.update).toHaveBeenCalledWith({ where: { id: 'p' }, data: { status: 'paused' } });
    });
  });

  describe('cerrar', () => {
    it('cierra y anota cuándo', async () => {
      const ctx = build();
      found(ctx, { status: 'active' });

      await ctx.service.close('p');

      const data = ctx.prisma.promotion.update.mock.calls[0][0].data;
      expect(data.status).toBe('closed');
      expect(data.closedAt).toBeInstanceOf(Date);
    });

    it('cerrar dos veces no cambia la fecha de cierre', async () => {
      const ctx = build();
      const closed = { id: 'p', status: 'closed', closedAt: new Date('2026-01-01') };
      found(ctx, closed);

      await expect(ctx.service.close('p')).resolves.toBe(closed);
      expect(ctx.prisma.promotion.update).not.toHaveBeenCalled();
    });
  });

  describe('eliminar', () => {
    it.each(['active', 'paused', 'closed'])('una %s no se elimina (queda el historial)', async (status) => {
      const ctx = build();
      found(ctx, { status });
      await expect(ctx.service.removeDraft('p')).rejects.toThrow('nunca han sido publicadas');
      expect(ctx.prisma.promotion.delete).not.toHaveBeenCalled();
    });

    it('un borrador sí', async () => {
      const ctx = build();
      found(ctx, { status: 'draft' });

      await expect(ctx.service.removeDraft('p')).resolves.toEqual({ deleted: true, id: 'p' });
      expect(ctx.prisma.promotion.delete).toHaveBeenCalledWith({ where: { id: 'p' } });
    });

    it('no existe', async () => {
      const ctx = build();
      found(ctx, null);
      await expect(ctx.service.removeDraft('p')).rejects.toThrow(NotFoundException);
    });
  });
});
