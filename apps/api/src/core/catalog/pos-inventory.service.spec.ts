import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { PosInventoryService } from './pos-inventory.service';

const actor = { id: 'u-1', companyId: 'company-a' } as AuthenticatedUser;
const uuid = 'e6815696-5f34-4497-ac89-817718ed25a2';
const input = { companyId: 'company-a', operationId: uuid, sourceName: 'Proveedor',
  lines: [{ productId: uuid, packs: 5, unitsPerPack: 12, costPerPack: 90 }] };

describe('POS R7: recepción con autorización e idempotencia', () => {
  it('rechaza empresas ajenas antes de leer la base', async () => {
    const findUnique = jest.fn();
    const service = new PosInventoryService({ posStockReceipt: { findUnique } } as unknown as PrismaService);
    await expect(service.receive({ ...input, companyId: 'company-b' }, actor)).rejects.toBeInstanceOf(ForbiddenException);
    expect(findUnique).not.toHaveBeenCalled();
  });
  it('no escribe stock si existe una recepción incompatible con el mismo UUID', async () => {
    const previous = { id: uuid, companyId: 'company-a', payloadHash: 'contenido-distinto', movements: [{ quantity: 60 }] };
    const tx = jest.fn();
    const service = new PosInventoryService({
      posStockReceipt: { findUnique: jest.fn().mockResolvedValue(previous) }, $transaction: tx,
    } as unknown as PrismaService);
    await expect(service.receive(input, actor)).rejects.toBeInstanceOf(ConflictException);
    expect(tx).not.toHaveBeenCalled();
  });
  it('rechaza renglones repetidos en la misma recepción', async () => {
    const service = new PosInventoryService({} as PrismaService);
    await expect(service.receive({ ...input, lines: [input.lines[0], input.lines[0]] }, actor))
      .rejects.toBeInstanceOf(BadRequestException);
  });
  it('rechaza publicar productos de otra empresa', async () => {
    const tx = { product: { count: jest.fn().mockResolvedValue(0), updateMany: jest.fn() } };
    const service = new PosInventoryService({ $transaction: (fn: (value: any) => unknown) => fn(tx) } as unknown as PrismaService);
    await expect(service.setVisibility({ companyId: 'company-a', productIds: [uuid], webVisible: true }, actor))
      .rejects.toThrow();
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });
});
