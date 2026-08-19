jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import {
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

import type { PrismaService } from '../../prisma/prisma.service';
import { TaskService } from './task.service';

describe('TaskService shared work', () => {
  function createFixture(
    updateCount: number,
    space: { type: string; ownerUserId: string } = {
      type: 'family',
      ownerUserId: 'user-1',
    },
  ) {
    const task = {
      id: 'task-1',
      title: 'Comprar despensa',
      status: 'pending',
      companyId: 'company-1',
      spaceId: 'space-1',
      userId: null,
      claimedById: null,
      dueAt: null,
    };
    const updatedTask = {
      ...task,
      status: 'in_progress',
      userId: 'user-1',
      claimedById: 'user-1',
    };
    const transaction = {
      task: {
        updateMany: jest.fn().mockResolvedValue({ count: updateCount }),
        findUnique: jest.fn().mockResolvedValue(updatedTask),
      },
      taskActivity: {
        create: jest.fn().mockResolvedValue({ id: 'activity-1' }),
      },
      taskReminder: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const prisma = {
      task: {
        findUnique: jest.fn().mockResolvedValue(task),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          companyId: 'company-1',
          status: 'active',
        }),
      },
      spaceMember: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'membership-1',
          role: 'member',
          status: 'active',
          space,
        }),
      },
      $transaction: jest.fn(
        (callback: (client: typeof transaction) => unknown) =>
          callback(transaction),
      ),
    };

    return {
      service: new TaskService(prisma as unknown as PrismaService),
      transaction,
    };
  }

  it('lets one member claim an available shared task', async () => {
    const { service, transaction } = createFixture(1);

    const result = await service.claim('task-1', 'user-1');

    expect(result?.status).toBe('in_progress');
    expect(transaction.task.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          claimedById: null,
        }),
      }),
    );
    expect(transaction.taskReminder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          taskId: 'task-1',
          status: 'scheduled',
        }),
        data: {
          userId: 'user-1',
        },
      }),
    );
    expect(transaction.taskActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'claimed',
          actorUserId: 'user-1',
        }),
      }),
    );
  });

  it('prevents a duplicated claim when another person won the race', async () => {
    const { service, transaction } = createFixture(0);

    await expect(
      service.claim('task-1', 'user-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.taskActivity.create).not.toHaveBeenCalled();
  });

  it('keeps a personal space private even if an old membership exists', async () => {
    const { service, transaction } = createFixture(1, {
      type: 'personal',
      ownerUserId: 'another-user',
    });

    await expect(service.claim('task-1', 'user-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(transaction.task.updateMany).not.toHaveBeenCalled();
  });

  it('scopes legacy task lists to spaces visible to the session user', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new TaskService({
      task: {
        findMany,
      },
    } as unknown as PrismaService);

    await service.findAll('company-1', 'user-1');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 'company-1',
          OR: expect.arrayContaining([
            expect.objectContaining({
              space: expect.objectContaining({
                type: 'personal',
                ownerUserId: 'user-1',
              }),
            }),
          ]),
        }),
      }),
    );
  });
});

describe('TaskService recurring work', () => {
  function createRecurrenceFixture(updateCount: number) {
    const startsAt = new Date(Date.now() + 60 * 60 * 1000);
    const recurrence = {
      id: 'recurrence-1',
      title: 'Pagar la luz',
      description: null,
      category: 'payment',
      priority: 'normal',
      estimatedMinutes: 15,
      reminderMinutesBefore: null,
      frequency: 'monthly',
      interval: 1,
      startsAt,
      nextOccurrenceAt: startsAt,
      endsAt: null,
      companyId: 'company-1',
      spaceId: 'space-1',
      createdById: 'user-1',
      userId: null,
    };
    const transaction = {
      taskRecurrence: {
        updateMany: jest.fn().mockResolvedValue({ count: updateCount }),
      },
      task: {
        create: jest.fn().mockResolvedValue({ id: 'task-recurring-1' }),
      },
    };
    const prisma = {
      taskRecurrence: {
        findMany: jest.fn().mockResolvedValue([recurrence]),
      },
      $transaction: jest.fn(
        (callback: (client: typeof transaction) => unknown) =>
          callback(transaction),
      ),
    };

    return {
      service: new TaskService(prisma as unknown as PrismaService),
      transaction,
    };
  }

  it('creates one protected occurrence when it wins the schedule advance', async () => {
    const { service, transaction } = createRecurrenceFixture(1);

    await service.materializeDueRecurrences('space-1');

    expect(transaction.taskRecurrence.updateMany).toHaveBeenCalledTimes(1);
    expect(transaction.task.create).toHaveBeenCalledTimes(1);
    expect(transaction.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recurrenceId: 'recurrence-1',
          title: 'Pagar la luz',
        }),
      }),
    );
  });

  it('does not duplicate an occurrence when another refresh advanced it', async () => {
    const { service, transaction } = createRecurrenceFixture(0);

    await service.materializeDueRecurrences('space-1');

    expect(transaction.task.create).not.toHaveBeenCalled();
  });
});
