jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../../prisma/prisma.service';
import { CatalogService } from './catalog.service';

describe('CatalogService product photographs', () => {
  it('marks only the selected photograph as primary', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const update = jest.fn().mockResolvedValue({
      id: 'image-2',
      isPrimary: true,
    });
    const transactionClient = {
      productImage: {
        updateMany,
        update,
      },
    };
    const service = new CatalogService({
      productImage: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'image-2',
          productId: 'product-1',
          isPrimary: false,
        }),
      },
      $transaction: jest.fn(
        (callback: (tx: typeof transactionClient) => unknown) =>
          callback(transactionClient),
      ),
    } as unknown as PrismaService);

    await service.makeImagePrimary('product-1', 'image-2');

    expect(updateMany).toHaveBeenCalledWith({
      where: { productId: 'product-1' },
      data: { isPrimary: false },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'image-2' },
      data: { isPrimary: true },
    });
  });

  it('promotes the next photograph when the primary one is removed', async () => {
    const deleteImage = jest.fn().mockResolvedValue({});
    const findFirst = jest.fn().mockResolvedValue({
      id: 'image-2',
    });
    const update = jest.fn().mockResolvedValue({});
    const transactionClient = {
      productImage: {
        delete: deleteImage,
        findFirst,
        update,
      },
    };
    const service = new CatalogService({
      productImage: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'image-1',
          productId: 'product-1',
          isPrimary: true,
        }),
      },
      $transaction: jest.fn(
        (callback: (tx: typeof transactionClient) => unknown) =>
          callback(transactionClient),
      ),
    } as unknown as PrismaService);

    await service.removeImage('product-1', 'image-1');

    expect(deleteImage).toHaveBeenCalledWith({
      where: { id: 'image-1' },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'image-2' },
      data: { isPrimary: true },
    });
  });

  it('rejects a photograph from another product', async () => {
    const service = new CatalogService({
      productImage: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService);

    await expect(
      service.removeImage('product-1', 'image-other'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CatalogService product options', () => {
  it('updates the name, own price and stock of an option', async () => {
    const update = jest.fn().mockResolvedValue({
      id: 'variant-1',
      name: 'Grande',
      price: 129,
      stock: 4,
    });
    const service = new CatalogService({
      productVariant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'variant-1',
        }),
        update,
      },
    } as unknown as PrismaService);

    await service.updateVariant('variant-1', {
      name: ' Grande ',
      price: 129,
      stock: 4,
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'variant-1' },
      data: {
        name: 'Grande',
        price: 129,
        stock: 4,
      },
    });
  });

  it('rejects an option that does not exist', async () => {
    const service = new CatalogService({
      productVariant: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService);

    await expect(
      service.updateVariant('missing-variant', { stock: 0 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
