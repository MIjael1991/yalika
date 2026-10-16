import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import {
  allocateCents,
  fromCents,
  toCents,
} from '../order-discount/discount-calculator';

import { CreateEqualSplitDto } from './dto/create-equal-split.dto';
import { CreateCustomSplitDto } from './dto/create-custom-split.dto';
import { CreateItemSplitDto } from './dto/create-item-split.dto';

@Injectable()
export class OrderSplitService {
  constructor(private readonly prisma: PrismaService) {}

  /*
   * =====================================================
   * VALIDAR QUE UNA CUENTA PUEDA DIVIDIRSE
   * =====================================================
   */
  private async getSplittableOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: {
        id: orderId,
      },

      include: {
        items: true,
      },
    });

    if (!order) {
      throw new NotFoundException('El pedido no existe');
    }

    if (!['confirmed', 'held'].includes(order.status)) {
      throw new BadRequestException(
        'El pedido debe estar confirmado antes de dividir la cuenta',
      );
    }

    if (order.paymentStatus !== 'pending') {
      throw new BadRequestException(
        'No se puede volver a dividir una cuenta que ya tiene pagos',
      );
    }

    return order;
  }

  /*
   * =====================================================
   * CONSULTAR DIVISIONES
   * =====================================================
   */
  async findByOrder(orderId: string) {
    return this.prisma.orderSplit.findMany({
      where: {
        orderId,
      },

      include: {
        items: {
          include: {
            orderItem: true,
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

      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  /*
   * =====================================================
   * DIVIDIR EN PARTES IGUALES
   * =====================================================
   */
  async createEqual(orderId: string, dto: CreateEqualSplitDto) {
    const order = await this.getSplittableOrder(orderId);

    const totalCents = Math.round(order.total * 100);

    if (totalCents < dto.parts) {
      throw new BadRequestException(
        'El total es demasiado pequeño para dividirlo en tantas partes',
      );
    }

    const baseCents = Math.floor(totalCents / dto.parts);

    const remainder = totalCents % dto.parts;

    const splitTotalsCents = Array.from(
      {
        length: dto.parts,
      },
      (_, index) => baseCents + (index < remainder ? 1 : 0),
    );

    const splitDiscountsCents = allocateCents(
      toCents(order.discount),
      splitTotalsCents,
    );

    return this.prisma.$transaction(async (tx) => {
      /*
       * Reemplazamos cualquier división
       * anterior porque todavía no hay pagos.
       */
      await tx.orderSplit.deleteMany({
        where: {
          orderId: order.id,
        },
      });

      await tx.order.update({
        where: {
          id: order.id,
        },
        data: {
          status: 'held',
        },
      });

      const created: Array<{
        id: string;
        label: string;
        mode: string;
        status: string;
        subtotal: number;
        discount: number;
        total: number;
      }> = [];

      for (let index = 0; index < dto.parts; index++) {
        const totalCentsForSplit = splitTotalsCents[index];

        const discountCentsForSplit = splitDiscountsCents[index];

        const total = fromCents(totalCentsForSplit);

        const discount = fromCents(discountCentsForSplit);

        const subtotal = fromCents(totalCentsForSplit + discountCentsForSplit);

        const split = await tx.orderSplit.create({
          data: {
            label: `Cuenta ${index + 1}`,

            mode: 'equal',

            status: 'open',

            subtotal: subtotal,

            discount: discount,

            total: total,

            orderId: order.id,

            companyId: order.companyId,
          },
        });

        created.push(split);
      }

      return {
        orderId: order.id,

        orderTotal: order.total,

        mode: 'equal',

        parts: created.length,

        splits: created,
      };
    });
  }

  /*
   * =====================================================
   * DIVISIÓN PERSONALIZADA POR MONTO
   * =====================================================
   */
  async createCustom(orderId: string, dto: CreateCustomSplitDto) {
    const order = await this.getSplittableOrder(orderId);

    const orderCents = Math.round(order.total * 100);

    const requestedTotalsCents = dto.splits.map((split) =>
      toCents(split.amount),
    );

    const splitCents = requestedTotalsCents.reduce(
      (accumulator, value) => accumulator + value,
      0,
    );

    if (splitCents !== orderCents) {
      throw new BadRequestException(
        `Las partes deben sumar exactamente $${order.total.toFixed(2)}`,
      );
    }

    const requestedDiscountsCents = allocateCents(
      toCents(order.discount),
      requestedTotalsCents,
    );

    return this.prisma.$transaction(async (tx) => {
      await tx.orderSplit.deleteMany({
        where: {
          orderId: order.id,
        },
      });

      await tx.order.update({
        where: {
          id: order.id,
        },
        data: {
          status: 'held',
        },
      });

      const created: Array<{
        id: string;
        label: string;
        mode: string;
        status: string;
        subtotal: number;
        discount: number;
        total: number;
      }> = [];

      for (let index = 0; index < dto.splits.length; index++) {
        const requestedSplit = dto.splits[index];

        const totalCentsForSplit = requestedTotalsCents[index];

        const discountCentsForSplit = requestedDiscountsCents[index];

        const total = fromCents(totalCentsForSplit);

        const discount = fromCents(discountCentsForSplit);

        const subtotal = fromCents(totalCentsForSplit + discountCentsForSplit);

        const split = await tx.orderSplit.create({
          data: {
            label: requestedSplit.label.trim(),

            mode: 'custom',

            status: 'open',

            subtotal: subtotal,

            discount: discount,

            total: total,

            orderId: order.id,

            companyId: order.companyId,
          },
        });

        created.push(split);
      }

      return {
        orderId: order.id,

        orderTotal: order.total,

        mode: 'custom',

        splits: created,
      };
    });
  }

  /*
   * =====================================================
   * DIVIDIR POR PRODUCTOS
   * =====================================================
   */
  async createByItems(orderId: string, dto: CreateItemSplitDto) {
    const order = await this.getSplittableOrder(orderId);

    /*
     * Cuánto se está asignando de
     * cada OrderItem.
     */
    const allocations = new Map<string, number>();

    for (const split of dto.splits) {
      const repeatedItems = new Set<string>();

      for (const allocation of split.items) {
        if (repeatedItems.has(allocation.orderItemId)) {
          throw new BadRequestException(
            'Un producto no puede repetirse dentro de la misma cuenta',
          );
        }

        repeatedItems.add(allocation.orderItemId);

        const orderItem = order.items.find(
          (item) => item.id === allocation.orderItemId,
        );

        if (!orderItem) {
          throw new BadRequestException(
            'Uno de los productos seleccionados no pertenece a este pedido',
          );
        }

        const previous = allocations.get(allocation.orderItemId) ?? 0;

        const newQuantity = previous + allocation.quantity;

        if (newQuantity > orderItem.quantity + 0.000001) {
          throw new BadRequestException(
            `Se está asignando una cantidad mayor a la comprada de ${orderItem.productName}`,
          );
        }

        allocations.set(allocation.orderItemId, newQuantity);
      }
    }

    /*
     * Todos los productos deben quedar
     * asignados a alguna cuenta.
     */
    for (const orderItem of order.items) {
      const assigned = allocations.get(orderItem.id) ?? 0;

      if (Math.abs(assigned - orderItem.quantity) > 0.000001) {
        throw new BadRequestException(
          `Falta asignar completamente ${orderItem.productName}`,
        );
      }
    }

    const pricedAllocations = new Map<
      string,
      {
        subtotalCents: number;
        totalCents: number;
      }
    >();

    for (const orderItem of order.items) {
      const itemAllocations: Array<{
        key: string;
        quantity: number;
      }> = [];

      for (let splitIndex = 0; splitIndex < dto.splits.length; splitIndex++) {
        const allocation = dto.splits[splitIndex].items.find(
          (item) => item.orderItemId === orderItem.id,
        );

        if (allocation) {
          itemAllocations.push({
            key: `${splitIndex}:${orderItem.id}`,

            quantity: allocation.quantity,
          });
        }
      }

      const subtotalAllocations = allocateCents(
        toCents(orderItem.lineTotal),
        itemAllocations.map((allocation) => allocation.quantity),
      );

      const totalAllocations = allocateCents(
        toCents(orderItem.total),
        itemAllocations.map((allocation) => allocation.quantity),
      );

      for (
        let allocationIndex = 0;
        allocationIndex < itemAllocations.length;
        allocationIndex++
      ) {
        pricedAllocations.set(itemAllocations[allocationIndex].key, {
          subtotalCents: subtotalAllocations[allocationIndex],

          totalCents: totalAllocations[allocationIndex],
        });
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.orderSplit.deleteMany({
        where: {
          orderId: order.id,
        },
      });

      await tx.order.update({
        where: {
          id: order.id,
        },
        data: {
          status: 'held',
        },
      });

      const result: Array<{
        id: string;
        label: string;
        total: number;
      }> = [];

      let calculatedGrandTotalCents = 0;

      let calculatedGrandSubtotalCents = 0;

      for (let splitIndex = 0; splitIndex < dto.splits.length; splitIndex++) {
        const requestedSplit = dto.splits[splitIndex];

        let splitSubtotalCents = 0;

        let splitTotalCents = 0;

        const preparedItems: Array<{
          orderItemId: string;
          quantity: number;
          amount: number;
        }> = [];

        for (const allocation of requestedSplit.items) {
          const orderItem = order.items.find(
            (item) => item.id === allocation.orderItemId,
          );

          if (!orderItem) {
            throw new BadRequestException('El producto del pedido no existe');
          }

          const pricedAllocation = pricedAllocations.get(
            `${splitIndex}:${orderItem.id}`,
          );

          if (!pricedAllocation) {
            throw new BadRequestException(
              'No fue posible calcular el importe del producto dividido',
            );
          }

          splitSubtotalCents += pricedAllocation.subtotalCents;

          splitTotalCents += pricedAllocation.totalCents;

          preparedItems.push({
            orderItemId: orderItem.id,

            quantity: allocation.quantity,

            amount: fromCents(pricedAllocation.totalCents),
          });
        }

        calculatedGrandSubtotalCents += splitSubtotalCents;

        calculatedGrandTotalCents += splitTotalCents;

        const splitSubtotal = fromCents(splitSubtotalCents);

        const splitTotal = fromCents(splitTotalCents);

        const splitDiscount = fromCents(splitSubtotalCents - splitTotalCents);

        const split = await tx.orderSplit.create({
          data: {
            label: requestedSplit.label.trim(),

            mode: 'items',

            status: 'open',

            subtotal: splitSubtotal,

            discount: splitDiscount,

            total: splitTotal,

            orderId: order.id,

            companyId: order.companyId,

            items: {
              create: preparedItems.map((item) => ({
                orderItemId: item.orderItemId,

                quantity: item.quantity,

                amount: item.amount,
              })),
            },
          },

          include: {
            items: {
              include: {
                orderItem: true,
              },
            },
          },
        });

        result.push({
          id: split.id,

          label: split.label,

          total: split.total,
        });
      }

      const orderTotalCents = toCents(order.total);

      const orderSubtotalCents = toCents(order.subtotal);

      if (
        calculatedGrandTotalCents !== orderTotalCents ||
        calculatedGrandSubtotalCents !== orderSubtotalCents ||
        calculatedGrandSubtotalCents - calculatedGrandTotalCents !==
          toCents(order.discount)
      ) {
        throw new BadRequestException(
          'La división por productos no coincide con los totales y descuentos del pedido',
        );
      }

      return {
        orderId: order.id,

        orderTotal: order.total,

        mode: 'items',

        splits: result,
      };
    });
  }
}
