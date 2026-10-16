import { BadRequestException } from '@nestjs/common';
import { OrderService } from './order.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('YALIKA R11B-3B: aislamiento al crear pedidos', () => {
  const companyId = 'empresa-a';
  const boutique = 'catalogo-boutique';
  const papeleria = 'catalogo-papeleria';
  const makeProduct = (id: string, catalogId: string, owner = companyId) => ({
    id, companyId: owner, catalogId, name: id, price: 50, sku: id, status: 'active',
  });

  function setup(products: Record<string, ReturnType<typeof makeProduct>>, catalogIsValid = true) {
    const prisma = {
      company: { findUnique: jest.fn().mockResolvedValue({ id: companyId }) },
      commerceCatalog: { findFirst: jest.fn().mockResolvedValue(catalogIsValid ? { id: boutique, companyId, status: 'active' } : null) },
      commerceReservation: { findFirst: jest.fn().mockResolvedValue(null) },
      product: { findUnique: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(products[where.id] ?? null)) },
      productVariant: { findUnique: jest.fn() },
      order: { create: jest.fn() },
      inventoryMovement: { create: jest.fn() },
      $transaction: jest.fn(),
    };
    return { prisma, service: new OrderService(prisma as unknown as PrismaService) };
  }

  const dto = (ids: string[], catalogId?: string, reservationId?: string): any => ({
    companyId, ...(catalogId ? { catalogId } : {}),
    ...(reservationId ? { reservationId } : {}),
    items: ids.map((productId) => ({ productId, quantity: 1 })),
  });

  const noWrites = (prisma: ReturnType<typeof setup>['prisma']) => {
    expect(prisma.order.create).not.toHaveBeenCalled();
    expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  };

  it('rechaza un catalogo explicitamente ajeno o inactivo, sin crear pedido', async () => {
    const { prisma, service } = setup({ p1: makeProduct('p1', boutique) }, false);
    await expect(service.create(dto(['p1'], boutique))).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.product.findUnique).not.toHaveBeenCalled();
    noWrites(prisma);
  });

  it('rechaza productos pertenecientes a otra empresa', async () => {
    const { prisma, service } = setup({ p1: makeProduct('p1', boutique, 'empresa-b') });
    await expect(service.create(dto(['p1'], boutique))).rejects.toBeInstanceOf(BadRequestException);
    noWrites(prisma);
  });

  it('rechaza producto de otro catalogo cuando el POS envio Boutique', async () => {
    const { prisma, service } = setup({ p2: makeProduct('p2', papeleria) });
    await expect(service.create(dto(['p2'], boutique))).rejects.toBeInstanceOf(BadRequestException);
    noWrites(prisma);
  });

  it('rechaza mezcla de Boutique y Papeleria incluso sin catalogId explicitado', async () => {
    const { prisma, service } = setup({ p1: makeProduct('p1', boutique), p2: makeProduct('p2', papeleria) });
    await expect(service.create(dto(['p1', 'p2']))).rejects.toBeInstanceOf(BadRequestException);
    noWrites(prisma);
  });

  it('rechaza producto sin catalogo asignado', async () => {
    const { prisma, service } = setup({ p1: makeProduct('p1', '' ) });
    await expect(service.create(dto(['p1']))).rejects.toBeInstanceOf(BadRequestException);
    noWrites(prisma);
  });

  it('rechaza apartado enlazado a otro catalogo sin escribir pedido', async () => {
    const { prisma, service } = setup({ p1: makeProduct('p1', boutique) });
    prisma.commerceReservation.findFirst.mockResolvedValue({
      id: 'apartado-papeleria', companyId, catalogId: papeleria,
      items: [{ productId: 'p1', variantId: null, quantity: 1 }],
      status: 'active',
    } as any);
    await expect(service.create(dto(['p1'], boutique, 'apartado-papeleria')))
      .rejects.toBeInstanceOf(BadRequestException);
    noWrites(prisma);
  });
});