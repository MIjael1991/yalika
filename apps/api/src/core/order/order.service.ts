import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { createTicketClaimToken } from '../engagement/ticket-claim';
import { CreateOrderDto } from './dto/create-order.dto';
import { buildSalesReport, parseReportRange } from './sales-report';

type LoyaltyResult = {
  confirmedVisits: number;
  requiredVisits: number;
  remainingVisits: number;
  rewardCreated: boolean;
  reward: unknown;
} | null;

@Injectable()
export class OrderService {
  constructor(private readonly prisma: PrismaService) {}

  /*
   * =====================================================
   * LISTAR PEDIDOS DE UNA EMPRESA
   * =====================================================
   */
  async findByCompany(companyId: string) {
    return this.prisma.order.findMany({
      where: {
        companyId,
      },

      include: {
        customer: true,

        discounts: {
          include: {
            orderItem: true,
            promotion: true,
            authorizedBy: true,
            voidedBy: true,
          },

          orderBy: {
            appliedAt: 'asc',
          },
        },

        items: {
          include: {
            product: true,
            variant: true,
          },
        },
      },

      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /*
   * =====================================================
   * REPORTE DE VENTAS POR FECHAS (solo administración)
   * =====================================================
   *
   * `from` inclusivo y `to` exclusivo. Las reglas de conteo están en
   * sales-report.ts.
   */
  async salesReport(
    companyId: string,
    fromRaw?: string,
    toRaw?: string,
    timeZoneRaw?: string,
  ) {
    const { from, to, timeZone } = parseReportRange(
      fromRaw,
      toRaw,
      timeZoneRaw,
    );
    const range = { gte: from, lt: to };

    const [orders, payments, refunds, returns, pendingOrders] =
      await Promise.all([
        this.prisma.order.findMany({
          where: {
            companyId,
            status: 'confirmed',
            paymentStatus: 'paid',
            OR: [
              { confirmedAt: range },
              { confirmedAt: null, createdAt: range },
            ],
          },
          select: {
            orderNumber: true,
            total: true,
            discount: true,
            confirmedAt: true,
            createdAt: true,
            customer: { select: { name: true } },
            payments: {
              where: { status: 'completed' },
              select: { method: true, amount: true, status: true },
            },
            items: {
              select: {
                productName: true,
                sku: true,
                quantity: true,
                total: true,
              },
            },
          },
        }),
        this.prisma.payment.findMany({
          where: { companyId, status: 'completed', paidAt: range },
          select: { method: true, amount: true, paidAt: true },
        }),
        this.prisma.refund.findMany({
          where: { companyId, status: 'completed', refundedAt: range },
          select: { method: true, amount: true, refundedAt: true },
        }),
        this.prisma.return.findMany({
          where: { companyId, status: 'completed', completedAt: range },
          select: {
            returnNumber: true,
            type: true,
            reason: true,
            totalAmount: true,
            completedAt: true,
            order: { select: { orderNumber: true } },
            refunds: {
              where: { status: 'completed' },
              select: { amount: true },
            },
          },
        }),
        this.prisma.order.findMany({
          where: {
            companyId,
            status: 'confirmed',
            paymentStatus: { not: 'paid' },
            createdAt: range,
          },
          select: { total: true },
        }),
      ]);

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      ...buildSalesReport({
        orders: orders.map((order) => ({
          ...order,
          customerName: order.customer?.name ?? null,
        })),
        payments,
        refunds,
        returns: returns.map((record) => ({
          returnNumber: record.returnNumber,
          type: record.type,
          reason: record.reason,
          totalAmount: record.totalAmount,
          completedAt: record.completedAt,
          orderNumber: record.order.orderNumber,
          refunded: record.refunds.reduce(
            (total, refund) => total + refund.amount,
            0,
          ),
        })),
        pendingOrders,
        timeZone,
      }),
    };
  }

  /*
   * =====================================================
   * CONSULTAR UN PEDIDO
   * =====================================================
   */
  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: {
        id,
      },

      include: {
        company: true,
        customer: true,
        loyaltyProgram: true,

        discounts: {
          include: {
            orderItem: true,
            promotion: true,
            authorizedBy: true,
            voidedBy: true,
          },

          orderBy: {
            appliedAt: 'asc',
          },
        },

        items: {
          include: {
            product: true,
            variant: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('El pedido no existe');
    }

    return order;
  }

  /*
   * =====================================================
   * CANCELAR UNA ORDEN SIN PAGOS
   * =====================================================
   *
   * draft:
   *   todavía no movió inventario.
   *
   * confirmed / held:
   *   libera el inventario que se reservó al confirmar.
   *
   * Una orden con pagos completados debe pasar por el
   * flujo de devolución y reembolso, nunca por aquí.
   * =====================================================
   */
  private async cancelUnpaidOrder(
    id: string,
    reason: string,
    finalStatus: 'cancelled' | 'expired',
  ) {
    const normalizedReason =
      reason.trim().slice(0, 500) ||
      (finalStatus === 'expired'
        ? 'Cobro expirado por inactividad'
        : 'Venta cancelada antes del pago');

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "orders"
          WHERE "id" = ${id}
          FOR UPDATE
        `;

      const order = await tx.order.findUnique({
        where: {
          id,
        },
        include: {
          items: true,
          payments: {
            where: {
              status: 'completed',
            },
          },
        },
      });

      if (!order) {
        throw new NotFoundException('El pedido no existe');
      }

      if (order.status === 'cancelled' || order.status === 'expired') {
        return order;
      }

      if (
        order.payments.length > 0 ||
        ['paid', 'partial'].includes(order.paymentStatus)
      ) {
        throw new BadRequestException(
          'Esta venta ya tiene pagos. Debe anularse mediante devolución y reembolso',
        );
      }

      if (
        !['draft', 'processing', 'confirmed', 'held'].includes(order.status)
      ) {
        throw new BadRequestException(
          'Esta venta ya no puede cancelarse desde caja',
        );
      }

      const inventoryWasCommitted =
        order.status === 'confirmed' || order.status === 'held';

      if (inventoryWasCommitted) {
        const recipeMovements = await tx.stockMovement.findMany({
          where: {
            companyId: order.companyId,
            reference: order.orderNumber,
            reason: 'recipe_consumption',
          },
        });

        const recipeProductIds = new Set(
          recipeMovements
            .map((movement) => movement.sourceName)
            .filter((value): value is string => Boolean(value)),
        );

        const hasLegacyRecipeMovements = recipeMovements.some(
          (movement) => !movement.sourceName,
        );

        const legacyRecipeProductIds = new Set<string>();

        if (hasLegacyRecipeMovements) {
          const recipes = await tx.productRecipe.findMany({
            where: {
              productId: {
                in: order.items.map((item) => item.productId),
              },
              status: 'active',
            },
            select: {
              productId: true,
            },
          });

          for (const recipe of recipes) {
            legacyRecipeProductIds.add(recipe.productId);
          }
        }

        for (const movement of recipeMovements) {
          const updatedInventory = await tx.inventoryItem.update({
            where: {
              id: movement.inventoryItemId,
            },
            data: {
              quantity: {
                increment: movement.quantity,
              },
            },
          });

          await tx.stockMovement.create({
            data: {
              direction: 'in',
              reason:
                finalStatus === 'expired' ? 'order_expired' : 'order_cancelled',
              quantity: movement.quantity,
              balanceAfter: updatedInventory.quantity,
              sourceName: movement.sourceName,
              reference: order.orderNumber,
              notes: `${normalizedReason}. Reversión de ${movement.id}`,
              companyId: order.companyId,
              inventoryItemId: movement.inventoryItemId,
            },
          });
        }

        for (const orderItem of order.items) {
          if (
            recipeProductIds.has(orderItem.productId) ||
            legacyRecipeProductIds.has(orderItem.productId)
          ) {
            continue;
          }

          const product = await tx.product.findUnique({
            where: {
              id: orderItem.productId,
            },
          });

          if (!product || !product.trackInventory) {
            continue;
          }

          if (!Number.isInteger(orderItem.quantity)) {
            throw new BadRequestException(
              `No fue posible liberar correctamente ${orderItem.productName}`,
            );
          }

          if (orderItem.variantId) {
            await tx.productVariant.update({
              where: {
                id: orderItem.variantId,
              },
              data: {
                stock: {
                  increment: orderItem.quantity,
                },
              },
            });
            continue;
          }

          await tx.product.update({
            where: {
              id: orderItem.productId,
            },
            data: {
              stock: {
                increment: orderItem.quantity,
              },
            },
          });
        }
      }

      // YALIKA_R9A_REACTIVATE_ON_UNPAID_CANCEL
      if (order.reservationId) {
        const reservation =
          await tx.commerceReservation.findFirst({
            where: {
              id: order.reservationId,
              companyId: order.companyId,
              status: 'converted',
              orderId: order.id,
            },
          });

        if (reservation) {
          const nextReservationStatus =
            reservation.pickupDeadline &&
            reservation.pickupDeadline <= new Date()
              ? 'review_expired'
              : 'active';

          await tx.commerceReservation.update({
            where: { id: reservation.id },
            data: {
              status: nextReservationStatus,
              orderId: null,
              completedAt: null,
            },
          });

          await tx.commerceReservationEvent.create({
            data: {
              reservationId: reservation.id,
              type: 'sale_cancelled_reservation_reactivated',
              note: `El pedido ${order.orderNumber} se canceló antes del pago.`,
            },
          });
        }
      }

      await tx.orderSplit.updateMany({
        where: {
          orderId: order.id,
        },
        data: {
          status: 'cancelled',
        },
      });

      await tx.orderDiscount.updateMany({
        where: {
          orderId: order.id,
          status: 'applied',
        },
        data: {
          status: 'voided',
          voidedAt: new Date(),
          voidReason: normalizedReason,
        },
      });

      if (
        order.customerId &&
        order.loyaltyProgramId &&
        order.paymentStatus === 'paid'
      ) {
        await tx.visit.updateMany({
          where: {
            customerId: order.customerId,
            loyaltyProgramId: order.loyaltyProgramId,
            source: 'order',
            notes: `Pedido ${order.orderNumber}`,
            status: 'confirmed',
          },
          data: {
            status: 'cancelled',
          },
        });

        const program = await tx.loyaltyProgram.findUnique({
          where: {
            id: order.loyaltyProgramId,
          },
        });

        if (program) {
          const confirmedVisits = await tx.visit.count({
            where: {
              customerId: order.customerId,
              loyaltyProgramId: order.loyaltyProgramId,
              status: 'confirmed',
            },
          });

          if (confirmedVisits < program.requiredVisits) {
            await tx.customerReward.updateMany({
              where: {
                customerId: order.customerId,
                loyaltyProgramId: order.loyaltyProgramId,
                status: 'available',
              },
              data: {
                status: 'cancelled',
              },
            });
          }
        }
      }

      const auditNote = `[${new Date().toISOString()}] ${
        finalStatus === 'expired' ? 'Cobro expirado' : 'Venta cancelada'
      }: ${normalizedReason}`;

      return tx.order.update({
        where: {
          id: order.id,
        },
        data: {
          status: finalStatus,
          paymentStatus: 'cancelled',
          cancelledAt: new Date(),
          notes: order.notes ? `${order.notes}\n${auditNote}` : auditNote,
        },
        include: {
          items: true,
        },
      });
    });
  }

  async cancel(id: string, reason?: string) {
    return this.cancelUnpaidOrder(id, reason ?? '', 'cancelled');
  }

  async expireAbandoned(companyId: string) {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000);

    const candidates = await this.prisma.order.findMany({
      where: {
        companyId,
        source: 'counter',
        status: {
          in: ['draft', 'confirmed'],
        },
        paymentStatus: 'pending',
        updatedAt: {
          lt: cutoff,
        },
        splits: {
          none: {},
        },
      },
      select: {
        id: true,
      },
    });

    let expired = 0;

    for (const candidate of candidates) {
      try {
        await this.cancelUnpaidOrder(
          candidate.id,
          'El cobro permaneció sin pago durante más de 30 minutos',
          'expired',
        );
        expired += 1;
      } catch (error) {
        if (!(error instanceof BadRequestException)) {
          throw error;
        }
      }
    }

    return {
      expired,
    };
  }

  /*
   * =====================================================
   * CREAR PEDIDO
   * =====================================================
   *
   * Aquí todavía NO descontamos inventario.
   *
   * El pedido nace como:
   *
   * status = draft
   *
   * El inventario se descuenta hasta confirmar.
   * =====================================================
   */
  async create(dto: CreateOrderDto) {
    const company = await this.prisma.company.findUnique({
      where: {
        id: dto.companyId,
      },
    });

    if (!company) {
      throw new NotFoundException('La empresa no existe');
    }

    /*
     * CLIENTE OPCIONAL
     */
    // YALIKA_R9A_RESERVATION_LINK
    const linkedReservation =
      dto.reservationId
        ? await this.prisma.commerceReservation.findFirst({
            where: {
              id: dto.reservationId,
              companyId: dto.companyId,
              status: { in: ['active', 'review_expired'] },
            },
            include: { items: true },
          })
        : null;

    if (dto.reservationId && !linkedReservation) {
      throw new BadRequestException(
        'El apartado no existe, venció o no pertenece a esta empresa',
      );
    }

    if (dto.customerId) {
      const customer = await this.prisma.customer.findUnique({
        where: {
          id: dto.customerId,
        },
      });

      if (!customer) {
        throw new NotFoundException('El cliente no existe');
      }

      if (customer.companyId !== dto.companyId) {
        throw new BadRequestException('El cliente no pertenece a esta empresa');
      }
    }

    /*
     * FIDELIZACIÓN OPCIONAL
     */
    if (dto.loyaltyProgramId) {
      const program = await this.prisma.loyaltyProgram.findUnique({
        where: {
          id: dto.loyaltyProgramId,
        },
      });

      if (!program) {
        throw new NotFoundException('La campaña de fidelización no existe');
      }

      if (program.companyId !== dto.companyId) {
        throw new BadRequestException('La campaña no pertenece a esta empresa');
      }

      if (!dto.customerId) {
        throw new BadRequestException(
          'Para acumular fidelización se necesita un cliente',
        );
      }
    }

    /*
     * PREPARAMOS LOS PRODUCTOS.
     *
     * Guardamos nombre, SKU y precio dentro
     * del pedido para conservar el historial.
     */
    const preparedItems: Array<{
      productId: string;
      variantId?: string;
      productName: string;
      sku?: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
      discount: number;
      total: number;
    }> = [];

    let subtotal = 0;
    let resolvedCatalogId: string | undefined = dto.catalogId;

    if (dto.catalogId) {
      const catalog = await this.prisma.commerceCatalog.findFirst({ where: { id: dto.catalogId, companyId: dto.companyId, status: 'active' } });
      if (!catalog) throw new BadRequestException('Catálogo no autorizado');
    }

    for (const requestedItem of dto.items) {
      const product = await this.prisma.product.findUnique({
        where: {
          id: requestedItem.productId,
        },
      });

      if (!product) {
        throw new NotFoundException('Uno de los productos no existe');
      }

      if (product.companyId !== dto.companyId) {
        throw new BadRequestException(
          `${product.name} no pertenece a esta empresa`,
        );
      }

      if (!product.catalogId || (resolvedCatalogId && product.catalogId !== resolvedCatalogId)) {
        throw new BadRequestException('No es posible mezclar productos de distintos catálogos');
      }
      resolvedCatalogId = product.catalogId;

      if (product.status !== 'active') {
        throw new BadRequestException(`${product.name} no está disponible`);
      }

      let unitPrice = product.price;

      let sku = product.sku ?? undefined;

      /*
       * VARIANTE OPCIONAL.
       *
       * Ejemplo:
       *
       * Vestido
       *   └── Negro / M
       */
      if (requestedItem.variantId) {
        const variant = await this.prisma.productVariant.findUnique({
          where: {
            id: requestedItem.variantId,
          },
        });

        if (!variant) {
          throw new NotFoundException('La variante no existe');
        }

        if (variant.productId !== product.id) {
          throw new BadRequestException('La variante no pertenece al producto');
        }

        if (variant.status !== 'active') {
          throw new BadRequestException('La variante no está disponible');
        }

        if (variant.price !== null) {
          unitPrice = variant.price;
        }

        sku = variant.sku ?? product.sku ?? undefined;
      }

      const lineTotal =
        Math.round(unitPrice * requestedItem.quantity * 100) / 100;

      subtotal = Math.round((subtotal + lineTotal) * 100) / 100;

      preparedItems.push({
        productId: product.id,

        variantId: requestedItem.variantId,

        productName: product.name,

        sku,

        quantity: requestedItem.quantity,

        unitPrice,

        lineTotal,

        discount: 0,

        total: lineTotal,
      });
    }

    /*
     * NÚMERO DEL PEDIDO
     */
    if (linkedReservation) {
      if (linkedReservation.items.length !== preparedItems.length) {
        throw new BadRequestException(
          'La venta debe conservar todos los artículos del apartado',
        );
      }

      for (const prepared of preparedItems) {
        const reservedItem = linkedReservation.items.find(
          (item) =>
            item.productId === prepared.productId &&
            (item.variantId ?? undefined) === prepared.variantId,
        );

        if (!reservedItem || reservedItem.quantity !== prepared.quantity) {
          throw new BadRequestException(
            'La venta no coincide exactamente con el apartado',
          );
        }
      }
    }

    if (linkedReservation && linkedReservation.catalogId !== resolvedCatalogId) {
      throw new BadRequestException('El apartado pertenece a otro catálogo');
    }

    const now = new Date();

    const randomPart = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');

    const orderNumber = `ORD-${now.getFullYear()}${String(
      now.getMonth() + 1,
    ).padStart(2, '0')}${String(now.getDate()).padStart(
      2,
      '0',
    )}-${Date.now()}-${randomPart}`;

    /*
     * GUARDAMOS PEDIDO + PRODUCTOS
     */
    return this.prisma.order.create({
      data: {
        orderNumber,

        source: dto.source ?? 'manual',

        orderType: dto.orderType ?? 'counter',

        status: 'draft',

        paymentStatus: 'pending',

        subtotal,

        discount: 0,

        total: subtotal,

        notes: dto.notes?.trim(),

        companyId: dto.companyId,
        catalogId: resolvedCatalogId,

        customerId: dto.customerId,

        loyaltyProgramId: dto.loyaltyProgramId,

        reservationId: dto.reservationId,

        items: {
          create: preparedItems.map((item) => ({
            productId: item.productId,

            variantId: item.variantId,

            productName: item.productName,

            sku: item.sku,

            quantity: item.quantity,

            unitPrice: item.unitPrice,

            lineTotal: item.lineTotal,

            discount: item.discount,

            total: item.total,
          })),
        },
      },

      include: {
        customer: true,
        items: true,
      },
    });
  }

  /*
   * =====================================================
   * CONFIRMAR PEDIDO
   * =====================================================
   *
   * Aquí sí hacemos:
   *
   * 1. proteger contra doble confirmación
   * 2. descontar receta si existe
   * 3. si no hay receta, descontar stock directo
   * 4. registrar movimientos
   * 5. registrar fidelización
   * 6. confirmar pedido
   *
   * Todo dentro de una transacción.
   * =====================================================
   */
  async confirm(id: string) {
    const order = await this.prisma.order.findUnique({
      where: {
        id,
      },

      include: {
        items: true,
      },
    });

    if (!order) {
      throw new NotFoundException('El pedido no existe');
    }

    if (order.status !== 'draft') {
      throw new BadRequestException(
        'Solo un pedido en borrador puede confirmarse',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      /*
       * -------------------------------------------------
       * BLOQUEAMOS DOBLE CONFIRMACIÓN
       * -------------------------------------------------
       *
       * Si dos peticiones intentan confirmar
       * la misma venta, solo una podrá cambiar:
       *
       * draft -> processing
       */
      const lockResult = await tx.order.updateMany({
        where: {
          id: order.id,

          status: 'draft',
        },

        data: {
          status: 'processing',
        },
      });

      if (lockResult.count === 0) {
        throw new BadRequestException(
          'Este pedido ya está siendo procesado o ya fue confirmado',
        );
      }

      const pricedOrder = await tx.order.findUniqueOrThrow({
        where: {
          id: order.id,
        },

        include: {
          items: true,
        },
      });

      const subtotalCents = pricedOrder.items.reduce(
        (total, item) => total + Math.round(item.lineTotal * 100),
        0,
      );

      const discountCents = pricedOrder.items.reduce(
        (total, item) => total + Math.round(item.discount * 100),
        0,
      );

      const totalCents = pricedOrder.items.reduce(
        (total, item) => total + Math.round(item.total * 100),
        0,
      );

      if (
        subtotalCents !== Math.round(pricedOrder.subtotal * 100) ||
        discountCents !== Math.round(pricedOrder.discount * 100) ||
        totalCents !== Math.round(pricedOrder.total * 100) ||
        subtotalCents - discountCents !== totalCents
      ) {
        throw new BadRequestException(
          'Los totales del pedido no coinciden con sus descuentos',
        );
      }

      const inventoryEffects: Array<{
        product: string;
        type: string;
        detail: string;
      }> = [];

      // YALIKA_R9A_RESERVATION_STOCK_GUARD
      // Un hold vencido se libera. Un anticipo reportado que venció pasa
      // a revisión manual para no vender una pieza que quizá ya fue pagada.
      const nowForReservations = new Date();

      await tx.commerceReservation.updateMany({
        where: {
          companyId: order.companyId,
          status: 'hold',
          holdExpiresAt: { lte: nowForReservations },
        },
        data: {
          status: 'expired',
          releasedAt: nowForReservations,
        },
      });

      await tx.commerceReservation.updateMany({
        where: {
          companyId: order.companyId,
          status: 'deposit_reported',
          holdExpiresAt: { lte: nowForReservations },
        },
        data: {
          status: 'review_expired',
        },
      });

      await tx.commerceReservation.updateMany({
        where: {
          companyId: order.companyId,
          status: 'active',
          pickupDeadline: { lte: nowForReservations },
        },
        data: {
          status: 'review_expired',
        },
      });

      const blockingReservationIds = (
        await tx.commerceReservation.findMany({
          where: {
            companyId: order.companyId,
            status: {
              in: ['hold', 'deposit_reported', 'active', 'review_expired'],
            },
            ...(order.reservationId
              ? { id: { not: order.reservationId } }
              : {}),
          },
          select: { id: true },
        })
      ).map((reservation) => reservation.id);

      /*
       * =================================================
       * INVENTARIO
       * =================================================
       */
      for (const orderItem of order.items) {
        const product = await tx.product.findUniqueOrThrow({
          where: {
            id: orderItem.productId,
          },
        });

        /*
         * Buscamos receta.
         *
         * Tener receta es OPCIONAL.
         */
        const recipe = await tx.productRecipe.findUnique({
          where: {
            productId: product.id,
          },

          include: {
            components: {
              include: {
                inventoryItem: true,
              },
            },
          },
        });

        /*
         * =================================================
         * CASO 1
         * RECETA ACTIVA
         * =================================================
         */
        if (recipe && recipe.status === 'active') {
          if (recipe.yieldQuantity <= 0) {
            throw new BadRequestException(
              `La receta de ${product.name} tiene un rendimiento inválido`,
            );
          }

          for (const component of recipe.components) {
            const requiredQuantity =
              (component.quantity / recipe.yieldQuantity) * orderItem.quantity;

            /*
             * Solo descontamos si hay
             * suficiente existencia.
             */
            const result = await tx.inventoryItem.updateMany({
              where: {
                id: component.inventoryItemId,

                companyId: order.companyId,

                quantity: {
                  gte: requiredQuantity,
                },
              },

              data: {
                quantity: {
                  decrement: requiredQuantity,
                },
              },
            });

            if (result.count === 0) {
              throw new BadRequestException(
                `No hay suficiente existencia de ${component.inventoryItem.name}`,
              );
            }

            const updatedInventory = await tx.inventoryItem.findUniqueOrThrow({
              where: {
                id: component.inventoryItemId,
              },
            });

            /*
             * Historial del consumo.
             */
            await tx.stockMovement.create({
              data: {
                direction: 'out',

                reason: 'recipe_consumption',

                quantity: requiredQuantity,

                balanceAfter: updatedInventory.quantity,

                reference: order.orderNumber,

                sourceName: product.id,

                notes: `Pedido ${order.orderNumber}: ${orderItem.quantity} x ${product.name}`,

                companyId: order.companyId,

                inventoryItemId: component.inventoryItemId,
              },
            });

            inventoryEffects.push({
              product: product.name,

              type: 'recipe',

              detail: `${component.inventoryItem.name}: -${requiredQuantity} ${component.inventoryItem.unit}`,
            });
          }

          /*
           * Como ya utilizamos receta,
           * NO descontamos el stock directo
           * del producto.
           */
          continue;
        }

        /*
         * =================================================
         * CASO 2
         * PRODUCTO SIN RECETA
         * =================================================
         *
         * Si trackInventory = false,
         * no hacemos nada.
         */
        if (!product.trackInventory) {
          continue;
        }

        /*
         * Product.stock y ProductVariant.stock
         * actualmente son enteros.
         */
        if (!Number.isInteger(orderItem.quantity)) {
          throw new BadRequestException(
            `${product.name} utiliza stock por pieza y necesita una cantidad entera`,
          );
        }

        /*
         * -------------------------------------------------
         * VARIANTE
         * -------------------------------------------------
         */
        if (orderItem.variantId) {
          const variant = await tx.productVariant.findUnique({
            where: {
              id: orderItem.variantId,
            },
          });

          if (!variant || variant.productId !== product.id) {
            throw new BadRequestException(
              `La variante de ${product.name} no es válida`,
            );
          }

          const reservedOther =
            blockingReservationIds.length > 0
              ? (
                  await tx.commerceReservationItem.aggregate({
                    where: {
                      reservationId: { in: blockingReservationIds },
                      productId: product.id,
                      variantId: variant.id,
                    },
                    _sum: { quantity: true },
                  })
                )._sum.quantity ?? 0
              : 0;

          const result = await tx.productVariant.updateMany({
            where: {
              id: variant.id,

              productId: product.id,

              stock: {
                gte: orderItem.quantity + reservedOther,
              },
            },

            data: {
              stock: {
                decrement: orderItem.quantity,
              },
            },
          });

          if (result.count === 0) {
            throw new BadRequestException(
              `No hay existencia suficiente de ${product.name} - ${variant.name}`,
            );
          }

          const updatedVariant = await tx.productVariant.findUniqueOrThrow({
            where: {
              id: variant.id,
            },
          });

          inventoryEffects.push({
            product: product.name,

            type: 'variant',

            detail: `${variant.name}: -${orderItem.quantity}. Quedan ${updatedVariant.stock}`,
          });

          continue;
        }

        /*
         * -------------------------------------------------
         * STOCK DIRECTO DEL PRODUCTO
         * -------------------------------------------------
         */
        const reservedOther =
          blockingReservationIds.length > 0
            ? (
                await tx.commerceReservationItem.aggregate({
                  where: {
                    reservationId: { in: blockingReservationIds },
                    productId: product.id,
                    variantId: null,
                  },
                  _sum: { quantity: true },
                })
              )._sum.quantity ?? 0
            : 0;

        const productStockResult = await tx.product.updateMany({
          where: {
            id: product.id,

            stock: {
              gte: orderItem.quantity + reservedOther,
            },
          },

          data: {
            stock: {
              decrement: orderItem.quantity,
            },
          },
        });

        if (productStockResult.count === 0) {
          throw new BadRequestException(
            `No hay existencia suficiente de ${product.name}`,
          );
        }

        const updatedProduct = await tx.product.findUniqueOrThrow({
          where: {
            id: product.id,
          },
        });

        inventoryEffects.push({
          product: product.name,

          type: 'product',

          detail: `Stock: -${orderItem.quantity}. Quedan ${updatedProduct.stock}`,
        });
      }

      /*
       * =================================================
       * FIDELIZACIÓN
       * =================================================
       *
       * Es completamente opcional.
       */
      // YALIKA_R9A_RESERVATION_CONVERSION
      if (order.reservationId) {
        const converted = await tx.commerceReservation.updateMany({
          where: {
            id: order.reservationId,
            companyId: order.companyId,
            status: { in: ['active', 'review_expired'] },
          },
          data: {
            status: 'converted',
            orderId: order.id,
          },
        });

        if (converted.count === 0) {
          throw new BadRequestException(
            'El apartado ya no está disponible para convertirlo en venta',
          );
        }

        await tx.commerceReservationEvent.create({
          data: {
            reservationId: order.reservationId,
            type: 'converted_to_sale',
            note: `Convertido al pedido ${order.orderNumber}`,
          },
        });
      }

      let loyalty: LoyaltyResult = null;

      if (
        order.paymentStatus === 'paid' &&
        order.customerId &&
        order.loyaltyProgramId
      ) {
        const program = await tx.loyaltyProgram.findUnique({
          where: {
            id: order.loyaltyProgramId,
          },
        });

        if (!program) {
          throw new NotFoundException(
            'La campaña de fidelización ya no existe',
          );
        }

        const now = new Date();

        /*
         * Solo cuenta si está activa
         * y dentro de fechas.
         */
        if (
          program.status === 'active' &&
          now >= program.startsAt &&
          now <= program.endsAt
        ) {
          /*
           * Una orden completa =
           * una visita.
           */
          await tx.visit.create({
            data: {
              customerId: order.customerId,

              companyId: order.companyId,

              loyaltyProgramId: program.id,

              source: 'order',

              status: 'confirmed',

              notes: `Pedido ${order.orderNumber}`,
            },
          });

          const confirmedVisits = await tx.visit.count({
            where: {
              customerId: order.customerId,

              loyaltyProgramId: program.id,

              status: 'confirmed',
            },
          });

          let reward = await tx.customerReward.findFirst({
            where: {
              customerId: order.customerId,

              loyaltyProgramId: program.id,
            },
          });

          let rewardCreated = false;

          /*
           * Creamos premio cuando alcanza
           * las visitas necesarias.
           */
          if (confirmedVisits >= program.requiredVisits && !reward) {
            const expiresAt = new Date();

            expiresAt.setUTCDate(
              expiresAt.getUTCDate() + program.rewardValidDays,
            );

            reward = await tx.customerReward.create({
              data: {
                rewardType: program.rewardType,

                rewardDescription: program.rewardDescription,

                status: 'available',

                expiresAt,

                customerId: order.customerId,

                companyId: order.companyId,

                loyaltyProgramId: program.id,
              },
            });

            rewardCreated = true;
          }

          loyalty = {
            confirmedVisits,

            requiredVisits: program.requiredVisits,

            remainingVisits: Math.max(
              program.requiredVisits - confirmedVisits,
              0,
            ),

            rewardCreated,

            reward,
          };
        }
      }

      /*
       * =================================================
       * CONFIRMAMOS EL PEDIDO
       * =================================================
       */
      const confirmedOrder = await tx.order.update({
        where: {
          id: order.id,
        },

        data: {
          status: 'confirmed',

          confirmedAt: new Date(),
        },

        include: {
          customer: true,

          items: true,
        },
      });

      return {
        order: confirmedOrder,

        inventoryEffects,

        loyalty,
      };
    });
  }
  async getTicket(id: string) {
    const order = await this.prisma.order.findUnique({
      where: {
        id,
      },

      include: {
        company: true,
        customer: true,

        items: {
          include: {
            variant: true,
          },
        },

        discounts: {
          include: {
            orderItem: true,
            promotion: true,
            authorizedBy: true,
            voidedBy: true,
          },

          orderBy: {
            appliedAt: 'asc',
          },
        },

        payments: {
          where: {
            status: 'completed',
          },

          orderBy: {
            paidAt: 'asc',
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('El pedido no existe');
    }

    const totalPaid = order.payments.reduce(
      (accumulator, payment) => accumulator + payment.amount,
      0,
    );

    const remaining = Math.max(
      Math.round((order.total - totalPaid) * 100) / 100,
      0,
    );

    const totalChange = order.payments.reduce(
      (accumulator, payment) => accumulator + payment.changeAmount,
      0,
    );

    let benefitClaim: {
      siteSlug: string;
      orderId: string;
      token: string;
    } | null = null;

    if (order.status === 'confirmed' && order.paymentStatus === 'paid') {
      const now = new Date();
      const [site, program, refunds] = await Promise.all([
        this.prisma.site.findFirst({
        where: { companyId: order.companyId, isPrimary: true },
        }),
        this.prisma.loyaltyProgram.findFirst({
          where: {
            companyId: order.companyId,
            status: 'active',
            startsAt: {
              lte: now,
            },
            endsAt: {
              gte: now,
            },
          },
        }),
        this.prisma.refund.aggregate({
          where: {
            status: 'completed',
            returnRecord: {
              orderId: order.id,
            },
          },
          _sum: {
            amount: true,
          },
        }),
      ]);

      if (
        site?.status === 'published' &&
        program &&
        (refunds._sum.amount ?? 0) < order.total - 0.001
      ) {
        benefitClaim = {
          siteSlug: site.slug,
          orderId: order.id,
          token: createTicketClaimToken(order.id, order.companyId),
        };
      }
    }

    return {
      ticket: {
        orderNumber: order.orderNumber,

        status: order.status,

        paymentStatus: order.paymentStatus,

        benefitClaim,

        date: order.confirmedAt ?? order.createdAt,

        business: {
          id: order.company.id,

          name: order.company.name,
        },

        customer: order.customer
          ? {
              id: order.customer.id,

              name: order.customer.name,

              phone: order.customer.phone,
            }
          : null,

        items: order.items.map((item) => ({
          name: item.productName,

          variant: item.variant?.name ?? null,

          sku: item.sku,

          quantity: item.quantity,

          unitPrice: item.unitPrice,

          subtotal: item.lineTotal,

          discount: item.discount,

          total: item.total,
        })),

        discounts: order.discounts.map((discount) => ({
          id: discount.id,

          scope: discount.scope,

          source: discount.source,

          type: discount.type,

          value: discount.value,

          amount: discount.amount,

          reason: discount.reason,

          status: discount.status,

          product: discount.orderItem?.productName ?? null,

          promotion: discount.promotion?.title ?? null,

          authorizedBy: discount.authorizedBy.name,

          voidedBy: discount.voidedBy?.name ?? null,
        })),

        totals: {
          subtotal: order.subtotal,

          discount: order.discount,

          total: order.total,

          paid: Math.round(totalPaid * 100) / 100,

          remaining,

          change: Math.round(totalChange * 100) / 100,
        },

        payments: order.payments.map((payment) => ({
          method: payment.method,

          amount: payment.amount,

          receivedAmount: payment.receivedAmount,

          change: payment.changeAmount,

          reference: payment.reference,

          paidAt: payment.paidAt,
        })),
      },
    };
  }
}
