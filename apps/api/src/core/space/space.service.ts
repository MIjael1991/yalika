import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../../auth/auth.types';
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

function isUniqueConstraintError(error: unknown) {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'P2002',
  );
}

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
        OR: [
          {
            type: 'personal',
            ownerUserId: userId,
          },
          {
            type: {
              not: 'personal',
            },
            members: {
              some: {
                userId,
                status: 'active',
              },
            },
          },
        ],
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

  async create(dto: CreateSpaceDto, owner: AuthenticatedUser) {
    if (dto.type === 'personal') {
      const existing = await this.findActivePersonalSpace(owner.id);

      if (existing) {
        return {
          ...existing,
          reused: true,
        };
      }
    }

    try {
      const created = await this.prisma.space.create({
        data: {
          name: dto.name.trim(),
          description: dto.description?.trim() || undefined,
          type: dto.type,
          timezone: dto.timezone?.trim() || 'UTC',
          companyId: owner.companyId,
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

      return {
        ...created,
        reused: false,
      };
    } catch (error) {
      if (dto.type === 'personal' && isUniqueConstraintError(error)) {
        const existing = await this.findActivePersonalSpace(owner.id);

        if (existing) {
          return {
            ...existing,
            reused: true,
          };
        }
      }

      throw error;
    }
  }

  private findActivePersonalSpace(ownerUserId: string) {
    return this.prisma.space.findFirst({
      where: {
        ownerUserId,
        type: 'personal',
        status: 'active',
      },
      include: spaceInclude,
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async addMember(
    spaceId: string,
    dto: AddSpaceMemberDto,
    actorUserId: string,
  ) {
    const space = await this.prisma.space.findUnique({
      where: {
        id: spaceId,
      },
      include: {
        members: {
          where: {
            userId: actorUserId,
            status: 'active',
          },
        },
      },
    });

    if (!space || space.status !== 'active') {
      throw new NotFoundException('El espacio no existe o está archivado');
    }

    if (space.type === 'personal') {
      throw new BadRequestException(
        'Un espacio personal no puede compartirse. Usa un espacio familiar.',
      );
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
