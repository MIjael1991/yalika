jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import type { PrismaService } from '../../prisma/prisma.service';
import { BriefingService } from './briefing.service';

describe('BriefingService', () => {
  it('combines visible tasks, reminders, inventory and sales safely', async () => {
    const taskFindMany = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'task-1',
          title: 'Junta de padres',
          dueAt: new Date(),
          space: { id: 'space-1', name: 'Escuela', type: 'school' },
        },
      ])
      .mockResolvedValueOnce([]);
    const service = new BriefingService(
      {
        space: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        task: {
          findMany: taskFindMany,
          count: jest
            .fn()
            .mockResolvedValueOnce(1)
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce(2),
        },
        taskReminder: {
          count: jest.fn().mockResolvedValue(1),
        },
        product: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'product-1',
              name: 'Pan',
              stock: 2,
              lowStockAt: 5,
              variants: [],
            },
          ]),
        },
        order: {
          aggregate: jest
            .fn()
            .mockResolvedValueOnce({ _sum: { total: 80 }, _count: { id: 2 } })
            .mockResolvedValueOnce({ _sum: { total: 100 }, _count: { id: 3 } }),
        },
      } as unknown as PrismaService,
      {
        materializeDueRecurrences: jest.fn(),
      } as unknown as import('../task/task.service').TaskService,
    );

    const result = await service.findToday('company-1', 'user-1', 'Christian');

    expect(result.today.count).toBe(1);
    expect(result.tomorrowCount).toBe(2);
    expect(result.business.lowStockProducts[0]).toEqual(
      expect.objectContaining({ name: 'Pan', available: 2 }),
    );
    expect(result.business.salesChangePercent).toBe(-20);
    expect(result.suggestions.map((suggestion) => suggestion.id)).toEqual([
      'due-reminders',
      'low-stock',
      'sales-down',
    ]);
    expect(taskFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 'company-1',
          OR: expect.any(Array),
        }),
      }),
    );
  });

  it('uses variant inventory instead of the product total', async () => {
    const service = new BriefingService(
      {
        space: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        task: {
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
        },
        taskReminder: {
          count: jest.fn().mockResolvedValue(0),
        },
        product: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'product-1',
              name: 'Vestido',
              stock: 99,
              lowStockAt: 3,
              variants: [{ stock: 1 }, { stock: 1 }],
            },
          ]),
        },
        order: {
          aggregate: jest.fn().mockResolvedValue({
            _sum: { total: null },
            _count: { id: 0 },
          }),
        },
      } as unknown as PrismaService,
      {
        materializeDueRecurrences: jest.fn(),
      } as unknown as import('../task/task.service').TaskService,
    );

    const result = await service.findToday('company-1', 'user-1', 'Mijael');

    expect(result.business.lowStockProducts[0].available).toBe(2);
    expect(result.suggestions.some((item) => item.id === 'low-stock')).toBe(
      true,
    );
  });
});
