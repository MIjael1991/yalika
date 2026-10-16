import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getToday(companyId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const tasks = await this.prisma.task.findMany({
      where: {
        companyId,
        dueAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      orderBy: {
        dueAt: 'asc',
      },
    });

    const urgent = tasks.filter(
      (task) =>
        task.status === 'pending' && task.priority.toLowerCase() === 'urgente',
    );

    const high = tasks.filter(
      (task) =>
        task.status === 'pending' && task.priority.toLowerCase() === 'alta',
    );

    const normal = tasks.filter(
      (task) =>
        task.status === 'pending' && task.priority.toLowerCase() === 'normal',
    );

    const completed = tasks.filter((task) => task.status === 'completed');

    return {
      date: new Date().toISOString(),
      summary: {
        total: tasks.length,
        urgent: urgent.length,
        high: high.length,
        normal: normal.length,
        completed: completed.length,
      },
      urgent,
      high,
      normal,
      completed,
    };
  }
}
