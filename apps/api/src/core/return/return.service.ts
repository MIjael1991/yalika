import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateRefundDto } from './dto/create-refund.dto';
import { CreateReturnDto } from './dto/create-return.dto';

@Injectable()
export class ReturnService {
  constructor(private readonly prisma: PrismaService) {}

  private roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private createReturnNumber() {
    const now = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const randomPart = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');

    return `RET-${datePart}-${Date.now()}-${randomPart}`;
  }

  async findByCompany(companyId: string) {
    return this.prisma.return.findMany({
      where: { companyId },
      include: {
        order: true,
        exchangeOrder: true,
        authorizedBy: true,
        items: {
          include: {
            orderItem: true,
          },
        },
        refunds: true,
        creditPayment: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async findOne(id: string) {
    const returnRecord = await this.prisma.return.findUnique({
      where: { id },
      include: {
        company: true,
        order: true,
        exchangeOrder: true,
        authorizedBy: true,
        items: {
          include: {
            orderItem: {
              include: {
                product: true,
                variant: true,
              },
            },
          },
        },
        refunds: {
          include: {
            payment: true,
            processedBy: true,
          },
          orderBy: { refundedAt: 'asc' },
        },
        creditPayment: true,
      },
    });

    if (!returnRecord) {
      throw new NotFoundException('La devoluciÃ³n no existe');
    }

    return returnRecord;
  }

  async create(dto: CreateReturnDto) {
    if (dto.operationId) {
      const existing = await this.prisma.return.findFirst({
        where: {
          companyId: dto.companyId,
          operationId: dto.operationId,
        },
      });

      if (existing) {
        return this.findOne(existing.id);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({
        where: { id: dto.companyId },
      });

      if (!company) {
        throw new NotFoundException('La empresa no existe');
      }

      const authorizedBy = await tx.user.findUnique({
        where: { id: dto.authorizedById },
      });

      if (!authorizedBy) {
        throw new NotFoundException('El usuario autorizador no existe');
      }

      if (authorizedBy.companyId !== dto.companyId) {
        throw new BadRequestException(
          'El usuario autorizador no pertenece a esta empresa',
        );
      }

      if (authorizedBy.status !== 'active') {
        throw new BadRequestException('El usuario autorizador no estÃ¡ activo');
      }

      if (dto.operationId) {
        const existing = await tx.return.findFirst({
          where: {
            companyId: dto.companyId,
            operationId: dto.operationId,
          },
          include: {
            items: true,
            refunds: true,
            creditPayment: true,
          },
        });

        if (existing) {
          return existing;
        }
      }

      const order = await tx.order.findUnique({
        where: { id: dto.orderId },
        include: {
          items: {
            include: {
              product: {
                include: {
                  recipe: true,
                },
              },
              variant: true,
            },
          },
          returns: {
            where: { status: 'completed' },
            include: { items: true },
          },
        },
      });

      if (!order) {
        throw new NotFoundException('La venta original no existe');
      }

      if (order.companyId !== dto.companyId) {
        throw new BadRequestException(
          'La venta original no pertenece a esta empresa',
        );
      }

      if (order.status !== 'confirmed') {
        throw new BadRequestException(
          'Solo una venta confirmada puede tener devoluciÃ³n',
        );
      }

      if (order.paymentStatus !== 'paid') {
        throw new BadRequestException(
          'Por ahora solo se permiten devoluciones de ventas completamente pagadas',
        );
      }

      const activeReturn = await tx.return.findFirst({
        where: {
          orderId: order.id,
          status: {
            in: ['draft', 'processing'],
          },
        },
      });

      if (activeReturn) {
        throw new ConflictException(
          'Esta venta ya tiene una devoluciÃ³n pendiente de terminar',
        );
      }

      const returnType = dto.type ?? 'return';

      if (returnType === 'exchange' && !dto.exchangeOrderId) {
        throw new BadRequestException(
          'Un cambio necesita la nueva orden en exchangeOrderId',
        );
      }

      if (returnType === 'return' && dto.exchangeOrderId) {
        throw new BadRequestException(
          'exchangeOrderId solo puede utilizarse en un cambio',
        );
      }

      if (dto.exchangeOrderId) {
        if (dto.exchangeOrderId === order.id) {
          throw new BadRequestException(
            'La orden de cambio debe ser diferente de la venta original',
          );
        }

        const exchangeOrder = await tx.order.findUnique({
          where: { id: dto.exchangeOrderId },
          include: {
            payments: {
              where: { status: 'completed' },
            },
          },
        });

        if (!exchangeOrder) {
          throw new NotFoundException('La nueva orden del cambio no existe');
        }

        if (exchangeOrder.companyId !== dto.companyId) {
          throw new BadRequestException(
            'La nueva orden del cambio no pertenece a esta empresa',
          );
        }

        if (exchangeOrder.status !== 'confirmed') {
          throw new BadRequestException(
            'La nueva orden del cambio debe estar confirmada',
          );
        }

        const paidOnExchange = this.roundMoney(
          exchangeOrder.payments.reduce(
            (total, payment) => total + payment.amount,
            0,
          ),
        );

        if (paidOnExchange >= exchangeOrder.total - 0.001) {
          throw new BadRequestException(
            'La nueva orden del cambio ya estÃ¡ completamente pagada',
          );
        }
      }

      const previouslyReturned = new Map<string, number>();

      for (const previousReturn of order.returns) {
        for (const previousItem of previousReturn.items) {
          previouslyReturned.set(
            previousItem.orderItemId,
            (previouslyReturned.get(previousItem.orderItemId) ?? 0) +
              previousItem.quantity,
          );
        }
      }

      const repeatedItems = new Set<string>();
      const preparedItems: Array<{
        orderItemId: string;
        quantity: number;
        unitPrice: number;
        lineTotal: number;
        refundAmount: number;
        condition: string;
        disposition: string;
        restockedQuantity: number;
        reason?: string;
        notes?: string;
      }> = [];

      let totalAmount = 0;

      for (const requestedItem of dto.items) {
        if (repeatedItems.has(requestedItem.orderItemId)) {
          throw new BadRequestException(
            'Un producto no puede repetirse dentro de la misma devoluciÃ³n',
          );
        }

        repeatedItems.add(requestedItem.orderItemId);

        const orderItem = order.items.find(
          (item) => item.id === requestedItem.orderItemId,
        );

        if (!orderItem) {
          throw new BadRequestException(
            'Uno de los productos no pertenece a la venta original',
          );
        }

        const returnedBefore =
          previouslyReturned.get(orderItem.id) ?? 0;
        const availableQuantity = orderItem.quantity - returnedBefore;

        if (requestedItem.quantity > availableQuantity + 0.000001) {
          throw new BadRequestException(
            `No se pueden devolver ${requestedItem.quantity} unidades de ${orderItem.productName}. Quedan ${availableQuantity} disponibles para devoluciÃ³n`,
          );
        }

        const activeRecipe =
          orderItem.product.recipe?.status === 'active';

        if (requestedItem.disposition === 'restock') {
          if (requestedItem.condition !== 'sellable') {
            throw new BadRequestException(
              `${orderItem.productName} solo puede volver al stock si su condiciÃ³n es sellable`,
            );
          }

          if (activeRecipe) {
            throw new BadRequestException(
              `${orderItem.productName} utiliza receta y no puede reponer ingredientes automÃ¡ticamente`,
            );
          }

          if (!orderItem.product.trackInventory) {
            throw new BadRequestException(
              `${orderItem.productName} no controla inventario y no puede marcarse para reposiciÃ³n`,
            );
          }

          if (!Number.isInteger(requestedItem.quantity)) {
            throw new BadRequestException(
              `${orderItem.productName} utiliza stock por pieza y necesita una cantidad entera`,
            );
          }
        }

        const lineTotal = this.roundMoney(
          orderItem.unitPrice * requestedItem.quantity,
        );

        totalAmount = this.roundMoney(totalAmount + lineTotal);

        preparedItems.push({
          orderItemId: orderItem.id,
          quantity: requestedItem.quantity,
          unitPrice: orderItem.unitPrice,
          lineTotal,
          refundAmount: lineTotal,
          condition: requestedItem.condition,
          disposition: requestedItem.disposition,
          restockedQuantity: 0,
          reason: requestedItem.reason?.trim(),
          notes: requestedItem.notes?.trim(),
        });
      }

      return tx.return.create({
        data: {
          returnNumber: this.createReturnNumber(),
          type: returnType,
          status: 'draft',
          reason: dto.reason,
          notes: dto.notes?.trim(),
          totalAmount,
          operationId: dto.operationId,
          companyId: dto.companyId,
          orderId: order.id,
          exchangeOrderId: dto.exchangeOrderId,
          authorizedById: dto.authorizedById,
          items: {
            create: preparedItems,
          },
        },
        include: {
          order: true,
          exchangeOrder: true,
          authorizedBy: true,
          items: {
            include: {
              orderItem: true,
            },
          },
        },
      });
    });
  }

  async confirm(id: string) {
    const existing = await this.prisma.return.findUnique({
      where: { id },
      select: {
        id: true,
        orderId: true,
        status: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('La devoluciÃ³n no existe');
    }

    if (existing.status !== 'draft') {
      throw new BadRequestException(
        'Solo una devoluciÃ³n en borrador puede confirmarse',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "orders"
        WHERE "id" = ${existing.orderId}
        FOR UPDATE
      `;

      const lockResult = await tx.return.updateMany({
        where: {
          id: existing.id,
          status: 'draft',
        },
        data: {
          status: 'processing',
        },
      });

      if (lockResult.count === 0) {
        throw new BadRequestException(
          'Esta devoluciÃ³n ya estÃ¡ siendo procesada o ya fue confirmada',
        );
      }

      const returnRecord = await tx.return.findUniqueOrThrow({
        where: { id: existing.id },
        include: {
          order: true,
          exchangeOrder: {
            include: {
              payments: {
                where: { status: 'completed' },
              },
            },
          },
          items: {
            include: {
              orderItem: {
                include: {
                  product: {
                    include: {
                      recipe: true,
                    },
                  },
                  variant: true,
                },
              },
            },
          },
        },
      });

      if (returnRecord.order.status !== 'confirmed') {
        throw new BadRequestException(
          'La venta original ya no estÃ¡ confirmada',
        );
      }

      if (returnRecord.order.paymentStatus !== 'paid') {
        throw new BadRequestException(
          'La venta original ya no estÃ¡ completamente pagada',
        );
      }

      const orderItemIds = returnRecord.items.map(
        (item) => item.orderItemId,
      );

      const priorItems = await tx.returnItem.findMany({
        where: {
          orderItemId: {
            in: orderItemIds,
          },
          returnRecord: {
            is: {
              id: { not: returnRecord.id },
              status: 'completed',
            },
          },
        },
        select: {
          orderItemId: true,
          quantity: true,
        },
      });

      const previouslyReturned = new Map<string, number>();

      for (const priorItem of priorItems) {
        previouslyReturned.set(
          priorItem.orderItemId,
          (previouslyReturned.get(priorItem.orderItemId) ?? 0) +
            priorItem.quantity,
        );
      }

      const inventoryEffects: Array<{
        product: string;
        type: string;
        detail: string;
      }> = [];

      for (const returnItem of returnRecord.items) {
        const orderItem = returnItem.orderItem;
        const returnedBefore =
          previouslyReturned.get(orderItem.id) ?? 0;

        if (
          returnedBefore + returnItem.quantity >
          orderItem.quantity + 0.000001
        ) {
          throw new BadRequestException(
            `La devoluciÃ³n de ${orderItem.productName} supera la cantidad comprada`,
          );
        }

        if (returnItem.disposition !== 'restock') {
          inventoryEffects.push({
            product: orderItem.productName,
            type: returnItem.disposition,
            detail: 'No regresÃ³ al stock vendible',
          });
          continue;
        }

        if (returnItem.condition !== 'sellable') {
          throw new BadRequestException(
            `${orderItem.productName} ya no cumple la condiciÃ³n para volver al stock`,
          );
        }

        if (orderItem.product.recipe?.status === 'active') {
          throw new BadRequestException(
            `${orderItem.productName} utiliza receta y no puede reponer ingredientes automÃ¡ticamente`,
          );
        }

        if (!orderItem.product.trackInventory) {
          throw new BadRequestException(
            `${orderItem.productName} no controla inventario`,
          );
        }

        if (!Number.isInteger(returnItem.quantity)) {
          throw new BadRequestException(
            `${orderItem.productName} utiliza stock por pieza y necesita una cantidad entera`,
          );
        }

        if (orderItem.variantId) {
          const variantResult = await tx.productVariant.updateMany({
            where: {
              id: orderItem.variantId,
              productId: orderItem.productId,
            },
            data: {
              stock: {
                increment: returnItem.quantity,
              },
            },
          });

          if (variantResult.count === 0) {
            throw new BadRequestException(
              `La variante de ${orderItem.productName} ya no estÃ¡ disponible`,
            );
          }

          const updatedVariant = await tx.productVariant.findUniqueOrThrow({
            where: { id: orderItem.variantId },
          });

          inventoryEffects.push({
            product: orderItem.productName,
            type: 'variant',
            detail: `${orderItem.variant?.name ?? orderItem.sku ?? 'Variante'}: +${returnItem.quantity}. Quedan ${updatedVariant.stock}`,
          });
        } else {
          const productResult = await tx.product.updateMany({
            where: {
              id: orderItem.productId,
              companyId: returnRecord.companyId,
            },
            data: {
              stock: {
                increment: returnItem.quantity,
              },
            },
          });

          if (productResult.count === 0) {
            throw new BadRequestException(
              `${orderItem.productName} ya no estÃ¡ disponible`,
            );
          }

          const updatedProduct = await tx.product.findUniqueOrThrow({
            where: { id: orderItem.productId },
          });

          inventoryEffects.push({
            product: orderItem.productName,
            type: 'product',
            detail: `Stock: +${returnItem.quantity}. Quedan ${updatedProduct.stock}`,
          });
        }

        await tx.returnItem.update({
          where: { id: returnItem.id },
          data: {
            restockedQuantity: returnItem.quantity,
          },
        });
      }

      let exchangeSummary: {
        orderId: string;
        orderNumber: string;
        creditApplied: number;
        differenceToPay: number;
        refundableBalance: number;
      } | null = null;

      if (returnRecord.type === 'exchange') {
        const exchangeOrder = returnRecord.exchangeOrder;

        if (!exchangeOrder) {
          throw new BadRequestException(
            'La devoluciÃ³n de tipo cambio no tiene nueva orden relacionada',
          );
        }

        if (exchangeOrder.companyId !== returnRecord.companyId) {
          throw new BadRequestException(
            'La nueva orden del cambio no pertenece a esta empresa',
          );
        }

        if (exchangeOrder.status !== 'confirmed') {
          throw new BadRequestException(
            'La nueva orden del cambio debe estar confirmada',
          );
        }

        const alreadyPaid = this.roundMoney(
          exchangeOrder.payments.reduce(
            (total, payment) => total + payment.amount,
            0,
          ),
        );
        const remainingBeforeCredit = Math.max(
          this.roundMoney(exchangeOrder.total - alreadyPaid),
          0,
        );

        if (remainingBeforeCredit <= 0) {
          throw new BadRequestException(
            'La nueva orden del cambio ya estÃ¡ completamente pagada',
          );
        }

        const creditApplied = Math.min(
          returnRecord.totalAmount,
          remainingBeforeCredit,
        );

        if (creditApplied > 0) {
          await tx.payment.create({
            data: {
              method: 'return_credit',
              status: 'completed',
              amount: creditApplied,
              changeAmount: 0,
              reference: returnRecord.returnNumber,
              notes: `CrÃ©dito aplicado por cambio ${returnRecord.returnNumber}`,
              orderId: exchangeOrder.id,
              companyId: returnRecord.companyId,
              sourceReturnId: returnRecord.id,
            },
          });
        }

        const totalPaid = this.roundMoney(alreadyPaid + creditApplied);
        const differenceToPay = Math.max(
          this.roundMoney(exchangeOrder.total - totalPaid),
          0,
        );
        const paymentStatus = differenceToPay <= 0 ? 'paid' : 'partial';

        await tx.order.update({
          where: { id: exchangeOrder.id },
          data: { paymentStatus },
        });

        exchangeSummary = {
          orderId: exchangeOrder.id,
          orderNumber: exchangeOrder.orderNumber,
          creditApplied,
          differenceToPay,
          refundableBalance: Math.max(
            this.roundMoney(returnRecord.totalAmount - creditApplied),
            0,
          ),
        };
      }

      const completedReturn = await tx.return.update({
        where: { id: returnRecord.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
        },
        include: {
          order: true,
          exchangeOrder: true,
          authorizedBy: true,
          items: {
            include: {
              orderItem: true,
            },
          },
          refunds: true,
          creditPayment: true,
        },
      });

      return {
        return: completedReturn,
        inventoryEffects,
        exchange: exchangeSummary,
      };
    });
  }

  async cancel(id: string) {
    const cancelResult = await this.prisma.return.updateMany({
      where: {
        id,
        status: 'draft',
      },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
      },
    });

    if (cancelResult.count === 0) {
      const existing = await this.prisma.return.findUnique({
        where: { id },
        select: { status: true },
      });

      if (!existing) {
        throw new NotFoundException('La devolución no existe');
      }

      throw new BadRequestException(
        'Solo una devolución en borrador puede cancelarse',
      );
    }

    return this.findOne(id);
  }

  async createRefund(returnId: string, dto: CreateRefundDto) {
    const existingReturn = await this.prisma.return.findUnique({
      where: { id: returnId },
      select: {
        id: true,
        companyId: true,
      },
    });

    if (!existingReturn) {
      throw new NotFoundException('La devoluciÃ³n no existe');
    }

    if (dto.operationId) {
      const existingRefund = await this.prisma.refund.findFirst({
        where: {
          companyId: existingReturn.companyId,
          operationId: dto.operationId,
        },
      });

      if (existingRefund) {
        return existingRefund;
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "returns"
        WHERE "id" = ${returnId}
        FOR UPDATE
      `;

      const returnRecord = await tx.return.findUnique({
        where: { id: returnId },
        include: {
          order: {
            include: {
              payments: {
                where: { status: 'completed' },
              },
            },
          },
          refunds: {
            where: { status: 'completed' },
          },
          creditPayment: true,
        },
      });

      if (!returnRecord) {
        throw new NotFoundException('La devoluciÃ³n no existe');
      }

      if (returnRecord.status !== 'completed') {
        throw new BadRequestException(
          'La devoluciÃ³n debe estar confirmada antes de registrar el reembolso',
        );
      }

      const processedBy = await tx.user.findUnique({
        where: { id: dto.processedById },
      });

      if (!processedBy) {
        throw new NotFoundException('El usuario que procesa no existe');
      }

      if (processedBy.companyId !== returnRecord.companyId) {
        throw new BadRequestException(
          'El usuario que procesa no pertenece a esta empresa',
        );
      }

      if (processedBy.status !== 'active') {
        throw new BadRequestException(
          'El usuario que procesa el reembolso no estÃ¡ activo',
        );
      }

      if (dto.operationId) {
        const existingRefund = await tx.refund.findFirst({
          where: {
            companyId: returnRecord.companyId,
            operationId: dto.operationId,
          },
        });

        if (existingRefund) {
          return existingRefund;
        }
      }

      const refundedBefore = this.roundMoney(
        returnRecord.refunds.reduce(
          (total, refund) => total + refund.amount,
          0,
        ),
      );
      const creditApplied = returnRecord.creditPayment?.amount ?? 0;
      const availableToRefund = Math.max(
        this.roundMoney(
          returnRecord.totalAmount - creditApplied - refundedBefore,
        ),
        0,
      );

      if (availableToRefund <= 0) {
        throw new BadRequestException(
          'Esta devoluciÃ³n ya no tiene saldo disponible para reembolso',
        );
      }

      const amount = this.roundMoney(dto.amount ?? availableToRefund);

      if (amount <= 0) {
        throw new BadRequestException(
          'El monto del reembolso debe ser mayor a cero',
        );
      }

      if (amount > availableToRefund + 0.001) {
        throw new BadRequestException(
          `El reembolso no puede superar el saldo disponible de $${availableToRefund}`,
        );
      }

      if (dto.method === 'card' && !dto.paymentId) {
        throw new BadRequestException(
          'Un reembolso a tarjeta necesita el paymentId del pago original',
        );
      }

      if (dto.paymentId) {
        const payment = await tx.payment.findUnique({
          where: { id: dto.paymentId },
        });

        if (!payment) {
          throw new NotFoundException('El pago original no existe');
        }

        if (
          payment.orderId !== returnRecord.orderId ||
          payment.companyId !== returnRecord.companyId
        ) {
          throw new BadRequestException(
            'El pago seleccionado no pertenece a la venta original',
          );
        }

        if (payment.status !== 'completed') {
          throw new BadRequestException(
            'Solo puede reembolsarse un pago completado',
          );
        }

        if (dto.method === 'card' && payment.method !== 'card') {
          throw new BadRequestException(
            'El pago seleccionado no corresponde a una tarjeta',
          );
        }

        const refundsForPayment = await tx.refund.aggregate({
          where: {
            paymentId: payment.id,
            status: 'completed',
          },
          _sum: {
            amount: true,
          },
        });

        const paymentAvailable = Math.max(
          this.roundMoney(
            payment.amount - (refundsForPayment._sum.amount ?? 0),
          ),
          0,
        );

        if (amount > paymentAvailable + 0.001) {
          throw new BadRequestException(
            `Este pago solo tiene $${paymentAvailable} disponibles para reembolso`,
          );
        }
      }

      const refund = await tx.refund.create({
        data: {
          method: dto.method,
          status: 'completed',
          amount,
          reference: dto.reference?.trim(),
          notes: dto.notes?.trim(),
          operationId: dto.operationId,
          companyId: returnRecord.companyId,
          returnId: returnRecord.id,
          paymentId: dto.paymentId,
          processedById: dto.processedById,
        },
        include: {
          payment: true,
          processedBy: true,
        },
      });

      return {
        refund,
        summary: {
          returnAmount: returnRecord.totalAmount,
          exchangeCreditApplied: creditApplied,
          previouslyRefunded: refundedBefore,
          refundedNow: amount,
          remainingToRefund: Math.max(
            this.roundMoney(availableToRefund - amount),
            0,
          ),
        },
      };
    });
  }
}