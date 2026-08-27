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
  AddTaskNoteDto,
  CompleteTaskDto,
  PostponeTaskDto,
} from './dto/task-action.dto';
import {
  calculateNextOccurrence,
  findLatestOccurrenceAtOrBefore,
  isRecurrenceFrequency,
  type RecurrenceFrequency,
} from './task-recurrence';
import {
  buildTaskDedupeKey,
  normalizeTaskTitle,
  schedulesAreComparable,
  schedulesMatchExactly,
  taskTitleSimilarity,
} from './task-similarity';

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
  recurrence: {
    select: {
      id: true,
      frequency: true,
      interval: true,
      timezone: true,
      status: true,
      startsAt: true,
      nextOccurrenceAt: true,
      endsAt: true,
      reminderMinutesBefore: true,
    },
  },
  reminder: {
    select: {
      id: true,
      leadMinutes: true,
      remindAt: true,
      status: true,
      snoozeCount: true,
      userId: true,
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

type RecurrenceRecord = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  priority: string;
  estimatedMinutes: number | null;
  reminderMinutesBefore: number | null;
  frequency: string;
  interval: number;
  startsAt: Date;
  nextOccurrenceAt: Date;
  endsAt: Date | null;
  companyId: string;
  spaceId: string;
  createdById: string | null;
  userId: string | null;
};

type SimilarTaskCandidate = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueAt: Date | null;
  spaceId: string | null;
};

