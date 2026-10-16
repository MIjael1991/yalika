import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('Yalika R11B-3A: aislamiento de catalogos', () => {
  const companyId = 'empresa-a';
  const otherCompanyId = 'empresa-b';
  const catalogId = 'boutique';

  function setup() {
    const prisma = {
      company: { findUnique: jest.fn().mockResolvedValue({ id: companyId }) },
      commerceCatalog: {
        findFirst: jest.fn().mockResolvedValue({ id: catalogId, companyId, status: 'active' }),
        upsert: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: catalogId, companyId }),
      },
      productCategory: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'categoria-1', catalogId }),
        create: jest.fn(),
      },
      product: {
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockResolvedValue({ id: 'producto-1', catalogId }),
        create: jest.fn(),
      },
      commerceReservationItem: { count: jest.fn().mockResolvedValue(0) },
    };
    return { prisma, service: new CatalogService(prisma as unknown as PrismaService) };
  }

  it('no acepta un catalogo de otra empresa al reasignar un producto', async () => {
    const { prisma, service } = setup();
    prisma.commerceCatalog.findFirst.mockResolvedValue(null);
    await expect(service.assignProductCatalog(companyId, 'producto-1', 'catalogo-ajeno'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.commerceCatalog.findFirst).toHaveBeenCalledWith({
      where: { id: 'catalogo-ajeno', companyId, status: 'active' },
    });
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('rechaza producto ajeno a la empresa antes de actualizar', async () => {
    const { prisma, service } = setup();
    prisma.product.findFirst.mockResolvedValue(null);
    await expect(service.assignProductCatalog(companyId, 'producto-ajeno', catalogId))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.product.findFirst).toHaveBeenCalledWith({ where: { id: 'producto-ajeno', companyId } });
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('bloquea traslado de producto con apartados activos', async () => {
    const { prisma, service } = setup();
    prisma.product.findFirst.mockResolvedValue({ id: 'producto-1', companyId, catalogId: 'papeleria', categoryId: null });
    prisma.commerceReservationItem.count.mockResolvedValue(2);
    await expect(service.assignProductCatalog(companyId, 'producto-1', catalogId))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('conserva el inventario y desacopla una categoria de otro catalogo', async () => {
    const { prisma, service } = setup();
    prisma.product.findFirst.mockResolvedValue({ id: 'producto-1', companyId, catalogId: 'papeleria', categoryId: 'categoria-1', stock: 9 });
    prisma.productCategory.findUnique.mockResolvedValue({ id: 'categoria-1', catalogId: 'papeleria' });
    await service.assignProductCatalog(companyId, 'producto-1', catalogId);
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'producto-1' }, data: { catalogId, categoryId: null },
    });
  });

  it('rechaza categoria perteneciente a otra empresa', async () => {
    const { prisma, service } = setup();
    prisma.productCategory.findFirst.mockResolvedValue(null);
    await expect(service.assignCategoryCatalog(companyId, 'categoria-ajena', catalogId))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.productCategory.update).not.toHaveBeenCalled();
  });

  it('no traslada una categoria que contiene productos en otro catalogo', async () => {
    const { prisma, service } = setup();
    prisma.productCategory.findFirst.mockResolvedValue({ id: 'categoria-1', companyId, catalogId: 'papeleria' });
    prisma.product.count.mockResolvedValue(1);
    await expect(service.assignCategoryCatalog(companyId, 'categoria-1', catalogId))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.productCategory.update).not.toHaveBeenCalled();
  });

  it('impide crear producto con categoria perteneciente a otro catalogo', async () => {
    const { prisma, service } = setup();
    prisma.productCategory.findUnique.mockResolvedValue({ id: 'categoria-1', companyId, catalogId: 'papeleria' });
    await expect(service.createProduct({ companyId, catalogId, categoryId: 'categoria-1', name: 'Articulo', price: 20 } as any))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it('impide duplicar el nombre de catalogo dentro de una empresa', async () => {
    const { prisma, service } = setup();
    await expect(service.createCommerceCatalog(companyId, ' Boutique '))
      .rejects.toBeInstanceOf(ConflictException);
    expect(prisma.commerceCatalog.findFirst).toHaveBeenCalledWith({ where: { companyId, name: 'Boutique' } });
    expect(prisma.commerceCatalog.create).not.toHaveBeenCalled();
  });

  it('no confunde filtros de empresa al resolver un catalogo', async () => {
    const { prisma, service } = setup();
    prisma.commerceCatalog.findFirst.mockImplementation(async ({where}: any) => {
      if (where.companyId === otherCompanyId) return null;
      return { id: catalogId, companyId };
    });
    await expect(service.assignProductCatalog(otherCompanyId, 'producto-1', catalogId))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.product.update).not.toHaveBeenCalled();
  });
});