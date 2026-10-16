import { CatalogService } from './catalog.service';

describe('Yaleka R8 barcodes', () => {
  it('reuses an existing generated internal barcode', async () => {
    const existing = { id: 'b1', value: 'YLK-ABC', generated: true };
    const prisma = {
      product: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', companyId: 'c1' }) },
      productBarcode: {
        findFirst: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
      },
    } as any;
    const service = new CatalogService(prisma);
    await expect(service.generateInternalBarcode('p1', 'c1')).resolves.toEqual(existing);
    expect(prisma.productBarcode.create).not.toHaveBeenCalled();
  });

  it('resolves a registered barcode only inside the requested company', async () => {
    const barcode = { value: '750123', unitsPerScan: 12, product: { id: 'p1' }, variant: null };
    const prisma = {
      productBarcode: { findFirst: jest.fn().mockResolvedValue(barcode) },
      product: { findFirst: jest.fn() },
      productVariant: { findFirst: jest.fn() },
    } as any;
    const service = new CatalogService(prisma);
    await expect(service.resolveBarcode('c1', '750123')).resolves.toEqual(barcode);
    expect(prisma.productBarcode.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ companyId: 'c1', value: '750123', active: true }),
    }));
  });
});