@Injectable()
export class TaskService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string, actorUserId: string) {
    return this.prisma.task.findMany({
      where: {
        companyId,
        ...this.accessibleTaskScope(actorUserId),
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

  async findToday(companyId: string, actorUserId: string) {
    const { startOfDay, endOfDay } = this.getTodayRange();

    return this.prisma.task.findMany({
      where: {
        companyId,
        ...this.accessibleTaskScope(actorUserId),
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

  async findTodayByPriority(
    priority: string,
    companyId: string,
    actorUserId: string,
  ) {
    const { startOfDay, endOfDay } = this.getTodayRange();

    return this.prisma.task.findMany({
      where: {
        companyId,
        ...this.accessibleTaskScope(actorUserId),
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
    await this.materializeDueRecurrences(spaceId);

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

    let taskSpace: { companyId: string; status: string; timezone: string } | null =
      null;

    if (dto.spaceId) {
      taskSpace = await this.prisma.space.findUnique({
        where: {
          id: dto.spaceId,
        },
        select: {
          companyId: true,
          status: true,
          timezone: true,
        },
      });

      if (!taskSpace || taskSpace.status !== 'active') {
        throw new NotFoundException('El espacio no existe o está archivado');
      }

      if (taskSpace.companyId !== companyId) {
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

    const recurrenceFrequency = dto.recurrenceFrequency;

    if (recurrenceFrequency && !isRecurrenceFrequency(recurrenceFrequency)) {
      throw new BadRequestException('La frecuencia de repetición no es válida');
    }

    if (recurrenceFrequency && (!dto.spaceId || !taskSpace)) {
      throw new BadRequestException(
        'Las tareas recurrentes deben pertenecer a un espacio de ORION Life',
      );
    }

    if (recurrenceFrequency && !dto.dueAt) {
      throw new BadRequestException(
        'Indica la primera fecha y hora de la tarea recurrente',
      );
    }

    const dueAt = dto.dueAt ? new Date(dto.dueAt) : undefined;
    const recurrenceEndsAt = dto.recurrenceEndsAt
      ? new Date(dto.recurrenceEndsAt)
      : undefined;

    if (dueAt) {
      this.assertReasonableDate(dueAt, 'La fecha de la tarea');
    }

    if (recurrenceEndsAt) {
      this.assertReasonableDate(
        recurrenceEndsAt,
        'La fecha final de repetición',
      );
    }

    if (
      recurrenceFrequency &&
      dueAt &&
      dueAt.getTime() < Date.now() - 24 * 60 * 60_000
    ) {
      throw new BadRequestException(
        'La primera repetición no puede comenzar en una fecha pasada. Revisa especialmente el año.',
      );
    }

    if (dto.reminderMinutesBefore !== undefined && !dueAt) {
      throw new BadRequestException(
        'Indica la fecha y hora para poder crear un recordatorio',
      );
    }

    const reminderRecipientId = dto.userId ?? actorUserId;
    const reminder =
      dueAt && dto.reminderMinutesBefore !== undefined
        ? this.buildReminderCreate(
            dueAt,
            dto.reminderMinutesBefore,
            reminderRecipientId,
          )
        : undefined;

    if (
      recurrenceFrequency &&
      dueAt &&
      recurrenceEndsAt &&
      recurrenceEndsAt.getTime() < dueAt.getTime()
    ) {
      throw new BadRequestException(
        'La repetición no puede terminar antes de la primera tarea',
      );
    }

    const duplicateContext = {
      companyId,
      actorUserId,
      spaceId: dto.spaceId ?? null,
      title: dto.title,
      dueAt: dueAt ?? null,
      allowSimilar: dto.allowSimilar ?? false,
    };

    await this.assertNoDuplicate(duplicateContext);

    const dedupeKey = buildTaskDedupeKey({
      companyId,
      actorUserId,
      spaceId: dto.spaceId ?? null,
      title: dto.title,
      dueAt: dueAt ?? null,
    });

    if (recurrenceFrequency && dueAt && dto.spaceId && taskSpace) {
      const interval = dto.recurrenceInterval ?? 1;
      const recurrenceSpaceId = dto.spaceId;
      const recurrenceTimezone = taskSpace.timezone;
      const nextOccurrenceAt = calculateNextOccurrence(
        dueAt,
        dueAt,
        recurrenceFrequency as RecurrenceFrequency,
        interval,
      );

      return this.createWithDuplicateProtection(
        () =>
          this.prisma.$transaction(async (tx) => {
            const recurrence = await tx.taskRecurrence.create({
              data: {
                title: dto.title.trim(),
                description: dto.description?.trim() || undefined,
                category: dto.category?.trim() || undefined,
                priority: dto.priority ?? 'normal',
                estimatedMinutes: dto.estimatedMinutes,
                reminderMinutesBefore: dto.reminderMinutesBefore,
                frequency: recurrenceFrequency,
                interval,
                timezone: recurrenceTimezone,
                status:
                  recurrenceEndsAt &&
                  nextOccurrenceAt.getTime() > recurrenceEndsAt.getTime()
                    ? 'finished'
                    : 'active',
                startsAt: dueAt,
                nextOccurrenceAt,
                endsAt: recurrenceEndsAt,
                companyId,
                spaceId: recurrenceSpaceId,
                createdById: actorUserId,
                userId: dto.userId,
              },
            });

            return tx.task.create({
              data: {
                title: dto.title.trim(),
                description: dto.description?.trim() || undefined,
                category: dto.category?.trim() || undefined,
                priority: dto.priority ?? 'normal',
                status: dto.userId ? 'assigned' : 'pending',
                dueAt,
                estimatedMinutes: dto.estimatedMinutes,
                dedupeKey,
                companyId,
                userId: dto.userId,
                spaceId: recurrenceSpaceId,
                createdById: actorUserId,
                recurrenceId: recurrence.id,
                recurrenceOccurrenceAt: dueAt,
                reminder,
                activities: {
                  create: {
                    action: 'created',
                    toStatus: dto.userId ? 'assigned' : 'pending',
                    actorUserId,
                    metadata: {
                      recurring: true,
                      frequency: recurrenceFrequency,
                      interval,
                    },
                  },
                },
              },
              include: taskInclude,
            });
          }),
        duplicateContext,
      );
    }

    return this.createWithDuplicateProtection(
      () =>
        this.prisma.task.create({
          data: {
            title: dto.title.trim(),
            description: dto.description?.trim() || undefined,
            category: dto.category?.trim() || undefined,
            priority: dto.priority ?? 'normal',
            status: dto.userId ? 'assigned' : 'pending',
            dueAt,
            estimatedMinutes: dto.estimatedMinutes,
            dedupeKey,
            companyId,
            userId: dto.userId,
            spaceId: dto.spaceId,
            createdById: actorUserId,
            reminder,
            activities: {
              create: {
                action: 'created',
                toStatus: dto.userId ? 'assigned' : 'pending',
                actorUserId,
              },
            },
          },
          include: taskInclude,
        }),
      duplicateContext,
    );
  }

  async materializeDueRecurrences(spaceId: string) {
    const now = new Date();
    const horizon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const recurrences = await this.prisma.taskRecurrence.findMany({
      where: {
        spaceId,
        status: 'active',
        nextOccurrenceAt: {
          lte: horizon,
        },
      },
      orderBy: {
        nextOccurrenceAt: 'asc',
      },
      take: 100,
    });

    for (const recurrence of recurrences) {
      await this.materializeRecurrence(recurrence, now, horizon);
    }
  }

  async cancelRecurrence(taskId: string, actorUserId: string) {
    const task = await this.getTask(taskId);
    const role = await this.requireActorAccess(task, actorUserId);

    this.requireEditorRole(role);

    if (!task.recurrenceId) {
      throw new BadRequestException('Esta tarea no forma parte de una serie');
    }

    return this.prisma.$transaction(async (tx) => {
      const update = await tx.taskRecurrence.updateMany({
        where: {
          id: task.recurrenceId as string,
          status: 'active',
        },
        data: {
          status: 'cancelled',
        },
      });

      if (update.count === 1) {
        const futureTasks = await tx.task.findMany({
          where: {
            recurrenceId: task.recurrenceId,
            recurrenceOccurrenceAt: {
              gt: task.recurrenceOccurrenceAt ?? task.dueAt ?? new Date(),
            },
            status: {
              in: activeStatuses,
            },
          },
          select: {
            id: true,
            status: true,
          },
        });

        if (futureTasks.length > 0) {
          await tx.task.updateMany({
            where: {
              id: {
                in: futureTasks.map((futureTask) => futureTask.id),
              },
            },
            data: {
              status: 'cancelled',
              version: {
                increment: 1,
              },
            },
          });

          await tx.taskActivity.createMany({
            data: futureTasks.map((futureTask) => ({
              taskId: futureTask.id,
              actorUserId,
              action: 'cancelled_with_recurrence',
              fromStatus: futureTask.status,
              toStatus: 'cancelled',
              note: 'Se canceló porque la serie dejó de repetirse',
            })),
          });

          await tx.taskReminder.updateMany({
            where: {
              taskId: {
                in: futureTasks.map((futureTask) => futureTask.id),
              },
              status: 'scheduled',
            },
            data: {
              status: 'cancelled',
              cancelledAt: new Date(),
            },
          });
        }

        await tx.taskActivity.create({
          data: {
            taskId,
            actorUserId,
            action: 'recurrence_cancelled',
            note: 'Se detuvieron las siguientes repeticiones',
            metadata: {
              futureTasksCancelled: futureTasks.length,
            },
          },
        });
      }

      return tx.task.findUnique({
        where: {
          id: taskId,
        },
        include: taskInclude,
      });
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

      await tx.taskReminder.updateMany({
        where: {
          taskId,
          status: 'scheduled',
        },
        data: {
          userId: actorUserId,
        },
      });

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
          dedupeKey: null,
          completedAt: new Date(),
          completedById: actorUserId,
          version: {
            increment: 1,
          },
        },
      });

      await tx.taskReminder.updateMany({
        where: {
          taskId,
          status: 'scheduled',
        },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
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

      if (task.reminder) {
        const remindAt = new Date(
          postponedUntil.getTime() -
            task.reminder.leadMinutes * 60_000,
        );

        await tx.taskReminder.update({
          where: {
            taskId,
          },
          data: {
            remindAt,
            status: 'scheduled',
            acknowledgedAt: null,
            cancelledAt: null,
          },
        });
      }

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
    await this.assertNoDuplicate({
      companyId: task.companyId,
      actorUserId,
      spaceId: task.spaceId,
      title: task.title,
      dueAt: task.dueAt,
      allowSimilar: true,
      excludeTaskId: task.id,
    });
    const dedupeKey = buildTaskDedupeKey({
      companyId: task.companyId,
      actorUserId: task.createdById ?? actorUserId,
      spaceId: task.spaceId,
      title: task.title,
      dueAt: task.dueAt,
    });

    return this.prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: {
          id: taskId,
        },
        data: {
          status: nextStatus,
          dedupeKey,
          claimedById: null,
          completedById: null,
          completedAt: null,
          postponedUntil: null,
          version: {
            increment: 1,
          },
        },
      });

      if (task.reminder && task.dueAt) {
        const remindAt = new Date(
          task.dueAt.getTime() - task.reminder.leadMinutes * 60_000,
        );

        await tx.taskReminder.update({
          where: {
            taskId,
          },
          data: {
            remindAt,
            status: 'scheduled',
            acknowledgedAt: null,
            cancelledAt: null,
          },
        });
      }

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

  async cancel(taskId: string, actorUserId: string) {
    const task = await this.getTask(taskId);
    const role = await this.requireActorAccess(task, actorUserId);

    this.requireEditorRole(role);

    if (!activeStatuses.includes(task.status)) {
      throw new BadRequestException('Esta tarea ya no se puede cancelar');
    }

    if (
      task.claimedById &&
      task.claimedById !== actorUserId &&
      !['owner', 'admin'].includes(role)
    ) {
      throw new ForbiddenException(
        'Otra persona está realizando esta tarea. No se canceló en silencio.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: {
          id: taskId,
        },
        data: {
          status: 'cancelled',
          dedupeKey: null,
          claimedById: null,
          version: {
            increment: 1,
          },
        },
      });

      await tx.taskReminder.updateMany({
        where: {
          taskId,
          status: 'scheduled',
        },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
        },
      });

      await tx.taskActivity.create({
        data: {
          taskId,
          actorUserId,
          action: 'cancelled',
          fromStatus: task.status,
          toStatus: 'cancelled',
          note: 'La tarea puede restaurarse desde el historial',
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

  async addNote(
    taskId: string,
    actorUserId: string,
    dto: AddTaskNoteDto,
  ) {
    const task = await this.getTask(taskId);
    const role = await this.requireActorAccess(task, actorUserId);

    this.requireEditorRole(role);

    await this.prisma.taskActivity.create({
      data: {
        taskId,
        actorUserId,
        action: 'note_added',
        note: dto.note.trim(),
      },
    });

    return this.prisma.task.findUnique({
      where: {
        id: taskId,
      },
      include: taskInclude,
    });
  }

  private async materializeRecurrence(
    recurrence: RecurrenceRecord,
    now: Date,
    horizon: Date,
  ) {
    if (!isRecurrenceFrequency(recurrence.frequency)) {
      return;
    }

    if (
      !this.isReasonableDate(recurrence.startsAt) ||
      !this.isReasonableDate(recurrence.nextOccurrenceAt) ||
      (recurrence.endsAt && !this.isReasonableDate(recurrence.endsAt))
    ) {
      await this.prisma.taskRecurrence.updateMany({
        where: {
          id: recurrence.id,
          status: 'active',
        },
        data: {
          status: 'cancelled',
        },
      });
      return;
    }

    const activeOccurrence = await this.prisma.task.findFirst({
      where: {
        recurrenceId: recurrence.id,
        status: {
          in: activeStatuses,
        },
      },
      select: {
        id: true,
      },
    });

    if (activeOccurrence) {
      return;
    }

    const expectedNext = recurrence.nextOccurrenceAt;

    if (
      recurrence.endsAt &&
      expectedNext.getTime() > recurrence.endsAt.getTime()
    ) {
      await this.prisma.taskRecurrence.updateMany({
        where: {
          id: recurrence.id,
          status: 'active',
          nextOccurrenceAt: expectedNext,
        },
        data: {
          status: 'finished',
        },
      });
      return;
    }

    if (expectedNext.getTime() < now.getTime()) {
      const overdue = findLatestOccurrenceAtOrBefore(
        expectedNext,
        recurrence.startsAt,
        recurrence.frequency,
        recurrence.interval,
        now,
      );

      if (
        recurrence.endsAt &&
        overdue.occurrenceAt.getTime() > recurrence.endsAt.getTime()
      ) {
        await this.prisma.taskRecurrence.updateMany({
          where: {
            id: recurrence.id,
            status: 'active',
          },
          data: {
            status: 'finished',
          },
        });
        return;
      }

      const created = await this.materializeOccurrence(
        recurrence,
        expectedNext,
        overdue.occurrenceAt,
        overdue.nextOccurrenceAt,
        overdue.skippedOccurrences,
      );

      if (!created) {
        return;
      }

      return;
    }

    if (expectedNext.getTime() > horizon.getTime()) {
      return;
    }

    if (
      recurrence.endsAt &&
      expectedNext.getTime() > recurrence.endsAt.getTime()
    ) {
      await this.prisma.taskRecurrence.updateMany({
        where: {
          id: recurrence.id,
          status: 'active',
          nextOccurrenceAt: expectedNext,
        },
        data: {
          status: 'finished',
        },
      });
      return;
    }

    const nextOccurrenceAt = calculateNextOccurrence(
      expectedNext,
      recurrence.startsAt,
      recurrence.frequency,
      recurrence.interval,
    );
    await this.materializeOccurrence(
      recurrence,
      expectedNext,
      expectedNext,
      nextOccurrenceAt,
      0,
    );
  }

  private async materializeOccurrence(
    recurrence: RecurrenceRecord,
    expectedNext: Date,
    occurrenceAt: Date,
    nextOccurrenceAt: Date,
    skippedOccurrences: number,
  ) {
    const nextStatus =
      recurrence.endsAt &&
      nextOccurrenceAt.getTime() > recurrence.endsAt.getTime()
        ? 'finished'
        : 'active';
    const reminderRecipientId =
      recurrence.userId ?? recurrence.createdById;
    const reminder =
      recurrence.reminderMinutesBefore !== null && reminderRecipientId
        ? this.buildReminderCreate(
            occurrenceAt,
            recurrence.reminderMinutesBefore,
            reminderRecipientId,
          )
        : undefined;

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.taskRecurrence.updateMany({
        where: {
          id: recurrence.id,
          status: 'active',
          nextOccurrenceAt: expectedNext,
        },
        data: {
          nextOccurrenceAt,
          status: nextStatus,
        },
      });

      if (claimed.count !== 1) {
        return false;
      }

      await tx.task.create({
        data: {
          title: recurrence.title,
          description: recurrence.description,
          category: recurrence.category,
          priority: recurrence.priority,
          status: recurrence.userId ? 'assigned' : 'pending',
          dueAt: occurrenceAt,
          estimatedMinutes: recurrence.estimatedMinutes,
          companyId: recurrence.companyId,
          userId: recurrence.userId,
          spaceId: recurrence.spaceId,
          createdById: recurrence.createdById,
          recurrenceId: recurrence.id,
          recurrenceOccurrenceAt: occurrenceAt,
          reminder,
          activities: {
            create: {
              action: 'recurrence_generated',
              toStatus: recurrence.userId ? 'assigned' : 'pending',
              metadata: {
                scheduledFor: occurrenceAt.toISOString(),
                skippedOccurrences,
              },
            },
          },
        },
      });

      return true;
    });
  }

  private buildReminderCreate(
    dueAt: Date,
    leadMinutes: number,
    userId: string,
  ) {
    const remindAt = new Date(dueAt.getTime() - leadMinutes * 60_000);

    return {
      create: {
        leadMinutes,
        remindAt,
        originalRemindAt: remindAt,
        userId,
      },
    };
  }

  private async assertNoDuplicate(input: {
    companyId: string;
    actorUserId: string;
    spaceId: string | null;
    title: string;
    dueAt: Date | null;
    allowSimilar: boolean;
    excludeTaskId?: string;
  }) {
    const candidates = await this.prisma.task.findMany({
      where: {
        companyId: input.companyId,
        spaceId: input.spaceId,
        ...(input.spaceId
          ? {}
          : {
              createdById: input.actorUserId,
            }),
        ...(input.excludeTaskId
          ? {
              id: {
                not: input.excludeTaskId,
              },
            }
          : {}),
        status: {
          in: activeStatuses,
        },
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        dueAt: true,
        spaceId: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 80,
    });
    const normalizedTitle = normalizeTaskTitle(input.title);
    const ranked = candidates
      .map((candidate: SimilarTaskCandidate) => ({
        ...candidate,
        similarity: taskTitleSimilarity(input.title, candidate.title),
        exact:
          normalizedTitle === normalizeTaskTitle(candidate.title) &&
          schedulesMatchExactly(input.dueAt, candidate.dueAt),
      }))
      .filter(
        (candidate) =>
          candidate.exact ||
          (candidate.similarity >= 0.7 &&
            schedulesAreComparable(input.dueAt, candidate.dueAt)),
      )
      .sort((left, right) => right.similarity - left.similarity)
      .slice(0, 3);
    const exact = ranked.filter((candidate) => candidate.exact);

    if (exact.length > 0) {
      throw new ConflictException({
        code: 'DUPLICATE_TASK',
        message:
          'Esta tarea ya existe en este espacio y con el mismo horario.',
        similarTasks: exact,
      });
    }

    if (!input.allowSimilar && ranked.length > 0) {
      throw new ConflictException({
        code: 'SIMILAR_TASK_EXISTS',
        message:
          'Ya hay una tarea parecida en este espacio. Puedes conservarla, agregarle un dato o crear otra de todos modos.',
        similarTasks: ranked,
      });
    }
  }

  private async createWithDuplicateProtection<T>(
    create: () => Promise<T>,
    context: {
      companyId: string;
      actorUserId: string;
      spaceId: string | null;
      title: string;
      dueAt: Date | null;
      allowSimilar: boolean;
    },
  ) {
    try {
      return await create();
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        await this.assertNoDuplicate({
          ...context,
          allowSimilar: false,
        });
        throw new ConflictException(
          'La tarea ya fue creada desde otra ventana. Actualiza la lista.',
        );
      }

      throw error;
    }
  }

  private isUniqueConstraintError(error: unknown) {
    const candidate = error as { code?: unknown } | null;
    return candidate?.code === 'P2002';
  }

  private assertReasonableDate(value: Date, label: string) {
    if (!this.isReasonableDate(value)) {
      throw new BadRequestException(
        `${label} no es razonable. Usa un año entre 2000 y ${
          new Date().getUTCFullYear() + 50
        }.`,
      );
    }
  }

  private isReasonableDate(value: Date) {
    const year = value.getUTCFullYear();
    return (
      !Number.isNaN(value.getTime()) &&
      year >= 2000 &&
      year <= new Date().getUTCFullYear() + 50
    );
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

  private accessibleTaskScope(actorUserId: string) {
    return {
      OR: [
        {
          spaceId: null,
        },
        {
          space: {
            type: 'personal',
            ownerUserId: actorUserId,
          },
        },
        {
          space: {
            type: {
              not: 'personal',
            },
            members: {
              some: {
                userId: actorUserId,
                status: 'active',
              },
            },
          },
        },
      ],
    };
  }

  private async getTask(taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: {
        id: taskId,
      },
      include: {
        reminder: true,
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
