import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateDiningTableDto } from './dto/create-dining-table.dto';
import { UpdateDiningTableStatusDto } from './dto/update-dining-table-status.dto';

@Injectable()
export class DiningTableService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /*
   * =====================================================
   * CREAR MESA
   * =====================================================
   */
  async create(
    dto: CreateDiningTableDto,
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
      await this.prisma.diningTable.findFirst({
        where: {
          companyId:
            dto.companyId,

          code:
            dto.code.trim(),
        },
      });

    if (existing) {
      throw new ConflictException(
        'Ya existe una mesa con este código',
      );
    }

    return this.prisma.diningTable.create({
      data: {
        name:
          dto.name.trim(),

        code:
          dto.code.trim(),

        area:
          dto.area?.trim(),

        capacity:
          dto.capacity,

        status:
          'available',

        companyId:
          dto.companyId,
      },
    });
  }

  /*
   * =====================================================
   * LISTAR MESAS
   * =====================================================
   */
  async findByCompany(
    companyId: string,
  ) {
    return this.prisma.diningTable.findMany({
      where: {
        companyId,
      },

      include: {
        orders: {
          where: {
            status: {
              in: [
                'draft',
                'processing',
                'confirmed',
              ],
            },
          },

          select: {
            id: true,
            orderNumber: true,
            status: true,
            paymentStatus: true,
            total: true,
            createdAt: true,
          },
        },
      },

      orderBy: [
        {
          area: 'asc',
        },
        {
          code: 'asc',
        },
      ],
    });
  }

  /*
   * =====================================================
   * CAMBIAR ESTADO
   * =====================================================
   */
  async updateStatus(
    id: string,
    dto: UpdateDiningTableStatusDto,
  ) {
    const table =
      await this.prisma.diningTable.findUnique({
        where: {
          id,
        },
      });

    if (!table) {
      throw new NotFoundException(
        'La mesa no existe',
      );
    }

    return this.prisma.diningTable.update({
      where: {
        id,
      },

      data: {
        status:
          dto.status,
      },
    });
  }

  /*
   * =====================================================
   * ASIGNAR PEDIDO A MESA
   * =====================================================
   */
  async assignOrder(
    tableId: string,
    orderId: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const table =
          await tx.diningTable.findUnique({
            where: {
              id: tableId,
            },
          });

        if (!table) {
          throw new NotFoundException(
            'La mesa no existe',
          );
        }

        if (
          table.status ===
          'disabled'
        ) {
          throw new BadRequestException(
            'La mesa está deshabilitada',
          );
        }

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
          order.companyId !==
          table.companyId
        ) {
          throw new BadRequestException(
            'El pedido y la mesa pertenecen a empresas diferentes',
          );
        }

        if (
          order.status !== 'draft' &&
          order.status !== 'confirmed'
        ) {
          throw new BadRequestException(
            'Este pedido no puede asignarse a una mesa en su estado actual',
          );
        }

        const updatedOrder =
          await tx.order.update({
            where: {
              id: order.id,
            },

            data: {
              diningTableId:
                table.id,
            },
          });

        await tx.diningTable.update({
          where: {
            id: table.id,
          },

          data: {
            status:
              'occupied',
          },
        });

        return {
          table: {
            id:
              table.id,

            name:
              table.name,

            code:
              table.code,

            status:
              'occupied',
          },

          order:
            updatedOrder,
        };
      },
    );
  }

  /*
   * =====================================================
   * LIBERAR MESA
   * =====================================================
   */
  async release(
    id: string,
  ) {
    const table =
      await this.prisma.diningTable.findUnique({
        where: {
          id,
        },

        include: {
          orders: {
            where: {
              paymentStatus: {
                in: [
                  'pending',
                  'partial',
                ],
              },

              status: {
                in: [
                  'draft',
                  'confirmed',
                  'processing',
                ],
              },
            },
          },
        },
      });

    if (!table) {
      throw new NotFoundException(
        'La mesa no existe',
      );
    }

    if (
      table.orders.length > 0
    ) {
      throw new BadRequestException(
        'La mesa todavía tiene una cuenta pendiente',
      );
    }

    return this.prisma.diningTable.update({
      where: {
        id,
      },

      data: {
        status:
          'available',
      },
    });
  }
}