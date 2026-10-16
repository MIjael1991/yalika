import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateVisitDto } from './dto/create-visit.dto';

@Injectable()
export class VisitService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string) {
    return this.prisma.visit.findMany({
      where: { companyId },
      include: {
        customer: true,
        company: true,
        loyaltyProgram: true,
      },
      orderBy: {
        occurredAt: 'desc',
      },
    });
  }

  async findByCompany(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: {
        id: companyId,
      },
    });

    if (!company) {
      throw new NotFoundException('La empresa no existe');
    }

    return this.prisma.visit.findMany({
      where: {
        companyId,
      },
      include: {
        customer: true,
        loyaltyProgram: true,
      },
      orderBy: {
        occurredAt: 'desc',
      },
    });
  }

  async findByCustomer(customerId: string, companyId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: {
        id: customerId,
        companyId,
      },
    });

    if (!customer) {
      throw new NotFoundException('El cliente no existe');
    }

    return this.prisma.visit.findMany({
      where: {
        customerId,
        companyId,
      },
      include: {
        loyaltyProgram: true,
      },
      orderBy: {
        occurredAt: 'desc',
      },
    });
  }

  async countByCustomer(customerId: string, companyId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: {
        id: customerId,
        companyId,
      },
    });

    if (!customer) {
      throw new NotFoundException('El cliente no existe');
    }

    const visits = await this.prisma.visit.count({
      where: {
        customerId,
        companyId,
        status: 'confirmed',
      },
    });

    return {
      customerId,
      customerName: customer.name,
      visits,
    };
  }

  async create(createVisitDto: CreateVisitDto) {
    const customer = await this.prisma.customer.findUnique({
      where: {
        id: createVisitDto.customerId,
      },
    });

    if (!customer) {
      throw new NotFoundException('El cliente no existe');
    }

    if (customer.companyId !== createVisitDto.companyId) {
      throw new BadRequestException('El cliente no pertenece a esta empresa');
    }

    /*
     * VISITA NORMAL
     * No pertenece a una campaña.
     */
    if (!createVisitDto.loyaltyProgramId) {
      const visit = await this.prisma.visit.create({
        data: {
          customerId: createVisitDto.customerId,

          companyId: createVisitDto.companyId,

          source: createVisitDto.source ?? 'manual',

          notes: createVisitDto.notes?.trim(),

          status: 'confirmed',
        },
      });

      return {
        visit,
        loyalty: null,
        rewardCreated: false,
        reward: null,
      };
    }

    /*
     * VISITA DE UNA CAMPAÑA
     */
    const program = await this.prisma.loyaltyProgram.findUnique({
      where: {
        id: createVisitDto.loyaltyProgramId,
      },
    });

    if (!program) {
      throw new NotFoundException('La campaña no existe');
    }

    if (program.companyId !== createVisitDto.companyId) {
      throw new BadRequestException('La campaña no pertenece a esta empresa');
    }

    if (program.status !== 'active') {
      throw new BadRequestException('La campaña no está activa');
    }

    const now = new Date();

    if (now < program.startsAt || now > program.endsAt) {
      throw new BadRequestException('La campaña está fuera de vigencia');
    }

    /*
     * Todo esto sucede junto:
     *
     * 1. Crear visita.
     * 2. Contar progreso.
     * 3. Comprobar premio.
     * 4. Crear premio si corresponde.
     */
    return this.prisma.$transaction(async (tx) => {
      const visit = await tx.visit.create({
        data: {
          customerId: createVisitDto.customerId,

          companyId: createVisitDto.companyId,

          loyaltyProgramId: program.id,

          source: createVisitDto.source ?? 'manual',

          notes: createVisitDto.notes?.trim(),

          status: 'confirmed',
        },
      });

      const confirmedVisits = await tx.visit.count({
        where: {
          customerId: createVisitDto.customerId,

          companyId: createVisitDto.companyId,

          loyaltyProgramId: program.id,

          status: 'confirmed',
        },
      });

      let reward = await tx.customerReward.findFirst({
        where: {
          customerId: createVisitDto.customerId,

          loyaltyProgramId: program.id,
        },
      });

      let rewardCreated = false;

      if (confirmedVisits >= program.requiredVisits && !reward) {
        const expiresAt = new Date();

        expiresAt.setUTCDate(expiresAt.getUTCDate() + program.rewardValidDays);

        reward = await tx.customerReward.create({
          data: {
            rewardType: program.rewardType,

            rewardDescription: program.rewardDescription,

            status: 'available',

            expiresAt,

            customerId: createVisitDto.customerId,

            companyId: createVisitDto.companyId,

            loyaltyProgramId: program.id,
          },
        });

        rewardCreated = true;
      }

      const remainingVisits = Math.max(
        program.requiredVisits - confirmedVisits,
        0,
      );

      return {
        visit,

        loyalty: {
          programId: program.id,
          programName: program.name,

          confirmedVisits,

          requiredVisits: program.requiredVisits,

          remainingVisits,

          percentage: Math.min(
            Math.round((confirmedVisits / program.requiredVisits) * 100),
            100,
          ),
        },

        rewardCreated,
        reward,
      };
    });
  }
}
