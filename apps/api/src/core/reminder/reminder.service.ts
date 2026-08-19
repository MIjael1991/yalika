import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

const activeTaskStatuses = [
  'pending',
  'assigned',
  'in_progress',
  'postponed',
];

const reminderInclude = {
  task: {
    select: {
      id: true,
      title: true,
      description: true,
      category: true,
      status: true,
      dueAt: true,
      spaceId: true,
      space: {
        select: {
          id: true,
          name: true,
          type: true,
        },
      },
    },
  },
};

@Injectable()
export class ReminderService {
  constructor(private readonly prisma: PrismaService) {}

  async findForUser(userId: string) {
    const now = new Date();
    const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const reminders = await this.prisma.taskReminder.findMany({
      where: {
        userId,
        status: 'scheduled',
        remindAt: {
          lte: horizon,
        },
        task: {
          status: {
            in: activeTaskStatuses,
          },
          ...this.accessibleTaskScope(userId),
        },
      },
      include: reminderInclude,
      orderBy: {
        remindAt: 'asc',
      },
      take: 100,
    });

    return reminders.map((reminder) => ({
      ...reminder,
      urgency:
        reminder.remindAt.getTime() <= now.getTime() ? 'due' : 'upcoming',
    }));
  }

  async snooze(reminderId: string, actorUserId: string, minutes: number) {
    const reminder = await this.requireOwnedReminder(
      reminderId,
      actorUserId,
    );

    this.requireActiveReminder(reminder);

    const remindAt = new Date(Date.now() + minutes * 60_000);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.taskReminder.update({
        where: {
          id: reminderId,
        },
        data: {
          remindAt,
          status: 'scheduled',
          snoozeCount: {
            increment: 1,
          },
          acknowledgedAt: null,
          cancelledAt: null,
        },
        include: reminderInclude,
      });

      await tx.taskActivity.create({
        data: {
          taskId: reminder.taskId,
          actorUserId,
          action: 'reminder_snoozed',
          note: `Recordatorio pospuesto ${minutes} minutos`,
          metadata: {
            previousRemindAt: reminder.remindAt.toISOString(),
            remindAt: remindAt.toISOString(),
            minutes,
          },
        },
      });

      return {
        ...updated,
        urgency: 'upcoming',
      };
    });
  }

  async acknowledge(reminderId: string, actorUserId: string) {
    const reminder = await this.requireOwnedReminder(
      reminderId,
      actorUserId,
    );

    this.requireActiveReminder(reminder);

    const acknowledgedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.taskReminder.update({
        where: {
          id: reminderId,
        },
        data: {
          status: 'acknowledged',
          acknowledgedAt,
        },
        include: reminderInclude,
      });

      await tx.taskActivity.create({
        data: {
          taskId: reminder.taskId,
          actorUserId,
          action: 'reminder_acknowledged',
          note: 'La persona confirmó que vio el recordatorio',
        },
      });

      return {
        ...updated,
        urgency: 'acknowledged',
      };
    });
  }

  private async requireOwnedReminder(
    reminderId: string,
    actorUserId: string,
  ) {
    const reminder = await this.prisma.taskReminder.findFirst({
      where: {
        id: reminderId,
        userId: actorUserId,
        task: this.accessibleTaskScope(actorUserId),
      },
      include: {
        task: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!reminder) {
      throw new NotFoundException('El recordatorio no existe');
    }

    return reminder;
  }

  private accessibleTaskScope(userId: string) {
    return {
      OR: [
        {
          spaceId: null,
        },
        {
          space: {
            type: 'personal',
            ownerUserId: userId,
          },
        },
        {
          space: {
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
        },
      ],
    };
  }

  private requireActiveReminder(reminder: {
    status: string;
    task: { status: string };
  }) {
    if (reminder.status !== 'scheduled') {
      throw new BadRequestException(
        'Este recordatorio ya fue atendido o cancelado',
      );
    }

    if (!activeTaskStatuses.includes(reminder.task.status)) {
      throw new BadRequestException('La tarea ya no está activa');
    }
  }
}
