import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { classifyCapture } from './capture-classifier';
import {
  inferCaptureIntent,
  rankCaptureActionCandidates,
} from './capture-intent';
import { interpretCaptureTemporal } from './capture-temporal';
import { InterpretCaptureDto } from './dto/interpret-capture.dto';

@Injectable()
export class CaptureService {
  constructor(private readonly prisma: PrismaService) {}

  async interpret(dto: InterpretCaptureDto, userId: string, companyId: string) {
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

    const captureIntent = inferCaptureIntent(dto.message);

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

    if (captureIntent.intent !== 'create') {
      const candidates = await this.prisma.task.findMany({
        where: {
          companyId,
          spaceId: {
            in: spaces.map((space) => space.id),
          },
          status: {
            in: ['pending', 'in_progress'],
          },
        },
        select: {
          id: true,
          title: true,
          status: true,
          dueAt: true,
          spaceId: true,
          recurrenceId: true,
          recurrence: {
            select: {
              status: true,
              nextOccurrenceAt: true,
              endsAt: true,
            },
          },
          space: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
        take: 200,
      });
      const matches = rankCaptureActionCandidates({
        query: captureIntent.query,
        candidates,
        requestedDate: temporal.dueAt ? new Date(temporal.dueAt) : null,
        timezone: classification.suggestedSpace.timezone ?? 'UTC',
      });
      const firstMatch = matches[0];
      const secondMatch = matches[1];
      const recommendedTaskId =
        firstMatch &&
        firstMatch.score >= 0.82 &&
        (!secondMatch || firstMatch.score - secondMatch.score >= 0.16)
          ? firstMatch.id
          : null;

      return {
        ...classification,
        ...temporal,
        intent: captureIntent.intent,
        actionProposal: {
          intent: captureIntent.intent,
          query: captureIntent.query,
          scope: captureIntent.scope,
          recommendedTaskId,
          message:
            matches.length === 0
              ? 'No encontré una tarea activa que coincida. No crearé otra tarea con esta orden.'
              : matches.length === 1
                ? 'Encontré esta tarea. Confirma que sea la correcta antes de continuar.'
                : 'Encontré varias tareas parecidas. Elige exactamente cuál deseas cambiar.',
          matches: matches.map((match) => ({
            ...match,
            dueAt: match.dueAt?.toISOString() ?? null,
            recurrence: match.recurrence
              ? {
                  ...match.recurrence,
                  nextOccurrenceAt:
                    match.recurrence.nextOccurrenceAt.toISOString(),
                  endsAt: match.recurrence.endsAt?.toISOString() ?? null,
                }
              : null,
          })),
        },
      };
    }

    return {
      ...classification,
      ...temporal,
      intent: 'create',
      actionProposal: null,
    };
  }
}
