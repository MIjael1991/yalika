import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { ScratchService } from '../scratch/scratch.service';
import { ClaimTicketDto } from './dto/claim-ticket.dto';
import { IdentifyCustomerDto } from './dto/identify-customer.dto';
import { JoinClubDto } from './dto/join-club.dto';
import {
  createMemberAccessToken,
  verifyTicketClaimToken,
} from './ticket-claim';

@Injectable()
export class EngagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scratchService: ScratchService,
  ) {}

  private normalizePhone(value: string) {
    const trimmed = value.trim();
    const prefix = trimmed.startsWith('+') ? '+' : '';
    const digits = trimmed.replace(/\D/g, '');

    if (digits.length < 7) {
      throw new BadRequestException('El teléfono está incompleto');
    }

    return `${prefix}${digits}`;
  }

  private async getSite(slug: string) {
    const site = await this.prisma.site.findUnique({
      where: {
        slug: slug.trim().toLowerCase(),
      },
      include: {
        company: true,
      },
    });

    if (!site || site.status !== 'published') {
      throw new NotFoundException('Esta página todavía no está publicada');
    }

    return site;
  }

  private async getActiveProgram(companyId: string) {
    const now = new Date();

    return this.prisma.loyaltyProgram.findFirst({
      where: {
        companyId,
        status: 'active',
        startsAt: {
          lte: now,
        },
        endsAt: {
          gte: now,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findClub(slug: string) {
    const site = await this.getSite(slug);
    const now = new Date();
    const [program, promotions] = await Promise.all([
      this.getActiveProgram(site.companyId),
      this.prisma.promotion.findMany({
        where: {
          companyId: site.companyId,
          status: 'active',
          startsAt: {
            lte: now,
          },
          endsAt: {
            gte: now,
          },
        },
        select: {
          id: true,
          title: true,
          description: true,
          type: true,
          discountValue: true,
          specialPrice: true,
          imageUrl: true,
          endsAt: true,
        },
        orderBy: [
          {
            featured: 'desc',
          },
          {
            createdAt: 'desc',
          },
        ],
        take: 4,
      }),
    ]);

    return {
      site: {
        name: site.name,
        slug: site.slug,
        template: site.template,
        primaryColor: site.primaryColor,
        accentColor: site.accentColor,
        logoUrl: site.logoUrl,
        heroImageUrl: site.heroImageUrl,
      },
      program: program
        ? {
            id: program.id,
            name: program.name,
            description: program.description,
            requiredVisits: program.requiredVisits,
            rewardDescription: program.rewardDescription,
            rewardValidDays: program.rewardValidDays,
            endsAt: program.endsAt,
          }
        : null,
      promotions,
    };
  }

  private async membership(
    companyId: string,
    programId: string,
    customerId: string,
  ) {
    const program = await this.prisma.loyaltyProgram.findUnique({
      where: {
        id: programId,
      },
    });

    if (!program || program.companyId !== companyId) {
      throw new NotFoundException('El club de recompensas no está disponible');
    }

    const [customer, confirmedVisits, reward, scratch] = await Promise.all([
      this.prisma.customer.findUnique({
        where: {
          id: customerId,
        },
        select: {
          id: true,
          name: true,
          phone: true,
        },
      }),
      this.prisma.visit.count({
        where: {
          customerId,
          companyId,
          loyaltyProgramId: programId,
          source: 'order',
          status: 'confirmed',
        },
      }),
      this.prisma.customerReward.findFirst({
        where: {
          customerId,
          loyaltyProgramId: programId,
        },
        orderBy: {
          earnedAt: 'desc',
        },
      }),
      this.scratchService.getMemberStatus(companyId, programId, customerId),
    ]);

    if (!customer) {
      throw new NotFoundException('El cliente no existe');
    }

    const remainingVisits = Math.max(
      program.requiredVisits - confirmedVisits,
      0,
    );

    return {
      customer,
      memberToken: createMemberAccessToken(customer.id, companyId),
      progress: {
        confirmedVisits,
        requiredVisits: program.requiredVisits,
        remainingVisits,
        percentage: Math.min(
          Math.round((confirmedVisits / program.requiredVisits) * 100),
          100,
        ),
        completed: confirmedVisits >= program.requiredVisits,
      },
      reward,
      scratch,
    };
  }

  async join(slug: string, dto: JoinClubDto) {
    const site = await this.getSite(slug);
    const program = await this.getActiveProgram(site.companyId);

    if (!program) {
      throw new NotFoundException(
        'Este negocio todavía no tiene un club activo',
      );
    }

    const phone = this.normalizePhone(dto.phone);
    const customer = await this.prisma.customer.upsert({
      where: {
        companyId_phone: {
          companyId: site.companyId,
          phone,
        },
      },
      update: {
        name: dto.name.trim(),
      },
      create: {
        name: dto.name.trim(),
        phone,
        companyId: site.companyId,
      },
    });

    return this.membership(site.companyId, program.id, customer.id);
  }

  async checkIn(slug: string, dto: JoinClubDto) {
    const membership = await this.join(slug, dto);

    return {
      ...membership,
      alreadyRegistered: true,
      rewardCreated: false,
      visitRequiresPaidTicket: true,
    };
  }

  async identifyCustomer(companyId: string, dto: IdentifyCustomerDto) {
    const company = await this.prisma.company.findUnique({
      where: {
        id: companyId,
      },
    });

    if (!company) {
      throw new NotFoundException('La empresa no existe');
    }

    const program = await this.getActiveProgram(companyId);
    const phone = this.normalizePhone(dto.phone);
    const customer = await this.prisma.customer.upsert({
      where: {
        companyId_phone: {
          companyId,
          phone,
        },
      },
      update: dto.name?.trim()
        ? {
            name: dto.name.trim(),
          }
        : {},
      create: {
        name: dto.name?.trim() || `Cliente ${phone.slice(-4)}`,
        phone,
        companyId,
      },
      select: {
        id: true,
        name: true,
        phone: true,
      },
    });

    return {
      customer,
      program: program
        ? {
            id: program.id,
            name: program.name,
            requiredVisits: program.requiredVisits,
            rewardDescription: program.rewardDescription,
          }
        : null,
    };
  }

  async claimTicket(slug: string, dto: ClaimTicketDto) {
    const site = await this.getSite(slug);
    const program = await this.getActiveProgram(site.companyId);

    if (!program) {
      throw new NotFoundException(
        'Este negocio todavía no tiene un club activo',
      );
    }

    if (!verifyTicketClaimToken(dto.token, dto.orderId, site.companyId)) {
      throw new BadRequestException('El código del ticket no es válido');
    }

    const phone = this.normalizePhone(dto.phone);
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "orders"
          WHERE "id" = ${dto.orderId}
          FOR UPDATE
        `;

      const order = await tx.order.findUnique({
        where: {
          id: dto.orderId,
        },
      });

      if (!order || order.companyId !== site.companyId) {
        throw new NotFoundException('El ticket no pertenece a este negocio');
      }

      if (order.status !== 'confirmed' || order.paymentStatus !== 'paid') {
        throw new BadRequestException(
          'Solo un ticket pagado puede sumar beneficios',
        );
      }

      const refunded = await tx.refund.aggregate({
        where: {
          status: 'completed',
          returnRecord: {
            orderId: order.id,
          },
        },
        _sum: {
          amount: true,
        },
      });

      if ((refunded._sum.amount ?? 0) >= order.total - 0.001) {
        throw new BadRequestException('Esta venta fue anulada o reembolsada');
      }

      const customer = await tx.customer.upsert({
        where: {
          companyId_phone: {
            companyId: site.companyId,
            phone,
          },
        },
        update: {
          name: dto.name.trim(),
        },
        create: {
          name: dto.name.trim(),
          phone,
          companyId: site.companyId,
        },
      });

      if (order.customerId && order.customerId !== customer.id) {
        throw new BadRequestException(
          'Este ticket ya fue registrado con otro teléfono',
        );
      }

      if (!order.customerId || order.loyaltyProgramId !== program.id) {
        await tx.order.update({
          where: {
            id: order.id,
          },
          data: {
            customerId: customer.id,
            loyaltyProgramId: program.id,
          },
        });
      }

      const existingVisit = await tx.visit.findFirst({
        where: {
          customerId: customer.id,
          companyId: site.companyId,
          loyaltyProgramId: program.id,
          source: 'order',
          status: 'confirmed',
          notes: `Pedido ${order.orderNumber}`,
        },
      });

      if (!existingVisit) {
        await tx.visit.create({
          data: {
            customerId: customer.id,
            companyId: site.companyId,
            loyaltyProgramId: program.id,
            source: 'order',
            status: 'confirmed',
            notes: `Pedido ${order.orderNumber}`,
          },
        });
      }

      const confirmedVisits = await tx.visit.count({
        where: {
          customerId: customer.id,
          companyId: site.companyId,
          loyaltyProgramId: program.id,
          source: 'order',
          status: 'confirmed',
        },
      });
      const existingReward = await tx.customerReward.findFirst({
        where: {
          customerId: customer.id,
          loyaltyProgramId: program.id,
        },
      });
      let rewardCreated = false;

      if (
        confirmedVisits >= program.requiredVisits &&
        (!existingReward || existingReward.status === 'cancelled')
      ) {
        const expiresAt = new Date();
        expiresAt.setUTCDate(expiresAt.getUTCDate() + program.rewardValidDays);
        if (!existingReward) {
          await tx.customerReward.create({
            data: {
              rewardType: program.rewardType,
              rewardDescription: program.rewardDescription,
              status: 'available',
              expiresAt,
              customerId: customer.id,
              companyId: site.companyId,
              loyaltyProgramId: program.id,
            },
          });
        } else {
          await tx.customerReward.update({
            where: {
              id: existingReward.id,
            },
            data: {
              status: 'available',
              expiresAt,
              redeemedAt: null,
            },
          });
        }
        rewardCreated = true;
      }

      return {
        customerId: customer.id,
        alreadyRegistered: Boolean(existingVisit),
        rewardCreated,
      };
    });
    const membership = await this.membership(
      site.companyId,
      program.id,
      result.customerId,
    );

    return {
      ...membership,
      alreadyRegistered: result.alreadyRegistered,
      rewardCreated: result.rewardCreated,
    };
  }
}
