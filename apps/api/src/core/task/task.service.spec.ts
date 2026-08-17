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
});
