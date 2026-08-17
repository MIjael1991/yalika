import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import {
  CompleteTaskDto,
  PostponeTaskDto,
} from './dto/task-action.dto';

const activeStatuses = [
  'pending',
  'assigned',
  'in_progress',
  'postponed',
];

const taskInclude = {
  user: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  createdBy: {
    select: {
      id: true,
      name: true,
    },
  },
  claimedBy: {
    select: {
      id: true,
      name: true,
    },
  },
  completedBy: {
    select: {
      id: true,
      name: true,
    },
  },
  activities: {
    include: {
      actor: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc' as const,
    },
    take: 5,
  },
};

type TaskAccessRecord = {
  companyId: string;
  spaceId: string | null;
};

@Injectable()
export class TaskService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string) {
    return this.prisma.task.findMany({
      where: {
        companyId,
      },
      include: {
        company: true,
        user: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findToday(companyId: string) {
    const { startOfDay, endOfDay } = this.getTodayRange();

    return this.prisma.task.findMany({
      where: {
        companyId,
        dueAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
        status: {
          in: activeStatuses,
        },
      },
      orderBy: {
        dueAt: 'asc',
      },
    });
  }

  async findTodayByPriority(priority: string, companyId: string) {
    const { startOfDay, endOfDay } = this.getTodayRange();

    return this.prisma.task.findMany({
      where: {
        companyId,
        dueAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
        status: {
          in: activeStatuses,
        },
        priority,
      },
      orderBy: {
        dueAt: 'asc',
      },
    });
  }

  async findBySpace(spaceId: string, actorUserId: string) {
    await this.requireSpaceMembership(spaceId, actorUserId);

    return this.prisma.task.findMany({
      where: {
        spaceId,
      },
      include: taskInclude,
      orderBy: [
        {
          status: 'asc',
        },
        {
          dueAt: 'asc',
        },
        {
          createdAt: 'desc',
        },
      ],
    });
  }

  async create(
    dto: CreateTaskDto,
    actorUserId: string,
    companyId: string,
  ) {
    const company = await this.prisma.company.findUnique({
      where: {
        id: companyId,
      },
    });

    if (!company) {
      throw new NotFoundException('La empresa no existe');
    }

    if (dto.spaceId) {
      const space = await this.prisma.space.findUnique({
        where: {
          id: dto.spaceId,
        },
      });

      if (!space || space.status !== 'active') {
        throw new NotFoundException('El espacio no existe o está archivado');
      }

      if (space.companyId !== companyId) {
        throw new BadRequestException(
          'El espacio no pertenece a la organización indicada',
        );
      }

      const membership = await this.requireSpaceMembership(
        dto.spaceId,
        actorUserId,
      );

      this.requireEditorRole(membership.role);
    }

    if (dto.userId) {
      const user = await this.prisma.user.findUnique({
        where: {
          id: dto.userId,
        },
      });

      if (!user || user.status !== 'active') {
        throw new NotFoundException('La persona asignada no está activa');
      }

      if (dto.spaceId) {
        await this.requireSpaceMembership(dto.spaceId, dto.userId);
      } else if (user.companyId !== companyId) {
        throw new BadRequestException(
          'El usuario no pertenece a esta empresa',
        );
      }
    }

    return this.prisma.task.create({
      data: {
        title: dto.title.trim(),
        description: dto.description?.trim() || undefined,
        category: dto.category?.trim() || undefined,
        priority: dto.priority ?? 'normal',
        status: dto.userId ? 'assigned' : 'pending',
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        estimatedMinutes: dto.estimatedMinutes,
        companyId,
        userId: dto.userId,
        spaceId: dto.spaceId,
        createdById: actorUserId,
        activities: {
          create: {
            action: 'created',
            toStatus: dto.userId ? 'assigned' : 'pending',
            actorUserId,
          },
        },
      },
      include: taskInclude,
    });
  }

  async claim(taskId: string, actorUserId: string) {
    const task = await this.getTask(taskId);
    const role = await this.requireActorAccess(task, actorUserId);

    this.requireEditorRole(role);

    if (!activeStatuses.includes(task.status)) {
      throw new BadRequestException(
        'Esta tarea ya no puede ser tomada por una persona',
      );
    }

    if (task.claimedById === actorUserId) {
      return this.prisma.task.findUnique({
        where: {
          id: taskId,
        },
        include: taskInclude,
      });
    }

    if (
      task.userId &&
      task.userId !== actorUserId &&
      !['owner', 'admin'].includes(role)
    ) {
      throw new ForbiddenException(
        'Esta tarea está asignada a otra persona',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const update = await tx.task.updateMany({
        where: {
          id: taskId,
          claimedById: null,
          status: {
            in: activeStatuses,
          },
        },
        data: {
          userId: actorUserId,
          claimedById: actorUserId,
          status: 'in_progress',
          postponedUntil: null,
          version: {
            increment: 1,
          },
        },
      });

      if (update.count !== 1) {
        throw new ConflictException(
          'Otra persona tomó esta tarea antes. La lista se actualizará.',
        );
      }

      await tx.taskActivity.create({
        data: {
          taskId,
          actorUserId,
          action: 'claimed',
          fromStatus: task.status,
          toStatus: 'in_progress',
        },
      });

      return tx.task.findUnique({
        where: {
          id: taskId,
        },
        include: taskInclude,
      });
    });
  }

  async complete(
    taskId: string,
    actorUserId: string,
    dto: CompleteTaskDto = {},
  ) {
    const task = await this.getTask(taskId);
    const role = await this.requireActorAccess(task, actorUserId);

    this.requireEditorRole(role);

    if (task.status === 'completed') {
      throw new BadRequestException('La tarea ya fue completada');
    }

    if (
      task.claimedById &&
      task.claimedById !== actorUserId &&
      !['owner', 'admin'].includes(role)
    ) {
      throw new ForbiddenException(
        'Otra persona está realizando esta tarea',
      );
    }

    if (
      task.userId &&
      task.userId !== actorUserId &&
      !['owner', 'admin'].includes(role)
    ) {
      throw new ForbiddenException(
        'Esta tarea está asignada a otra persona',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: {
          id: taskId,
        },
        data: {
          status: 'completed',
          completedAt: new Date(),
          completedById: actorUserId,
          version: {
            increment: 1,
          },
        },
      });

      await tx.taskActivity.create({
        data: {
          taskId,
          actorUserId,
          action: 'completed',
          fromStatus: task.status,
          toStatus: 'completed',
          note: dto.note?.trim() || undefined,
        },
      });

      return tx.task.findUnique({
        where: {
          id: taskId,
        },
        include: taskInclude,
      });
    });
  }

  async postpone(
    taskId: string,
    actorUserId: string,
    dto: PostponeTaskDto,
  ) {
    const task = await this.getTask(taskId);
    const role = await this.requireActorAccess(task, actorUserId);

    this.requireEditorRole(role);

    if (!activeStatuses.includes(task.status)) {
      throw new BadRequestException('Esta tarea ya no se puede posponer');
    }

    if (
      (dto.minutes === undefined && !dto.until) ||
      (dto.minutes !== undefined && dto.until)
    ) {
      throw new BadRequestException(
        'Indica minutos o una nueva fecha, pero no ambas opciones',
      );
    }

    const postponedUntil = dto.until
      ? new Date(dto.until)
      : new Date(Date.now() + (dto.minutes ?? 0) * 60_000);

    if (postponedUntil.getTime() <= Date.now()) {
      throw new BadRequestException(
        'La nueva hora debe encontrarse en el futuro',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: {
          id: taskId,
        },
        data: {
          dueAt: postponedUntil,
          postponedUntil,
          status: 'postponed',
          version: {
            increment: 1,
          },
        },
      });

      await tx.taskActivity.create({
        data: {
          taskId,
          actorUserId,
          action: 'postponed',
          fromStatus: task.status,
          toStatus: 'postponed',
          note: dto.note?.trim() || undefined,
          metadata: {
            previousDueAt: task.dueAt?.toISOString() ?? null,
            postponedUntil: postponedUntil.toISOString(),
          },
        },
      });

      return tx.task.findUnique({
        where: {
          id: taskId,
        },
        include: taskInclude,
      });
    });
  }

  async reopen(taskId: string, actorUserId: string) {
    const task = await this.getTask(taskId);
    const role = await this.requireActorAccess(task, actorUserId);

    this.requireEditorRole(role);

    if (task.status !== 'completed' && task.status !== 'cancelled') {
      throw new BadRequestException(
        'Solamente se pueden reabrir tareas terminadas o canceladas',
      );
    }

    const nextStatus = task.userId ? 'assigned' : 'pending';

    return this.prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: {
          id: taskId,
        },
        data: {
          status: nextStatus,
          claimedById: null,
          completedById: null,
          completedAt: null,
          postponedUntil: null,
          version: {
            increment: 1,
          },
        },
      });

      await tx.taskActivity.create({
        data: {
          taskId,
          actorUserId,
          action: 'reopened',
          fromStatus: task.status,
          toStatus: nextStatus,
        },
      });

      return tx.task.findUnique({
        where: {
          id: taskId,
        },
        include: taskInclude,
      });
    });
  }

  private getTodayRange() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    return {
      startOfDay,
      endOfDay,
    };
  }

  private async getTask(taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: {
        id: taskId,
      },
    });

    if (!task) {
      throw new NotFoundException('La tarea no existe');
    }

    return task;
  }

  private async requireActorAccess(
    task: TaskAccessRecord,
    actorUserId: string,
  ) {
    const actor = await this.prisma.user.findUnique({
      where: {
        id: actorUserId,
      },
    });

    if (!actor || actor.status !== 'active') {
      throw new NotFoundException('La persona no está activa en ORION');
    }

    if (task.spaceId) {
      const membership = await this.requireSpaceMembership(
        task.spaceId,
        actorUserId,
      );

      return membership.role;
    }

    if (actor.companyId !== task.companyId) {
      throw new ForbiddenException(
        'La persona no pertenece a la organización de esta tarea',
      );
    }

    return 'member';
  }

  private async requireSpaceMembership(spaceId: string, userId: string) {
    const membership = await this.prisma.spaceMember.findUnique({
      where: {
        spaceId_userId: {
          spaceId,
          userId,
        },
      },
      include: {
        space: {
          select: {
            type: true,
            ownerUserId: true,
          },
        },
      },
    });

    if (!membership || membership.status !== 'active') {
      throw new ForbiddenException(
        'La persona no tiene acceso a este espacio de ORION',
      );
    }

    if (
      membership.space.type === 'personal' &&
      membership.space.ownerUserId !== userId
    ) {
      throw new ForbiddenException(
        'Este espacio personal solamente puede verlo su propietario',
      );
    }

    return membership;
  }

  private requireEditorRole(role: string) {
    if (role === 'viewer') {
      throw new ForbiddenException(
        'El permiso de solo lectura no permite cambiar tareas',
      );
    }
  }
}
