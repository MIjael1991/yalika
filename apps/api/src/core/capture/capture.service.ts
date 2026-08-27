import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { classifyCapture } from './capture-classifier';
import { interpretCaptureTemporal } from './capture-temporal';
import { InterpretCaptureDto } from './dto/interpret-capture.dto';

@Injectable()
export class CaptureService {
  constructor(private readonly prisma: PrismaService) {}

  async interpret(
    dto: InterpretCaptureDto,
    userId: string,
    companyId: string,
  ) {
    const spaces = await this.prisma.space.findMany({
      where: {
        companyId,
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
                role: {
                  not: 'viewer',
                },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        type: true,
        timezone: true,
      },
      orderBy: [
        {
          type: 'asc',
        },
        {
          name: 'asc',
        },
      ],
    });

    if (spaces.length === 0) {
      throw new BadRequestException(
        'Crea un espacio de ORION Life antes de organizar tareas',
      );
    }

    if (
      dto.activeSpaceId &&
      !spaces.some((space) => space.id === dto.activeSpaceId)
    ) {
      throw new ForbiddenException(
        'No puedes usar ese espacio para clasificar la tarea',
      );
    }

    const history = await this.prisma.task.findMany({
      where: {
        companyId,
        createdById: userId,
        spaceId: {
          in: spaces.map((space) => space.id),
        },
      },
      select: {
        title: true,
        category: true,
        spaceId: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 120,
    });

    const classification = classifyCapture({
      message: dto.message,
      spaces,
      activeSpaceId: dto.activeSpaceId,
      history,
    });
    const temporal = interpretCaptureTemporal({
      message: dto.message,
      title: classification.title,
      timezone: classification.suggestedSpace.timezone ?? 'UTC',
    });

    return {
      ...classification,
      ...temporal,
    };
  }
}
