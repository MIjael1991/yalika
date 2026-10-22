import { NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { CatalogService } from '../catalog/catalog.service';
import { PromotionService } from '../promotion/promotion.service';
import { SiteService } from './site.service';

/**
 * Lo que ve un visitante anónimo de una página publicada. Prisma simulado.
 * Regla de oro: nada interno (costos, SKU, borradores, páginas sin publicar).
 */

const COMPANY = 'company-1';

const PRIVATE_PRODUCT_FIELDS = ['unitCost', 'sku', 'lowStockAt', 'packSalePrice', 'unitsPerPack', 'companyId', 'catalogId'];

function asPrisma(value: unknown) {
  return value as unknown as PrismaService;
}

describe('Sitio público · página', () => {
  it('solo entrega páginas publicadas', async () => {
    const prisma = { site: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new SiteService(asPrisma(prisma));
    await expect(service.findPublic('borrador')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.site.findFirst.mock.calls[0][0].where).toEqual({ slug: 'borrador', status: 'published' });
  });

  it('solo incluye secciones activas, en orden, y de la empresa únicamente id y nombre', async () => {
    const site = { id: 's1', slug: 'luna', sections: [] };
    const prisma = { site: { findFirst: jest.fn().mockResolvedValue(site) } };
    const service = new SiteService(asPrisma(prisma));
    await expect(service.findPublic('luna')).resolves.toBe(site);
    const args = prisma.site.findFirst.mock.calls[0][0];
    expect(args.include.sections).toEqual({ where: { enabled: true }, orderBy: { sortOrder: 'asc' } });
    expect(args.include.company).toEqual({ select: { id: true, name: true } });
  });
});

describe('Sitio público · catálogo', () => {
  function setup(siteExists = true) {
    const prisma = {
      site: { findFirst: jest.fn().mockResolvedValue(siteExists ? { status: 'published' } : null) },
      product: { findMany: jest.fn().mockResolvedValue([]) },
      commerceReservation: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return { prisma, service: new CatalogService(asPrisma(prisma)) };
  }

  it('no muestra el escaparate si la empresa no tiene página publicada', async () => {
    const { prisma, service } = setup(false);
    await expect(service.findPublicProductsByCompany(COMPANY)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
    expect(prisma.site.findFirst.mock.calls[0][0].where).toEqual({ companyId: COMPANY, status: 'published' });
  });

  it('solo productos activos, visibles en web y de la empresa', async () => {
    const { prisma, service } = setup();
    await service.findPublicProductsByCompany(COMPANY);
    expect(prisma.product.findMany.mock.calls[0][0].where).toEqual({ companyId: COMPANY, status: 'active', webVisible: true });
  });

  it('nunca selecciona costo, SKU ni datos internos del producto', async () => {
    const { prisma, service } = setup();
    await service.findPublicProductsByCompany(COMPANY);
    const select = prisma.product.findMany.mock.calls[0][0].select;
    expect(prisma.product.findMany.mock.calls[0][0].include).toBeUndefined();
    for (const field of PRIVATE_PRODUCT_FIELDS) expect(select).not.toHaveProperty(field);
    for (const field of ['id', 'name', 'price', 'images', 'variants']) expect(select).toHaveProperty(field);
  });

  it('la existencia que ve el público es lo vendible: descuenta lo apartado', async () => {
    const { prisma, service } = setup();
    prisma.product.findMany.mockResolvedValue([
      { id: 'p1', name: 'Blusa', stock: 4, variants: [] },
      { id: 'p2', name: 'Vestido', stock: 0, variants: [{ id: 'v1', stock: 5 }, { id: 'v2', stock: 2 }] },
      { id: 'p3', name: 'Cartera', stock: 3, variants: [] },
    ]);
    prisma.commerceReservation.findMany.mockResolvedValue([
      { items: [{ productId: 'p1', variantId: null, quantity: 1 }, { productId: 'p2', variantId: 'v1', quantity: 2 }] },
      { items: [{ productId: 'p1', variantId: null, quantity: 1 }, { productId: 'p3', variantId: null, quantity: 9 }] },
    ]);
    const result = await service.findPublicProductsByCompany(COMPANY);
    expect(result.find((p) => p.id === 'p1')?.stock).toBe(2);
    expect(result.find((p) => p.id === 'p2')?.variants.map((v) => v.stock)).toEqual([3, 2]);
    expect(result.find((p) => p.id === 'p3')?.stock).toBe(0);
  });

  it('solo cuenta apartados de la empresa y en estados que bloquean existencia', async () => {
    const { prisma, service } = setup();
    await service.findPublicProductsByCompany(COMPANY);
    const where = prisma.commerceReservation.findMany.mock.calls[0][0].where;
    expect(where.companyId).toBe(COMPANY);
    expect(where.status.in).toEqual(['hold', 'deposit_reported', 'active', 'review_expired']);
  });

  it('solo expone variantes activas y sin costo', async () => {
    const { prisma, service } = setup();
    await service.findPublicProductsByCompany(COMPANY);
    const variants = prisma.product.findMany.mock.calls[0][0].select.variants;
    expect(variants.where).toEqual({ status: 'active' });
    expect(variants.select).not.toHaveProperty('unitCost');
    expect(variants.select).not.toHaveProperty('sku');
  });
});

describe('Sitio público · promociones', () => {
  function setup(status: string | null = 'published') {
    const prisma = {
      site: { findFirst: jest.fn().mockResolvedValue(status ? { status } : null) },
      promotion: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return { prisma, service: new PromotionService(asPrisma(prisma)) };
  }

  it.each([null, 'draft', 'unpublished'])('no entrega promociones si la página principal está %s', async (status) => {
    const { prisma, service } = setup(status);
    await expect(service.findPublicByCompany(COMPANY)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.promotion.findMany).not.toHaveBeenCalled();
  });

  it('solo promociones activas y vigentes hoy', async () => {
    const { prisma, service } = setup();
    const before = Date.now();
    await service.findPublicByCompany(COMPANY);
    const where = prisma.promotion.findMany.mock.calls[0][0].where;
    expect(where.companyId).toBe(COMPANY);
    expect(where.status).toBe('active');
    expect(where.startsAt.lte.getTime()).toBeGreaterThanOrEqual(before - 50);
    expect(where.endsAt.gte.getTime()).toBeGreaterThanOrEqual(before - 50);
  });

  it('cada promoción lleva la dirección pública de la página (para el QR del ticket)', async () => {
    const prisma = {
      site: { findFirst: jest.fn().mockResolvedValue({ status: 'published', slug: 'luna' }) },
      promotion: { findMany: jest.fn().mockResolvedValue([{ id: 'p1', title: '2x1' }]) },
    };
    const service = new PromotionService(asPrisma(prisma));
    await expect(service.findPublicByCompany(COMPANY)).resolves.toEqual([{ id: 'p1', title: '2x1', siteSlug: 'luna' }]);
    expect(prisma.site.findFirst.mock.calls[0][0].select).toEqual({ status: true, slug: true });
  });

  it('los productos de la promoción solo llevan id y nombre (sin costo ni SKU)', async () => {
    const { prisma, service } = setup();
    await service.findPublicByCompany(COMPANY);
    const product = prisma.promotion.findMany.mock.calls[0][0].include.products.include.product;
    expect(product).toEqual({ select: { id: true, name: true } });
  });
});
