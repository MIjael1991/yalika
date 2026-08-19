jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../../prisma/prisma.service';
import { ReminderService } from './reminder.service';

describe('ReminderService', () => {
  it('only lists reminders for the authenticated user', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new ReminderService({
      taskReminder: {
        findMany,
      },
    } as unknown as PrismaService);

    await service.findForUser('user-1');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          status: 'scheduled',
        }),
      }),
    );
  });

  it('does not reveal a reminder belonging to another user', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = new ReminderService({
      taskReminder: {
        findFirst,
      },
    } as unknown as PrismaService);

    await expect(
      service.acknowledge('reminder-1', 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'reminder-1',
          userId: 'user-1',
        }),
      }),
    );
  });

  it('records a snooze without changing the task due date', async () => {
    const reminder = {
      id: 'reminder-1',
      taskId: 'task-1',
      userId: 'user-1',
      status: 'scheduled',
      remindAt: new Date('2026-08-18T18:00:00.000Z'),
      task: {
        status: 'pending',
      },
    };
    const transaction = {
      taskReminder: {
        update: jest.fn().mockResolvedValue(reminder),
      },
      taskActivity: {
        create: jest.fn().mockResolvedValue({ id: 'activity-1' }),
      },
    };
    const service = new ReminderService({
      taskReminder: {
        findFirst: jest.fn().mockResolvedValue(reminder),
      },
      $transaction: jest.fn(
        (callback: (client: typeof transaction) => unknown) =>
          callback(transaction),
      ),
    } as unknown as PrismaService);

    await service.snooze('reminder-1', 'user-1', 30);

    expect(transaction.taskReminder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          snoozeCount: {
            increment: 1,
          },
        }),
      }),
    );
    expect(transaction.taskActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          taskId: 'task-1',
          action: 'reminder_snoozed',
        }),
      }),
    );
  });
});
