import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { CreateInventoryCountDto } from './dto/create-inventory-count.dto';
import { CreateStockReceiptDto } from './dto/create-stock-receipt.dto';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async createSupplier(
    dto: CreateSupplierDto,
  ) {
    const company =
      await this.prisma.company.findUnique({
        where: {
          id: dto.companyId,
        },
      });

    if (!company) {
      throw new NotFoundException(
        'La empresa no existe',
      );
    }

    const existing =
      await this.prisma.supplier.findFirst({
        where: {
          companyId: dto.companyId,
          name: dto.name.trim(),
        },
      });

    if (existing) {
      throw new ConflictException(
        'Este proveedor ya está registrado',
      );
    }

    return this.prisma.supplier.create({
      data: {
        name: dto.name.trim(),
        contactName:
          dto.contactName?.trim(),
        phone:
          dto.phone?.trim(),
        email:
          dto.email?.trim().toLowerCase(),
        notes:
          dto.notes?.trim(),
        trusted:
          dto.trusted ?? false,
        companyId:
          dto.companyId,
      },
    });
  }

  async findSuppliersByCompany(
    companyId: string,
  ) {
    return this.prisma.supplier.findMany({
      where: {
        companyId,
        status: 'active',
      },
      orderBy: [
        {
          trusted: 'desc',
        },
        {
          name: 'asc',
        },
      ],
    });
  }

  async createItem(
    dto: CreateInventoryItemDto,
  ) {
    const company =
      await this.prisma.company.findUnique({
        where: {
          id: dto.companyId,
        },
      });

    if (!company) {
      throw new NotFoundException(
        'La empresa no existe',
      );
    }

    if (dto.sku?.trim()) {
      const existing =
        await this.prisma.inventoryItem.findFirst({
          where: {
            companyId: dto.companyId,
            sku: dto.sku.trim(),
          },
        });

      if (existing) {
        throw new ConflictException(
          'Ya existe un artículo con este SKU',
        );
      }
    }

    return this.prisma.inventoryItem.create({
      data: {
        name:
          dto.name.trim(),

        sku:
          dto.sku?.trim(),

        kind:
          dto.kind ?? 'merchandise',

        unit:
         dto.unit,

          purchaseUnit:
          dto.purchaseUnit,

      purchaseConversion:
       dto.purchaseConversion ?? 1,

quantity:
  dto.initialQuantity ?? 0,

        minimumStock:
          dto.minimumStock ?? 0,

        averageCost:
  dto.averageCost ?? 0,

trackingMode:
  dto.trackingMode ?? 'exact',

countEveryDays:
  dto.countEveryDays,

companyId:
  dto.companyId,
      },
    });
  }

  async findItemsByCompany(
    companyId: string,
  ) {
    const items =
      await this.prisma.inventoryItem.findMany({
        where: {
          companyId,
          status: 'active',
        },

        orderBy: {
          name: 'asc',
        },
      });

    return items.map((item) => ({
      ...item,

      lowStock:
        item.quantity <=
        item.minimumStock,
    }));
  }

  async findMovementsByItem(
    inventoryItemId: string,
  ) {
    const item =
      await this.prisma.inventoryItem.findUnique({
        where: {
          id: inventoryItemId,
        },
      });

    if (!item) {
      throw new NotFoundException(
        'El artículo de inventario no existe',
      );
    }

    return this.prisma.stockMovement.findMany({
      where: {
        inventoryItemId,
      },

      include: {
        supplier: true,
      },

      orderBy: {
        occurredAt: 'desc',
      },
    });
  }

  async findMovementsByCompany(
    companyId: string,
  ) {
    return this.prisma.stockMovement.findMany({
      where: {
        companyId,
      },

      include: {
        inventoryItem: true,
        supplier: true,
      },

      orderBy: {
        occurredAt: 'desc',
      },
    });
  }

  async createMovement(
    dto: CreateStockMovementDto,
  ) {
    const inboundReasons = [
      'supplier_delivery',
      'manual_purchase',
      'return',
      'adjustment_in',
    ];

    const outboundReasons = [
  'sale',
  'consumption',
  'recipe_consumption',

  'spoilage',
  'overportion',
  'complimentary',
  'staff_consumption',

  'damage',
  'expiration',

  'adjustment_out',
];

    if (
      dto.direction === 'in' &&
      !inboundReasons.includes(dto.reason)
    ) {
      throw new BadRequestException(
        'El motivo seleccionado no corresponde a una entrada',
      );
    }

    if (
      dto.direction === 'out' &&
      !outboundReasons.includes(dto.reason)
    ) {
      throw new BadRequestException(
        'El motivo seleccionado no corresponde a una salida',
      );
    }

    if (
      dto.reason === 'supplier_delivery' &&
      !dto.supplierId
    ) {
      throw new BadRequestException(
        'Una entrega de proveedor necesita supplierId',
      );
    }

    if (dto.supplierId) {
      const supplier =
        await this.prisma.supplier.findUnique({
          where: {
            id: dto.supplierId,
          },
        });

      if (!supplier) {
        throw new NotFoundException(
          'El proveedor no existe',
        );
      }

      if (
        supplier.companyId !==
        dto.companyId
      ) {
        throw new BadRequestException(
          'El proveedor no pertenece a esta empresa',
        );
      }
    }

    return this.prisma.$transaction(
      async (tx) => {
        const item =
          await tx.inventoryItem.findUnique({
            where: {
              id: dto.inventoryItemId,
            },
          });

        if (!item) {
          throw new NotFoundException(
            'El artículo de inventario no existe',
          );
        }

        if (
          item.companyId !==
          dto.companyId
        ) {
          throw new BadRequestException(
            'El artículo no pertenece a esta empresa',
          );
        }

        let updatedItem;

        if (dto.direction === 'in') {
          let newAverageCost =
            item.averageCost;

          if (
            dto.unitCost !== undefined
          ) {
            const currentValue =
              item.quantity *
              item.averageCost;

            const incomingValue =
              dto.quantity *
              dto.unitCost;

            const newQuantity =
              item.quantity +
              dto.quantity;

            newAverageCost =
              newQuantity > 0
                ? (
                    currentValue +
                    incomingValue
                  ) / newQuantity
                : dto.unitCost;
          }

          updatedItem =
            await tx.inventoryItem.update({
              where: {
                id: item.id,
              },

              data: {
                quantity: {
                  increment:
                    dto.quantity,
                },

                averageCost:
                  newAverageCost,
              },
            });
        } else {
          const result =
            await tx.inventoryItem.updateMany({
              where: {
                id: item.id,

                quantity: {
                  gte: dto.quantity,
                },
              },

              data: {
                quantity: {
                  decrement:
                    dto.quantity,
                },
              },
            });

          if (result.count === 0) {
            throw new BadRequestException(
              'No hay existencia suficiente para realizar esta salida',
            );
          }

          updatedItem =
            await tx.inventoryItem.findUniqueOrThrow({
              where: {
                id: item.id,
              },
            });
        }

        const totalCost =
          dto.unitCost !== undefined
            ? dto.unitCost *
              dto.quantity
            : undefined;

        const movement =
          await tx.stockMovement.create({
            data: {
              direction:
                dto.direction,

              reason:
                dto.reason,

              quantity:
                dto.quantity,

              unitCost:
                dto.unitCost,

              totalCost,

              balanceAfter:
                updatedItem.quantity,

              sourceName:
                dto.sourceName?.trim(),

              reference:
                dto.reference?.trim(),

              notes:
                dto.notes?.trim(),

              companyId:
                dto.companyId,

              inventoryItemId:
                dto.inventoryItemId,

              supplierId:
                dto.supplierId,
            },

            include: {
              supplier: true,
              inventoryItem: true,
            },
          });

        return {
          movement,
          inventory: {
            id:
              updatedItem.id,

            name:
              updatedItem.name,

            quantity:
              updatedItem.quantity,

            unit:
              updatedItem.unit,

            minimumStock:
              updatedItem.minimumStock,

            lowStock:
              updatedItem.quantity <=
              updatedItem.minimumStock,

            averageCost:
              updatedItem.averageCost,
          },
        };
      },
    );
  }


    async countInventory(
    dto: CreateInventoryCountDto,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const item =
          await tx.inventoryItem.findUnique({
            where: {
              id: dto.inventoryItemId,
            },
          });

        if (!item) {
          throw new NotFoundException(
            'El artículo de inventario no existe',
          );
        }

        if (
          item.companyId !== dto.companyId
        ) {
          throw new BadRequestException(
            'El artículo no pertenece a esta empresa',
          );
        }

        const expectedQuantity =
          item.quantity;

        const variance =
          dto.countedQuantity -
          expectedQuantity;

        const updatedItem =
          await tx.inventoryItem.update({
            where: {
              id: item.id,
            },

            data: {
              quantity:
                dto.countedQuantity,

              lastCountedAt:
                new Date(),
            },
          });

        const count =
          await tx.inventoryCount.create({
            data: {
              expectedQuantity,

              countedQuantity:
                dto.countedQuantity,

              variance,

              reason:
                dto.reason,

              notes:
                dto.notes?.trim(),

              companyId:
                dto.companyId,

              inventoryItemId:
                item.id,
            },
          });

        if (variance !== 0) {
          await tx.stockMovement.create({
            data: {
              direction:
                variance > 0
                  ? 'in'
                  : 'out',

              reason:
                variance > 0
                  ? 'adjustment_in'
                  : 'adjustment_out',

              quantity:
                Math.abs(variance),

              balanceAfter:
                dto.countedQuantity,

              notes:
                dto.reason
                  ? `Conteo físico: ${dto.reason}`
                  : 'Ajuste por conteo físico',

              companyId:
                dto.companyId,

              inventoryItemId:
                item.id,
            },
          });
        }

        return {
          item: {
            id:
              updatedItem.id,

            name:
              updatedItem.name,

            unit:
              updatedItem.unit,

            trackingMode:
              updatedItem.trackingMode,
          },

          count: {
            expectedQuantity,
            countedQuantity:
              dto.countedQuantity,
            variance,
            reason:
              dto.reason ?? null,
          },
        };
      },
    );
  }

  async createReceipt(
  dto: CreateStockReceiptDto,
) {
  if (
    dto.sourceType === 'supplier' &&
    !dto.supplierId
  ) {
    throw new BadRequestException(
      'La recepción de proveedor necesita supplierId',
    );
  }

  if (
    dto.sourceType === 'manual_purchase' &&
    !dto.sourceName?.trim()
  ) {
    throw new BadRequestException(
      'La compra manual necesita indicar dónde se realizó',
    );
  }

  return this.prisma.$transaction(
    async (tx) => {
      const company =
        await tx.company.findUnique({
          where: {
            id: dto.companyId,
          },
        });

      if (!company) {
        throw new NotFoundException(
          'La empresa no existe',
        );
      }

      if (dto.supplierId) {
        const supplier =
          await tx.supplier.findUnique({
            where: {
              id: dto.supplierId,
            },
          });

        if (!supplier) {
          throw new NotFoundException(
            'El proveedor no existe',
          );
        }

        if (
          supplier.companyId !==
          dto.companyId
        ) {
          throw new BadRequestException(
            'El proveedor no pertenece a esta empresa',
          );
        }
      }

      if (dto.lines.length === 0) {
        throw new BadRequestException(
          'La recepción necesita al menos un producto',
        );
      }

      const preparedLines: Array<{
        inventoryItemId: string;
        quantity: number;
        receivedUnit: string;
        conversionToBase: number;
        stockQuantity: number;
        unitCost?: number;
        baseUnitCost?: number;
        totalCost?: number;
      }> = [];

      let receiptTotal = 0;

      for (const line of dto.lines) {
        const item =
          await tx.inventoryItem.findUnique({
            where: {
              id: line.inventoryItemId,
            },
          });

        if (!item) {
          throw new NotFoundException(
            'Uno de los artículos no existe',
          );
        }

        if (
          item.companyId !==
          dto.companyId
        ) {
          throw new BadRequestException(
            `El artículo ${item.name} no pertenece a esta empresa`,
          );
        }

        const conversion =
          line.conversionToBase ??
          item.purchaseConversion ??
          1;

        const stockQuantity =
          line.quantity * conversion;

        const receivedUnit =
          item.purchaseUnit ??
          item.unit;

        const totalCost =
          line.unitCost !== undefined
            ? line.unitCost *
              line.quantity
            : undefined;

        const baseUnitCost =
          line.unitCost !== undefined
            ? line.unitCost /
              conversion
            : undefined;

        if (totalCost !== undefined) {
          receiptTotal += totalCost;
        }

        preparedLines.push({
          inventoryItemId:
            item.id,

          quantity:
            line.quantity,

          receivedUnit,

          conversionToBase:
            conversion,

          stockQuantity,

          unitCost:
            line.unitCost,

          baseUnitCost,

          totalCost,
        });
      }

      const receipt =
        await tx.stockReceipt.create({
          data: {
            sourceType:
              dto.sourceType,

            sourceName:
              dto.sourceName?.trim(),

            reference:
              dto.reference?.trim(),

            notes:
              dto.notes?.trim(),

            totalCost:
              receiptTotal,

            companyId:
              dto.companyId,

            supplierId:
              dto.supplierId,
          },
        });

      for (const line of preparedLines) {
        const item =
          await tx.inventoryItem.findUniqueOrThrow({
            where: {
              id: line.inventoryItemId,
            },
          });

        let newAverageCost =
          item.averageCost;

        if (
          line.baseUnitCost !== undefined
        ) {
          const currentValue =
            item.quantity *
            item.averageCost;

          const incomingValue =
            line.stockQuantity *
            line.baseUnitCost;

          const newQuantity =
            item.quantity +
            line.stockQuantity;

          newAverageCost =
            newQuantity > 0
              ? (
                  currentValue +
                  incomingValue
                ) / newQuantity
              : line.baseUnitCost;
        }

        const updatedItem =
          await tx.inventoryItem.update({
            where: {
              id: item.id,
            },

            data: {
              quantity: {
                increment:
                  line.stockQuantity,
              },

              averageCost:
                newAverageCost,
            },
          });

        await tx.stockReceiptLine.create({
          data: {
            quantity:
              line.quantity,

            receivedUnit:
              line.receivedUnit,

            conversionToBase:
              line.conversionToBase,

            stockQuantity:
              line.stockQuantity,

            unitCost:
              line.unitCost,

            baseUnitCost:
              line.baseUnitCost,

            totalCost:
              line.totalCost,

            stockReceiptId:
              receipt.id,

            inventoryItemId:
              line.inventoryItemId,
          },
        });

        await tx.stockMovement.create({
          data: {
            direction: 'in',

            reason:
              dto.sourceType ===
              'supplier'
                ? 'supplier_delivery'
                : 'manual_purchase',

            quantity:
              line.stockQuantity,

            unitCost:
              line.baseUnitCost,

            totalCost:
              line.totalCost,

            balanceAfter:
              updatedItem.quantity,

            sourceName:
              dto.sourceName?.trim(),

            reference:
              dto.reference?.trim(),

            notes:
              `Recepción ${receipt.id}`,

            companyId:
              dto.companyId,

            inventoryItemId:
              line.inventoryItemId,

            supplierId:
              dto.supplierId,
          },
        });
      }

      return tx.stockReceipt.findUnique({
        where: {
          id: receipt.id,
        },

        include: {
          supplier: true,

          lines: {
            include: {
              inventoryItem: true,
            },
          },
        },
      });
    },
  );
}

async findReceiptsByCompany(
  companyId: string,
) {
  return this.prisma.stockReceipt.findMany({
    where: {
      companyId,
    },

    include: {
      supplier: true,

      lines: {
        include: {
          inventoryItem: true,
        },
      },
    },

    orderBy: {
      receivedAt: 'desc',
    },
  });
}
}