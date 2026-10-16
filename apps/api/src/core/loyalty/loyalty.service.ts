import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateLoyaltyProgramDto } from './dto/create-loyalty-program.dto';

@Injectable()
export class LoyaltyService {
  constructor(private readonly prisma: PrismaService) {}

  async findByCompany(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: {
        id: companyId,
      },
    });

    if (!company) {
      throw new NotFoundException('La empresa no existe');
    }

    return this.prisma.loyaltyProgram.findMany({
      where: {
        companyId,
      },
      include: {
        _count: {
          select: {
            visits: true,
            rewards: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const program = await this.prisma.loyaltyProgram.findUnique({
      where: {
        id,
      },
      include: {
        company: true,
        _count: {
          select: {
            visits: true,
            rewards: true,
          },
        },
      },
    });

    if (!program) {
      throw new NotFoundException('El programa de fidelización no existe');
    }

    return program;
  }

  async create(createLoyaltyProgramDto: CreateLoyaltyProgramDto) {
    const company = await this.prisma.company.findUnique({
      where: {
        id: createLoyaltyProgramDto.companyId,
      },
    });

    if (!company) {
      throw new NotFoundException('La empresa no existe');
    }

    const startsAt = new Date(createLoyaltyProgramDto.startsAt);

    const endsAt = new Date(createLoyaltyProgramDto.endsAt);

    if (endsAt <= startsAt) {
      throw new BadRequestException(
        'La fecha final debe ser posterior a la fecha de inicio',
      );
    }

    return this.prisma.loyaltyProgram.create({
      data: {
        name: createLoyaltyProgramDto.name.trim(),
        description: createLoyaltyProgramDto.description?.trim(),

        requiredVisits: createLoyaltyProgramDto.requiredVisits,

        rewardType: createLoyaltyProgramDto.rewardType?.trim() ?? 'custom',

        rewardDescription: createLoyaltyProgramDto.rewardDescription.trim(),

        rewardValidDays: createLoyaltyProgramDto.rewardValidDays,

        startsAt,
        endsAt,

        status: 'draft',

        companyId: createLoyaltyProgramDto.companyId,
      },
    });
  }

  async activate(id: string) {
    const program = await this.prisma.loyaltyProgram.findUnique({
      where: {
        id,
      },
    });

    if (!program) {
      throw new NotFoundException('El programa de fidelización no existe');
    }

    if (program.status === 'closed') {
      throw new BadRequestException(
        'Una campaña cerrada no puede volver a activarse',
      );
    }

    const now = new Date();

    if (now > program.endsAt) {
      throw new BadRequestException('La campaña ya terminó su vigencia');
    }

    return this.prisma.loyaltyProgram.update({
      where: {
        id,
      },
      data: {
        status: 'active',
      },
    });
  }

  async pause(id: string) {
    const program = await this.prisma.loyaltyProgram.findUnique({
      where: {
        id,
      },
    });

    if (!program) {
      throw new NotFoundException('El programa de fidelización no existe');
    }

    if (program.status === 'closed') {
      throw new BadRequestException('Una campaña cerrada no puede pausarse');
    }

    if (program.status !== 'active') {
      throw new BadRequestException('Solo una campaña activa puede pausarse');
    }

    return this.prisma.loyaltyProgram.update({
      where: {
        id,
      },
      data: {
        status: 'paused',
      },
    });
  }

  async close(id: string) {
    const program = await this.prisma.loyaltyProgram.findUnique({
      where: {
        id,
      },
    });

    if (!program) {
      throw new NotFoundException('El programa de fidelización no existe');
    }

    if (program.status === 'closed') {
      return program;
    }

    return this.prisma.loyaltyProgram.update({
      where: {
        id,
      },
      data: {
        status: 'closed',
        closedAt: new Date(),
      },
    });
  }

  async progress(programId: string, customerId: string) {
    const program = await this.prisma.loyaltyProgram.findUnique({
      where: {
        id: programId,
      },
    });

    if (!program) {
      throw new NotFoundException('El programa de fidelización no existe');
    }

    const customer = await this.prisma.customer.findUnique({
      where: {
        id: customerId,
      },
    });

    if (!customer) {
      throw new NotFoundException('El cliente no existe');
    }

    if (customer.companyId !== program.companyId) {
      throw new BadRequestException(
        'El cliente no pertenece a la empresa de esta campaña',
      );
    }

    const confirmedVisits = await this.prisma.visit.count({
      where: {
        customerId,
        companyId: program.companyId,
        loyaltyProgramId: program.id,
        status: 'confirmed',
      },
    });

    const reward = await this.prisma.customerReward.findFirst({
      where: {
        customerId,
        loyaltyProgramId: program.id,
      },
      orderBy: {
        earnedAt: 'desc',
      },
    });

    const remainingVisits = Math.max(
      program.requiredVisits - confirmedVisits,
      0,
    );

    const percentage = Math.min(
      Math.round((confirmedVisits / program.requiredVisits) * 100),
      100,
    );

    return {
      program: {
        id: program.id,
        name: program.name,
        status: program.status,
        requiredVisits: program.requiredVisits,
        rewardDescription: program.rewardDescription,
        startsAt: program.startsAt,
        endsAt: program.endsAt,
      },

      customer: {
        id: customer.id,
        name: customer.name,
      },

      progress: {
        confirmedVisits,
        remainingVisits,
        percentage,
        completed: confirmedVisits >= program.requiredVisits,
      },

      reward,
    };
  }
}
