import { createHash } from 'node:crypto';
import {
  BadRequestException, ConflictException, ForbiddenException, Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { PrismaService } from '../../prisma/prisma.service';
import { ReceiveProductsDto, SetVisibilityDto } from './dto/pos-inventory.dto';
import { calculateReception } from './pos-inventory.math';

@Injectable()
export class PosInventoryService {
  constructor(private readonly prisma: PrismaService) {}

  private assertCompany(companyId: string, actor: AuthenticatedUser) {
    if (companyId !== actor.companyId) {
      throw new ForbiddenException('Esta empresa no pertenece a la sesión');
    }
  }

  async receive(dto: ReceiveProductsDto, actor: AuthenticatedUser) {
    this.assertCompany(dto.companyId, actor);
    if (!dto.sourceName?.trim()) throw new BadRequestException('Indica quién entregó la mercancía');
    if (!Array.isArray(dto.lines) || dto.lines.length === 0 || dto.lines.length > 100) {
      throw new BadRequestException('La recepción debe tener entre 1 y 100 renglones');
    }

    const seen = new Set<string>();
    const prepared = dto.lines.map((line) => {
      const key = `${line.productId}:${line.variantId ?? ''}`;
      if (seen.has(key)) throw new BadRequestException('Agrupa las cajas de la misma variante en un solo renglón');
      seen.add(key);
      try {
        return { ...line, ...calculateReception(line.packs, line.unitsPerPack, line.costPerPack) };
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : 'Cantidad incorrecta');
      }
    });
    const payloadHash = createHash('sha256').update(JSON.stringify({
      companyId: dto.companyId,
      sourceName: dto.sourceName.trim(), reference: dto.reference?.trim() ?? null,
      notes: dto.notes?.trim() ?? null,
      lines: prepared.map((line) => ({ productId: line.productId,
        variantId: line.variantId ?? null, packs: line.packs,
        unitsPerPack: line.unitsPerPack, costPerPack: line.costPerPack ?? null })),
    })).digest('hex');

    const previous = await this.prisma.posStockReceipt.findUnique({
      where: { operationId: dto.operationId }, include: { movements: true },
    });
    if (previous) {
      if (previous.companyId !== dto.companyId || previous.payloadHash !== payloadHash) {
        throw new ConflictException('El identificador de operación ya se usó con otros datos');
      }
      return { ...previous, repeated: true };
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Claim the idempotency key before changing any stock. Unique DB index protects concurrency.
        const receipt = await tx.posStockReceipt.create({
          data: {
            operationId: dto.operationId, payloadHash,
            companyId: dto.companyId, actorId: actor.id,
            sourceName: dto.sourceName.trim(), reference: dto.reference?.trim(),
            notes: dto.notes?.trim(), totalCost: prepared.some((line) => line.totalCost === null)
              ? null : Math.round(prepared.reduce((total, line) => total + (line.totalCost ?? 0), 0) * 100) / 100,
          },
        });
        for (const line of prepared) {
          const product = await tx.product.findFirst({
            where: { id: line.productId, companyId: dto.companyId },
            include: { variants: { select: { id: true } } },
          });
          if (!product || product.status !== 'active') {
            throw new NotFoundException('Producto inexistente o inactivo en esta empresa');
          }
          if (!product.trackInventory) {
            throw new BadRequestException(`${product.name} no controla existencias`);
          }
          const recipe = await tx.productRecipe.findUnique({
            where: { productId: product.id }, select: { status: true },
          });
          if (recipe?.status === 'active') {
            throw new BadRequestException('Para productos con receta, recibe ingredientes mediante Inventario');
          }
          if (product.variants.length && !line.variantId) {
            throw new BadRequestException(`Selecciona una talla u opción para ${product.name}`);
          }
          let balanceAfter: number;
          if (line.variantId) {
            const variant = await tx.productVariant.findFirst({
              where: { id: line.variantId, productId: product.id, status: 'active' },
            });
            if (!variant) throw new NotFoundException('La variante no pertenece al producto');
            if (line.unitsPerPack !== 1) {
              throw new BadRequestException('Las variantes de ropa se reciben por pieza (conversión 1)');
            }
            const updated = await tx.productVariant.update({
              where: { id: variant.id }, data: {
                stock: { increment: line.units },
                unitCost: line.unitCost === null ? undefined : line.unitCost,
              },
            });
            balanceAfter = updated.stock;
          } else {
            if (line.unitsPerPack !== product.unitsPerPack) {
              throw new BadRequestException(`La presentación de ${product.name} es de ${product.unitsPerPack} unidades; revisa la conversión`);
            }
            const updated = await tx.product.update({
              where: { id: product.id }, data: {
                stock: { increment: line.units },
                unitCost: line.unitCost === null ? undefined : line.unitCost,
              },
            });
            balanceAfter = updated.stock;
          }
          await tx.posStockMovement.create({
            data: {
              companyId: dto.companyId, productId: product.id, variantId: line.variantId,
              receiptId: receipt.id, direction: 'in', reason: 'goods_receipt',
              quantity: line.units, balanceAfter, packs: line.packs,
              unitsPerPack: line.unitsPerPack, costPerPack: line.costPerPack,
              totalCost: line.totalCost, unitCost: line.unitCost, actorId: actor.id,
              reference: dto.reference?.trim(),
            },
          });
        }
        return tx.posStockReceipt.findUniqueOrThrow({
          where: { id: receipt.id }, include: { movements: true },
        });
      }, { timeout: 30000 });
    } catch (error) {
      // A simultaneous retry might win the unique index; return the same receipt only for identical payload.
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        const existing = await this.prisma.posStockReceipt.findUnique({
          where: { operationId: dto.operationId }, include: { movements: true },
        });
        if (existing && existing.companyId === dto.companyId && existing.payloadHash === payloadHash) {
          return { ...existing, repeated: true };
        }
        throw new ConflictException('Recepción duplicada con contenido diferente');
      }
      throw error;
    }
  }

  async listReceipts(companyId: string, actor: AuthenticatedUser) {
    this.assertCompany(companyId, actor);
    return this.prisma.posStockReceipt.findMany({
      where: { companyId }, include: { movements: {
        select: { productId: true, variantId: true, quantity: true, balanceAfter: true, unitCost: true, packs: true, unitsPerPack: true, costPerPack: true },
      } }, orderBy: { createdAt: 'desc' }, take: 50,
    });
  }

  async setVisibility(dto: SetVisibilityDto, actor: AuthenticatedUser) {
    this.assertCompany(dto.companyId, actor);
    if (!Array.isArray(dto.productIds) || dto.productIds.length < 1 || dto.productIds.length > 100 ||
        new Set(dto.productIds).size !== dto.productIds.length) {
      throw new BadRequestException('Selecciona de 1 a 100 productos sin repetir');
    }
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.product.count({
        where: { id: { in: dto.productIds }, companyId: dto.companyId },
      });
      if (count !== dto.productIds.length) throw new NotFoundException('Hay productos fuera de tu empresa');
      return tx.product.updateMany({
        where: { id: { in: dto.productIds }, companyId: dto.companyId },
        data: { webVisible: dto.webVisible },
      });
    });
  }
}
