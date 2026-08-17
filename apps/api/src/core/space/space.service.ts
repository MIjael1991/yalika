import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { AddSpaceMemberDto } from './dto/add-space-member.dto';
import { CreateSpaceDto } from './dto/create-space.dto';

const spaceInclude = {
  owner: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  members: {
    where: {
      status: 'active',
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      joinedAt: 'asc' as const,
    },
  },
  _count: {
    select: {
      tasks: true,
    },
  },
};

@Injectable()
export class SpaceService {
  constructor(private readonly prisma: PrismaService) {}

  async findForUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user || user.status !== 'active') {
      throw new NotFoundException('El usuario de ORION no está activo');
    }

    return this.prisma.space.findMany({
      where: {
        status: 'active',
        members: {
          some: {
            userId,
            status: 'active',
          },
        },
      },
      include: spaceInclude,
      orderBy: [
        {
          type: 'asc',
        },
        {
          name: 'asc',
        },
      ],
    });
  }

  async create(dto: CreateSpaceDto) {
    const [company, owner] = await Promise.all([
      this.prisma.company.findUnique({
        where: {
          id: dto.companyId,
        },
      }),
      this.prisma.user.findUnique({
        where: {
          id: dto.ownerUserId,
        },
      }),
    ]);

    if (!company) {
      throw new NotFoundException('La empresa no existe');
    }

    if (!owner || owner.status !== 'active') {
      throw new NotFoundException('El propietario no está activo en ORION');
    }

    if (owner.companyId !== company.id) {
      throw new BadRequestException(
        'El propietario no pertenece a la organización que crea el espacio',
      );
    }

    return this.prisma.space.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || undefined,
        type: dto.type,
        timezone: dto.timezone?.trim() || 'UTC',
        companyId: company.id,
        ownerUserId: owner.id,
        members: {
          create: {
            userId: owner.id,
            role: 'owner',
          },
        },
      },
      include: spaceInclude,
    });
  }

  async addMember(spaceId: string, dto: AddSpaceMemberDto) {
    const space = await this.prisma.space.findUnique({
      where: {
        id: spaceId,
      },
      include: {
        members: {
          where: {
            userId: dto.actorUserId,
            status: 'active',
          },
        },
      },
    });

    if (!space || space.status !== 'active') {
      throw new NotFoundException('El espacio no existe o está archivado');
    }

    const actorMembership = space.members[0];

    if (
      !actorMembership ||
      !['owner', 'admin'].includes(actorMembership.role)
    ) {
      throw new ForbiddenException(
        'Solamente el propietario o un administrador puede agregar personas',
      );
    }

    const invitedUser = await this.prisma.user.findFirst({
      where: {
        email: {
          equals: dto.email.trim(),
          mode: 'insensitive',
        },
      },
    });

    if (!invitedUser || invitedUser.status !== 'active') {
      throw new NotFoundException(
        'No encontramos una cuenta activa de ORION con ese correo',
      );
    }

    if (invitedUser.id === space.ownerUserId) {
      throw new BadRequestException(
        'El propietario ya forma parte de este espacio',
      );
    }

    await this.prisma.spaceMember.upsert({
      where: {
        spaceId_userId: {
          spaceId,
          userId: invitedUser.id,
        },
      },
      create: {
        spaceId,
        userId: invitedUser.id,
        role: dto.role,
      },
      update: {
        role: dto.role,
        status: 'active',
      },
    });

    return this.prisma.space.findUnique({
      where: {
        id: spaceId,
      },
      include: spaceInclude,
    });
  }
}
