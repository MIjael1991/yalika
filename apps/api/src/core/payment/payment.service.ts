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

  /*
   * =====================================================
   * PAGOS DE UN PEDIDO
   * =====================================================
   */
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

      orderBy: {
        paidAt: 'asc',
      },
    });
  }

  /*
   * =====================================================
   * REGISTRAR PAGO
   * =====================================================
   */
  async createPayment(
    orderId: string,
    dto: CreatePaymentDto,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
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

        /*
         * Primero queremos una venta confirmada.
         */
        if (
          order.status !== 'confirmed'
        ) {
          throw new BadRequestException(
            'El pedido debe estar confirmado antes de registrar el pago',
          );
        }

        /*
         * Sumamos lo que ya se pagó.
         */
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

        /*
         * Redondeamos a dos decimales
         * para las operaciones del MVP.
         */
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

        /*
         * Si amount no viene,
         * cobramos exactamente lo restante.
         */
        const amount =
          dto.amount ??
          remaining;

        if (amount <= 0) {
          throw new BadRequestException(
            'El pago debe ser mayor a cero',
          );
        }

        if (
          amount >
          remaining + 0.001
        ) {
          throw new BadRequestException(
            `El pago aplicado no puede superar el saldo pendiente de $${remaining}`,
          );
        }

        let receivedAmount:
          | number
          | undefined;

        let changeAmount =
          0;

        /*
         * EFECTIVO
         */
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

        /*
         * TARJETA / TRANSFERENCIA / OTRO
         *
         * No manejan cambio.
         */
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
        };
      },
    );
  }
}