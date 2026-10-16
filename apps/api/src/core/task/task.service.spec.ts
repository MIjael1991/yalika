jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import {
  BadRequestException,
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
      prisma,
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

    await expect(service.claim('task-1', 'user-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
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

describe('TaskService agenda', () => {
  it('returns only accessible active tasks inside the requested range', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new TaskService({
      task: { findMany },
    } as unknown as PrismaService);

    await service.findAgenda(
      '2026-09-01T00:00:00.000Z',
      '2026-10-01T00:00:00.000Z',
      'company-1',
      'user-1',
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 'company-1',
          status: { in: expect.arrayContaining(['pending', 'in_progress']) },
          dueAt: {
            gte: new Date('2026-09-01T00:00:00.000Z'),
            lt: new Date('2026-10-01T00:00:00.000Z'),
          },
          OR: expect.any(Array),
        }),
        take: 500,
      }),
    );
  });

  it('rejects inverted or excessively large agenda ranges', async () => {
    const service = new TaskService({
      task: { findMany: jest.fn() },
    } as unknown as PrismaService);

    await expect(
      service.findAgenda(
        '2026-09-10T00:00:00.000Z',
        '2026-09-01T00:00:00.000Z',
        'company-1',
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.findAgenda(
        '2026-01-01T00:00:00.000Z',
        '2026-12-31T00:00:00.000Z',
        'company-1',
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
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
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      task: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn(
        (callback: (client: typeof transaction) => unknown) =>
          callback(transaction),
      ),
    };

    return {
      service: new TaskService(prisma as unknown as PrismaService),
      transaction,
      prisma,
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

  it('does not prepare another occurrence while one remains active', async () => {
    const fixture = createRecurrenceFixture(1);
    fixture.prisma.task.findFirst.mockResolvedValue({ id: 'active-task' });

    await fixture.service.materializeDueRecurrences('space-1');

    expect(
      fixture.transaction.taskRecurrence.updateMany,
    ).not.toHaveBeenCalled();
    expect(fixture.transaction.task.create).not.toHaveBeenCalled();
  });
});

describe('TaskService duplicate checks', () => {
  it('blocks the same active task inside the same space', async () => {
    const prisma = {
      company: {
        findUnique: jest.fn().mockResolvedValue({ id: 'company-1' }),
      },
      space: {
        findUnique: jest.fn().mockResolvedValue({
          companyId: 'company-1',
          status: 'active',
          timezone: 'America/Mexico_City',
        }),
      },
      spaceMember: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'membership-1',
          role: 'member',
          status: 'active',
          space: {
            type: 'family',
            ownerUserId: 'user-1',
          },
        }),
      },
      task: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'task-existing',
            title: 'Comprar leche',
            description: null,
            status: 'pending',
            dueAt: null,
            spaceId: 'space-1',
          },
        ]),
        create: jest.fn(),
      },
    };
    const service = new TaskService(prisma as unknown as PrismaService);

    await expect(
      service.create(
        {
          title: 'Comprar leche',
          spaceId: 'space-1',
        },
        'user-1',
        'company-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('rejects an accidental year 0026 before creating a recurrence', async () => {
    const prisma = {
      company: {
        findUnique: jest.fn().mockResolvedValue({ id: 'company-1' }),
      },
      space: {
        findUnique: jest.fn().mockResolvedValue({
          companyId: 'company-1',
          status: 'active',
          timezone: 'America/Mexico_City',
        }),
      },
      spaceMember: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'membership-1',
          role: 'member',
          status: 'active',
          space: {
            type: 'personal',
            ownerUserId: 'user-1',
          },
        }),
      },
      task: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new TaskService(prisma as unknown as PrismaService);

    await expect(
      service.create(
        {
          title: 'Revisar agenda',
          spaceId: 'space-1',
          dueAt: '0026-08-25T18:00:00.000Z',
          recurrenceFrequency: 'daily',
        },
        'user-1',
        'company-1',
      ),
    ).rejects.toThrow('no es razonable');
  });
});
