import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { CatalogService } from './catalog.service';

/**
 * Lectura y alta de códigos de barras (cámara, lector USB o captura manual).
 * Regla: el código solo existe dentro de su empresa y nunca se asigna dos veces.
 */

type Row = Record<string, any>;

function setup(overrides: Row = {}) {
  const prisma: Record<string, any> = {
    product: { findUnique: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
    productVariant: { findUnique: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
    productBarcode: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(({ data }: Row) => Promise.resolve({ id: 'b1', ...data })),
    },
    ...overrides,
  };
  return { service: new CatalogService(prisma as never), prisma };
}

describe('Leer un código al vender o capturar', () => {
  it('un código registrado devuelve su producto y cuántas unidades representa', async () => {
    const barcode = { value: '750123', kind: 'pack', unitsPerScan: 12, product: { id: 'p1' }, variant: null };
    const { service, prisma } = setup();
    prisma.productBarcode.findFirst.mockResolvedValue(barcode);
    await expect(service.resolveBarcode('c1', '750123')).resolves.toBe(barcode);
    expect(prisma.product.findFirst).not.toHaveBeenCalled();
  });

  it('limpia espacios y saltos de línea que meten los lectores', async () => {
    const { service, prisma } = setup();
    prisma.productBarcode.findFirst.mockResolvedValue({ value: '750123' });
    await service.resolveBarcode('c1', '  750123\n');
    expect(prisma.productBarcode.findFirst.mock.calls[0][0].where).toEqual({ companyId: 'c1', value: '750123', active: true });
  });

  it('solo busca códigos activos y de la empresa de la sesión', async () => {
    const { service, prisma } = setup();
    await expect(service.resolveBarcode('c9', 'X1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.productBarcode.findFirst.mock.calls[0][0].where).toMatchObject({ companyId: 'c9', active: true });
    expect(prisma.product.findFirst.mock.calls[0][0].where).toMatchObject({ companyId: 'c9', status: 'active' });
    expect(prisma.productVariant.findFirst.mock.calls[0][0].where).toMatchObject({ status: 'active', product: { companyId: 'c9' } });
  });

  it('si no hay código, intenta con el SKU del producto (1 unidad)', async () => {
    const { service, prisma } = setup();
    prisma.product.findFirst.mockResolvedValue({ id: 'p1', name: 'Pluma' });
    const result: any = await service.resolveBarcode('c1', 'SKU-1');
    expect(result).toMatchObject({ format: 'SKU', unitsPerScan: 1, variant: null, product: { id: 'p1' } });
    expect(prisma.productVariant.findFirst).not.toHaveBeenCalled();
  });

  it('si tampoco, intenta con el SKU de una variante', async () => {
    const { service, prisma } = setup();
    const product = { id: 'p1' };
    prisma.productVariant.findFirst.mockResolvedValue({ id: 'v1', product });
    const result: any = await service.resolveBarcode('c1', 'SKU-M');
    expect(result).toMatchObject({ unitsPerScan: 1, product, variant: { id: 'v1' } });
  });

  it('un código desconocido avisa "Código no registrado"', async () => {
    const { service } = setup();
    await expect(service.resolveBarcode('c1', 'zzz')).rejects.toThrow('Código no registrado');
  });
});

describe('Asignar un código a un producto', () => {
  const input = (extra: Row = {}) => ({ value: ' 750123 ', ...extra }) as never;

  it('producto de otra empresa o inexistente', async () => {
    const { service, prisma } = setup();
    prisma.product.findUnique.mockResolvedValue({ id: 'p1', companyId: 'otra' });
    await expect(service.addBarcode('p1', input(), 'c1')).rejects.toBeInstanceOf(NotFoundException);
    prisma.product.findUnique.mockResolvedValue(null);
    await expect(service.addBarcode('p1', input(), 'c1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.productBarcode.create).not.toHaveBeenCalled();
  });

  it('código vacío', async () => {
    const { service, prisma } = setup();
    prisma.product.findUnique.mockResolvedValue({ id: 'p1', companyId: 'c1' });
    await expect(service.addBarcode('p1', input({ value: '   ' }), 'c1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('la variante debe ser del mismo producto', async () => {
    const { service, prisma } = setup();
    prisma.product.findUnique.mockResolvedValue({ id: 'p1', companyId: 'c1' });
    prisma.productVariant.findUnique.mockResolvedValue({ productId: 'p2' });
    await expect(service.addBarcode('p1', input({ variantId: 'v1' }), 'c1')).rejects.toThrow(/no pertenece al producto/);
    prisma.productVariant.findUnique.mockResolvedValue(null);
    await expect(service.addBarcode('p1', input({ variantId: 'v1' }), 'c1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('un código ya usado en la empresa no se asigna a otro artículo', async () => {
    const { service, prisma } = setup();
    prisma.product.findUnique.mockResolvedValue({ id: 'p1', companyId: 'c1' });
    prisma.productBarcode.findFirst.mockResolvedValue({ id: 'b0' });
    await expect(service.addBarcode('p1', input(), 'c1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.productBarcode.findFirst.mock.calls[0][0].where).toEqual({ companyId: 'c1', value: '750123' });
    expect(prisma.productBarcode.create).not.toHaveBeenCalled();
  });

  it('crea con valores por omisión seguros', async () => {
    const { service, prisma } = setup();
    prisma.product.findUnique.mockResolvedValue({ id: 'p1', companyId: 'c1' });
    await service.addBarcode('p1', input(), 'c1');
    expect(prisma.productBarcode.create.mock.calls[0][0].data).toEqual({
      value: '750123',
      format: 'CODE128',
      kind: 'unit',
      unitsPerScan: 1,
      active: true,
      generated: false,
      companyId: 'c1',
      productId: 'p1',
      variantId: undefined,
    });
  });

  it('código de caja guarda cuántas unidades representa', async () => {
    const { service, prisma } = setup();
    prisma.product.findUnique.mockResolvedValue({ id: 'p1', companyId: 'c1' });
    await service.addBarcode('p1', input({ kind: 'pack', unitsPerScan: 12 }), 'c1');
    expect(prisma.productBarcode.create.mock.calls[0][0].data).toMatchObject({ kind: 'pack', unitsPerScan: 12 });
  });
});

describe('Código interno para etiquetar productos sin código', () => {
  const PID = 'e6815696-5f34-4497-ac89-817718ed25a2';

  it('genera un código YLK corto y estable por producto', async () => {
    const { service, prisma } = setup();
    prisma.product.findUnique.mockResolvedValue({ id: PID, companyId: 'c1' });
    await service.generateInternalBarcode(PID, 'c1');
    expect(prisma.productBarcode.create.mock.calls[0][0].data).toMatchObject({
      value: 'YLK-E68156965F344497',
      format: 'CODE39',
      kind: 'internal',
      generated: true,
      companyId: 'c1',
    });
  });

  it('si el código ya lo usa otro, agrega un sufijo para no chocar', async () => {
    const { service, prisma } = setup();
    prisma.product.findUnique.mockResolvedValue({ id: PID, companyId: 'c1' });
    prisma.productBarcode.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'otro' });
    await service.generateInternalBarcode(PID, 'c1');
    expect(prisma.productBarcode.create.mock.calls[0][0].data.value).toMatch(/^YLK-E68156965F344497-[0-9A-Z]+$/);
  });

  it('producto de otra empresa', async () => {
    const { service, prisma } = setup();
    prisma.product.findUnique.mockResolvedValue({ id: PID, companyId: 'otra' });
    await expect(service.generateInternalBarcode(PID, 'c1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.productBarcode.create).not.toHaveBeenCalled();
  });
});
