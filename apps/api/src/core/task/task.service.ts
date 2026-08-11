import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';

@Injectable()
export class TaskService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.task.findMany({
      include: {
        company: true,
        user: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findToday() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    return this.prisma.task.findMany({
      where: {
        dueAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
        status: 'pending',
      },
      orderBy: {
        dueAt: 'asc',
      },
    });
  }

  async findTodayByPriority(priority: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    return this.prisma.task.findMany({
      where: {
        dueAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
        status: 'pending',
        priority,
      },
      orderBy: {
        dueAt: 'asc',
      },
    });
  }

  async create(createTaskDto: CreateTaskDto) {
    const company = await this.prisma.company.findUnique({
      where: {
        id: createTaskDto.companyId,
      },
    });

    if (!company) {
      throw new NotFoundException('La empresa no existe');
    }

    if (createTaskDto.userId) {
      const user = await this.prisma.user.findUnique({
        where: {
          id: createTaskDto.userId,
        },
      });

      if (!user) {
        throw new NotFoundException('El usuario no existe');
      }

      if (user.companyId !== createTaskDto.companyId) {
        throw new BadRequestException(
          'El usuario no pertenece a esta empresa',
        );
      }
    }

    return this.prisma.task.create({
      data: {
        title: createTaskDto.title.trim(),
        description: createTaskDto.description?.trim(),
        category: createTaskDto.category?.trim(),
        priority: createTaskDto.priority ?? 'normal',
        dueAt: createTaskDto.dueAt
          ? new Date(createTaskDto.dueAt)
          : undefined,
        companyId: createTaskDto.companyId,
        userId: createTaskDto.userId,
      },
    });
  }

  async complete(taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: {
        id: taskId,
      },
    });

    if (!task) {
      throw new NotFoundException('La tarea no existe');
    }

    if (task.status === 'completed') {
      throw new BadRequestException(
        'La tarea ya fue completada',
      );
    }

    return this.prisma.task.update({
      where: {
        id: taskId,
      },
      data: {
        status: 'completed',
      },
    });
  }
}