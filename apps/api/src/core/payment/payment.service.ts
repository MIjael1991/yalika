import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async findByOrder(
    orderId: string,
  ) {
    const order =
      await this.prisma.order.findUnique({
        where: {
          id: orderId,
        },
      });

    if (!order) {
      throw new NotFoundException(
        'El pedido no existe',
      );
    }

    return this.prisma.payment.findMany({
      where: {
        orderId,
        status: 'completed',
      },

      include: {
        orderSplit: true,
      },

      orderBy: {
        paidAt: 'asc',
      },
    });
  }

  async createPayment(
    orderId: string,
    dto: CreatePaymentDto,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "orders"
          WHERE "id" = ${orderId}
          FOR UPDATE
        `;

        const order =
          await tx.order.findUnique({
            where: {
              id: orderId,
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
            'El pedido debe estar confirmado antes de registrar el pago',
          );
        }

        const paymentTotals =
          await tx.payment.aggregate({
            where: {
              orderId:
                order.id,

              status:
                'completed',
            },

            _sum: {
              amount:
                true,
            },
          });

        const alreadyPaid =
          paymentTotals._sum.amount ??
          0;

        const remaining =
          Math.round(
            (
              order.total -
              alreadyPaid
            ) *
              100,
          ) / 100;

        if (remaining <= 0) {
          throw new BadRequestException(
            'Este pedido ya está pagado',
          );
        }

        const orderSplitCount =
          await tx.orderSplit.count({
            where: {
              orderId:
                order.id,
            },
          });

        if (
          orderSplitCount > 0 &&
          !dto.orderSplitId
        ) {
          throw new BadRequestException(
            'Selecciona una de las cuentas divididas para registrar el pago',
          );
        }

        let orderSplit:
          | {
              id: string;
              label: string;
              total: number;
            }
          | null = null;

        let splitPaidBefore =
          0;

        let payableRemaining =
          remaining;

        if (dto.orderSplitId) {
          const split =
            await tx.orderSplit.findUnique({
              where: {
                id: dto.orderSplitId,
              },

              include: {
                payments: {
                  where: {
                    status: 'completed',
                  },
                },
              },
            });

          if (!split) {
            throw new NotFoundException(
              'La cuenta dividida no existe',
            );
          }

          if (
            split.orderId !==
            order.id
          ) {
            throw new BadRequestException(
              'La cuenta dividida no pertenece a este pedido',
            );
          }

          splitPaidBefore =
            Math.round(
              split.payments.reduce(
                (
                  accumulator,
                  payment,
                ) =>
                  accumulator +
                  payment.amount,
                0,
              ) * 100,
            ) / 100;

          const splitRemaining =
            Math.max(
              Math.round(
                (
                  split.total -
                  splitPaidBefore
                ) * 100,
              ) / 100,
              0,
            );

          if (
            splitRemaining <=
            0
          ) {
            throw new BadRequestException(
              'Esta cuenta dividida ya está pagada',
            );
          }

          payableRemaining =
            Math.min(
              remaining,
              splitRemaining,
            );

          orderSplit = {
            id: split.id,
            label: split.label,
            total: split.total,
          };
        }

        const amount =
          dto.amount ??
          payableRemaining;

        if (amount <= 0) {
          throw new BadRequestException(
            'El pago debe ser mayor a cero',
          );
        }

        if (
          amount >
          payableRemaining + 0.001
        ) {
          throw new BadRequestException(
            `El pago aplicado no puede superar el saldo pendiente de $${payableRemaining}`,
          );
        }

        let receivedAmount:
          | number
          | undefined;

        let changeAmount =
          0;

        if (
          dto.method === 'cash'
        ) {
          receivedAmount =
            dto.receivedAmount ??
            amount;

          if (
            receivedAmount <
            amount
          ) {
            throw new BadRequestException(
              'El efectivo recibido es menor al pago que se desea aplicar',
            );
          }

          changeAmount =
            Math.round(
              (
                receivedAmount -
                amount
              ) *
                100,
            ) / 100;
        }

        if (
          dto.method !== 'cash'
        ) {
          receivedAmount =
            undefined;

          changeAmount =
            0;
        }

        const payment =
          await tx.payment.create({
            data: {
              method:
                dto.method,

              status:
                'completed',

              amount,

              receivedAmount,

              changeAmount,

              reference:
                dto.reference?.trim(),

              notes:
                dto.notes?.trim(),

              orderId:
                order.id,

              orderSplitId:
                orderSplit?.id,

              companyId:
                order.companyId,
            },
          });

        const totalPaid =
          Math.round(
            (
              alreadyPaid +
              amount
            ) *
              100,
          ) / 100;

        const newRemaining =
          Math.max(
            Math.round(
              (
                order.total -
                totalPaid
              ) *
                100,
            ) / 100,
            0,
          );

        const paymentStatus =
          newRemaining <= 0
            ? 'paid'
            : 'partial';

        const updatedOrder =
          await tx.order.update({
            where: {
              id:
                order.id,
            },

            data: {
              paymentStatus,
            },
          });

        let splitSummary:
          | {
              id: string;
              label: string;
              total: number;
              totalPaid: number;
              remaining: number;
              status: string;
            }
          | null = null;

        if (orderSplit) {
          const splitTotalPaid =
            Math.round(
              (
                splitPaidBefore +
                amount
              ) * 100,
            ) / 100;

          const splitRemaining =
            Math.max(
              Math.round(
                (
                  orderSplit.total -
                  splitTotalPaid
                ) * 100,
              ) / 100,
              0,
            );

          const splitStatus =
            splitRemaining <= 0
              ? 'paid'
              : 'partial';

          await tx.orderSplit.update({
            where: {
              id:
                orderSplit.id,
            },

            data: {
              status:
                splitStatus,
            },
          });

          splitSummary = {
            id: orderSplit.id,
            label: orderSplit.label,
            total: orderSplit.total,
            totalPaid: splitTotalPaid,
            remaining: splitRemaining,
            status: splitStatus,
          };
        }

        return {
          payment,

          order: {
            id:
              updatedOrder.id,

            orderNumber:
              updatedOrder.orderNumber,

            total:
              updatedOrder.total,

            paymentStatus:
              updatedOrder.paymentStatus,
          },

          summary: {
            previouslyPaid:
              alreadyPaid,

            paymentApplied:
              amount,

            totalPaid,

            remaining:
              newRemaining,

            receivedAmount:
              receivedAmount ?? null,

            changeAmount,
          },

          split:
            splitSummary,
        };
      },
    );
  }
}
