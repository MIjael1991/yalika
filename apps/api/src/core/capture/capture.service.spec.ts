jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { ForbiddenException } from '@nestjs/common';

import type { PrismaService } from '../../prisma/prisma.service';
import { CaptureService } from './capture.service';

describe('CaptureService privacy', () => {
  const spaces = [
    {
      id: 'space-personal',
      name: 'Mi vida',
      type: 'personal',
    },
  ];

  it('only learns from tasks created by the authenticated user', async () => {
    const taskFindMany = jest.fn().mockResolvedValue([]);
    const service = new CaptureService({
      space: {
        findMany: jest.fn().mockResolvedValue(spaces),
      },
      task: {
        findMany: taskFindMany,
      },
    } as unknown as PrismaService);

    await service.interpret(
      {
        message: 'Llamar mañana',
        activeSpaceId: 'space-personal',
      },
      'user-1',
      'company-1',
    );

    expect(taskFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 'company-1',
          createdById: 'user-1',
        }),
      }),
    );
  });

  it('rejects an active space that is not visible to the session', async () => {
    const taskFindMany = jest.fn();
    const service = new CaptureService({
      space: {
        findMany: jest.fn().mockResolvedValue(spaces),
      },
      task: {
        findMany: taskFindMany,
      },
    } as unknown as PrismaService);

    await expect(
      service.interpret(
        {
          message: 'Comprar algo',
          activeSpaceId: 'space-hidden',
        },
        'user-1',
        'company-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(taskFindMany).not.toHaveBeenCalled();
  });

  it('proposes cancelling the referenced task instead of creating another one', async () => {
    const taskFindMany = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'task-server',
          title: 'Apagar el servidor',
          status: 'pending',
          dueAt: new Date('2026-08-27T16:00:00.000Z'),
          spaceId: 'space-personal',
          recurrenceId: null,
          space: {
            id: 'space-personal',
            name: 'Mi vida',
            type: 'personal',
          },
        },
      ]);
    const service = new CaptureService({
      space: {
        findMany: jest.fn().mockResolvedValue(spaces),
      },
      task: {
        findMany: taskFindMany,
      },
    } as unknown as PrismaService);

    const result = await service.interpret(
      {
        message: 'Quiero que elimines la tarea de apagar el servidor',
        activeSpaceId: 'space-personal',
      },
      'user-1',
      'company-1',
    );

    expect(result.intent).toBe('cancel');
    expect(result.actionProposal).toMatchObject({
      intent: 'cancel',
      recommendedTaskId: 'task-server',
      matches: [
        expect.objectContaining({
          id: 'task-server',
          title: 'Apagar el servidor',
        }),
      ],
    });
  });
});
