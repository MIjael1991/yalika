import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

import { CreateEqualSplitDto } from './dto/create-equal-split.dto';
import { CreateCustomSplitDto } from './dto/create-custom-split.dto';
import { CreateItemSplitDto } from './dto/create-item-split.dto';

@Injectable()
export class OrderSplitService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /*
   * =====================================================
   * VALIDAR QUE UNA CUENTA PUEDA DIVIDIRSE
   * =====================================================
   */
  private async getSplittableOrder(
    orderId: string,
  ) {
    const order =
      await this.prisma.order.findUnique({
        where: {
          id: orderId,
        },

        include: {
          items: true,
        },
      });

    if (!order) {
      throw new NotFoundException(
        'El pedido no existe',
      );
    }

    if (
      order.status !== 'confirmed'
    ) {
      throw new BadRequestException(
        'El pedido debe estar confirmado antes de dividir la cuenta',
      );
    }

    if (
      order.paymentStatus !==
      'pending'
    ) {
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
  async findByOrder(
    orderId: string,
  ) {
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
  async createEqual(
    orderId: string,
    dto: CreateEqualSplitDto,
  ) {
    const order =
      await this.getSplittableOrder(
        orderId,
      );

    const totalCents =
      Math.round(
        order.total * 100,
      );

    if (
      totalCents <
      dto.parts
    ) {
      throw new BadRequestException(
        'El total es demasiado pequeño para dividirlo en tantas partes',
      );
    }

    const baseCents =
      Math.floor(
        totalCents /
          dto.parts,
      );

    const remainder =
      totalCents %
      dto.parts;

    return this.prisma.$transaction(
      async (tx) => {
        /*
         * Reemplazamos cualquier división
         * anterior porque todavía no hay pagos.
         */
        await tx.orderSplit.deleteMany({
          where: {
            orderId:
              order.id,
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

        for (
          let index = 0;
          index < dto.parts;
          index++
        ) {
          const cents =
            baseCents +
            (
              index <
              remainder
                ? 1
                : 0
            );

          const amount =
            cents / 100;

          const split =
            await tx.orderSplit.create({
              data: {
                label:
                  `Cuenta ${index + 1}`,

                mode:
                  'equal',

                status:
                  'open',

                subtotal:
                  amount,

                discount:
                  0,

                total:
                  amount,

                orderId:
                  order.id,

                companyId:
                  order.companyId,
              },
            });

          created.push(
            split,
          );
        }

        return {
          orderId:
            order.id,

          orderTotal:
            order.total,

          mode:
            'equal',

          parts:
            created.length,

          splits:
            created,
        };
      },
    );
  }

  /*
   * =====================================================
   * DIVISIÓN PERSONALIZADA POR MONTO
   * =====================================================
   */
  async createCustom(
    orderId: string,
    dto: CreateCustomSplitDto,
  ) {
    const order =
      await this.getSplittableOrder(
        orderId,
      );

    const orderCents =
      Math.round(
        order.total * 100,
      );

    const splitCents =
      dto.splits.reduce(
        (
          accumulator,
          split,
        ) =>
          accumulator +
          Math.round(
            split.amount *
              100,
          ),
        0,
      );

    if (
      splitCents !==
      orderCents
    ) {
      throw new BadRequestException(
        `Las partes deben sumar exactamente $${order.total.toFixed(2)}`,
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        await tx.orderSplit.deleteMany({
          where: {
            orderId:
              order.id,
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

        for (
          const requestedSplit
          of dto.splits
        ) {
          const amount =
            Math.round(
              requestedSplit.amount *
                100,
            ) / 100;

          const split =
            await tx.orderSplit.create({
              data: {
                label:
                  requestedSplit.label.trim(),

                mode:
                  'custom',

                status:
                  'open',

                subtotal:
                  amount,

                discount:
                  0,

                total:
                  amount,

                orderId:
                  order.id,

                companyId:
                  order.companyId,
              },
            });

          created.push(
            split,
          );
        }

        return {
          orderId:
            order.id,

          orderTotal:
            order.total,

          mode:
            'custom',

          splits:
            created,
        };
      },
    );
  }

  /*
   * =====================================================
   * DIVIDIR POR PRODUCTOS
   * =====================================================
   */
  async createByItems(
    orderId: string,
    dto: CreateItemSplitDto,
  ) {
    const order =
      await this.getSplittableOrder(
        orderId,
      );

    /*
     * Cuánto se está asignando de
     * cada OrderItem.
     */
    const allocations =
      new Map<
        string,
        number
      >();

    for (
      const split
      of dto.splits
    ) {
      for (
        const allocation
        of split.items
      ) {
        const orderItem =
          order.items.find(
            (item) =>
              item.id ===
              allocation.orderItemId,
          );

        if (!orderItem) {
          throw new BadRequestException(
            'Uno de los productos seleccionados no pertenece a este pedido',
          );
        }

        const previous =
          allocations.get(
            allocation.orderItemId,
          ) ?? 0;

        const newQuantity =
          previous +
          allocation.quantity;

        if (
          newQuantity >
          orderItem.quantity +
            0.000001
        ) {
          throw new BadRequestException(
            `Se está asignando una cantidad mayor a la comprada de ${orderItem.productName}`,
          );
        }

        allocations.set(
          allocation.orderItemId,
          newQuantity,
        );
      }
    }

    /*
     * Todos los productos deben quedar
     * asignados a alguna cuenta.
     */
    for (
      const orderItem
      of order.items
    ) {
      const assigned =
        allocations.get(
          orderItem.id,
        ) ?? 0;

      if (
        Math.abs(
          assigned -
            orderItem.quantity,
        ) >
        0.000001
      ) {
        throw new BadRequestException(
          `Falta asignar completamente ${orderItem.productName}`,
        );
      }
    }

    return this.prisma.$transaction(
      async (tx) => {
        await tx.orderSplit.deleteMany({
          where: {
            orderId:
              order.id,
          },
        });

        const result: Array<{
          id: string;
          label: string;
          total: number;
        }> = [];

        let calculatedGrandTotalCents =
          0;

        for (
          const requestedSplit
          of dto.splits
        ) {
          let splitSubtotalCents =
            0;

          const preparedItems: Array<{
            orderItemId: string;
            quantity: number;
            amount: number;
          }> = [];

          for (
            const allocation
            of requestedSplit.items
          ) {
            const orderItem =
              order.items.find(
                (item) =>
                  item.id ===
                  allocation.orderItemId,
              );

            if (!orderItem) {
              throw new BadRequestException(
                'El producto del pedido no existe',
              );
            }

            const amount =
              Math.round(
                (
                  orderItem.unitPrice *
                  allocation.quantity
                ) *
                  100,
              ) / 100;

            splitSubtotalCents +=
              Math.round(
                amount * 100,
              );

            preparedItems.push({
              orderItemId:
                orderItem.id,

              quantity:
                allocation.quantity,

              amount,
            });
          }

          calculatedGrandTotalCents +=
            splitSubtotalCents;

          const splitSubtotal =
            splitSubtotalCents /
            100;

          const split =
            await tx.orderSplit.create({
              data: {
                label:
                  requestedSplit.label.trim(),

                mode:
                  'items',

                status:
                  'open',

                subtotal:
                  splitSubtotal,

                discount:
                  0,

                total:
                  splitSubtotal,

                orderId:
                  order.id,

                companyId:
                  order.companyId,

                items: {
                  create:
                    preparedItems.map(
                      (item) => ({
                        orderItemId:
                          item.orderItemId,

                        quantity:
                          item.quantity,

                        amount:
                          item.amount,
                      }),
                    ),
                },
              },

              include: {
                items: {
                  include: {
                    orderItem:
                      true,
                  },
                },
              },
            });

          result.push({
            id:
              split.id,

            label:
              split.label,

            total:
              split.total,
          });
        }

        /*
         * Por ahora todavía no aplicamos
         * descuentos. Por eso la división
         * por artículos debe igualar el total.
         *
         * En el siguiente bloque distribuiremos
         * promociones/descuentos entre cuentas.
         */
        const orderTotalCents =
          Math.round(
            order.total * 100,
          );

        if (
          calculatedGrandTotalCents !==
          orderTotalCents
        ) {
          throw new BadRequestException(
            'El total de los productos divididos no coincide con el total del pedido',
          );
        }

        return {
          orderId:
            order.id,

          orderTotal:
            order.total,

          mode:
            'items',

          splits:
            result,
        };
      },
    );
  }
}