import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { TaskService } from '../task/task.service';

const activeTaskStatuses = ['pending', 'assigned', 'in_progress', 'postponed'];

function dayRange(offset: number) {
  const start = new Date();
  start.setDate(start.getDate() + offset);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function greetingFor(date: Date) {
  const hour = date.getHours();

  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

@Injectable()
export class BriefingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taskService: TaskService,
  ) {}

  async findToday(companyId: string, actorUserId: string, userName: string) {
    const now = new Date();
    const today = dayRange(0);
    const tomorrow = dayRange(1);
    const yesterday = dayRange(-1);
    const previousDay = dayRange(-2);
    const accessibleTasks = this.accessibleTaskScope(actorUserId);
    const accessibleSpaces = await this.prisma.space.findMany({
      where: {
        companyId,
        status: 'active',
        OR: [
          { type: 'personal', ownerUserId: actorUserId },
          {
            type: { not: 'personal' },
            members: { some: { userId: actorUserId, status: 'active' } },
          },
        ],
      },
      select: { id: true },
    });

    await Promise.all(
      accessibleSpaces.map((space) =>
        this.taskService.materializeDueRecurrences(space.id),
      ),
    );

    const [
      todayTasks,
      todayTaskCount,
      overdueTasks,
      overdueTaskCount,
      tomorrowCount,
      dueReminderCount,
      products,
      yesterdaySales,
      previousSales,
    ] = await Promise.all([
      this.prisma.task.findMany({
        where: {
          companyId,
          ...accessibleTasks,
          status: { in: activeTaskStatuses },
          dueAt: { gte: today.start, lte: today.end },
        },
        select: {
          id: true,
          title: true,
          category: true,
          priority: true,
          status: true,
          dueAt: true,
          space: {
            select: { id: true, name: true, type: true },
          },
        },
        orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }],
        take: 12,
      }),
      this.prisma.task.count({
        where: {
          companyId,
          ...accessibleTasks,
          status: { in: activeTaskStatuses },
          dueAt: { gte: today.start, lte: today.end },
        },
      }),
      this.prisma.task.findMany({
        where: {
          companyId,
          ...accessibleTasks,
          status: { in: activeTaskStatuses },
          dueAt: { lt: today.start },
        },
        select: {
          id: true,
          title: true,
          category: true,
          priority: true,
          status: true,
          dueAt: true,
          space: {
            select: { id: true, name: true, type: true },
          },
        },
        orderBy: { dueAt: 'asc' },
        take: 5,
      }),
      this.prisma.task.count({
        where: {
          companyId,
          ...accessibleTasks,
          status: { in: activeTaskStatuses },
          dueAt: { lt: today.start },
        },
      }),
      this.prisma.task.count({
        where: {
          companyId,
          ...accessibleTasks,
          status: { in: activeTaskStatuses },
          dueAt: { gte: tomorrow.start, lte: tomorrow.end },
        },
      }),
      this.prisma.taskReminder.count({
        where: {
          userId: actorUserId,
          status: 'scheduled',
          remindAt: { lte: now },
          task: {
            companyId,
            status: { in: activeTaskStatuses },
            ...accessibleTasks,
          },
        },
      }),
      this.prisma.product.findMany({
        where: {
          companyId,
          status: 'active',
          trackInventory: true,
        },
        select: {
          id: true,
          name: true,
          stock: true,
          lowStockAt: true,
          variants: {
            where: { status: 'active' },
            select: { stock: true },
          },
        },
      }),
      this.prisma.order.aggregate({
        where: {
          companyId,
          paymentStatus: 'paid',
          createdAt: { gte: yesterday.start, lte: yesterday.end },
        },
        _sum: { total: true },
        _count: { id: true },
      }),
      this.prisma.order.aggregate({
        where: {
          companyId,
          paymentStatus: 'paid',
          createdAt: { gte: previousDay.start, lte: previousDay.end },
        },
        _sum: { total: true },
        _count: { id: true },
      }),
    ]);

    const lowStockProducts = products
      .map((product) => ({
        id: product.id,
        name: product.name,
        available:
          product.variants.length > 0
            ? product.variants.reduce(
                (total, variant) => total + variant.stock,
                0,
              )
            : product.stock,
        lowStockAt: product.lowStockAt,
      }))
      .filter((product) => product.available <= product.lowStockAt)
      .sort((left, right) => left.available - right.available)
      .slice(0, 6);
    const yesterdayTotal = yesterdaySales._sum.total ?? 0;
    const previousTotal = previousSales._sum.total ?? 0;
    const salesChangePercent =
      previousTotal > 0
        ? Math.round(((yesterdayTotal - previousTotal) / previousTotal) * 100)
        : null;
    const suggestions: Array<{
      id: string;
      kind: 'reminder' | 'inventory' | 'sales' | 'planning';
      title: string;
      detail: string;
      actionHref: string;
      actionLabel: string;
    }> = [];

    if (dueReminderCount > 0) {
      suggestions.push({
        id: 'due-reminders',
        kind: 'reminder',
        title: `${dueReminderCount} ${dueReminderCount === 1 ? 'aviso necesita' : 'avisos necesitan'} atención`,
        detail:
          'Puedes marcarlo como hecho, posponerlo o confirmar que ya lo viste.',
        actionHref: '/life#recordatorios',
        actionLabel: 'Revisar avisos',
      });
    }

    if (lowStockProducts.length > 0) {
      suggestions.push({
        id: 'low-stock',
        kind: 'inventory',
        title: `${lowStockProducts.length} ${lowStockProducts.length === 1 ? 'producto tiene' : 'productos tienen'} poca existencia`,
        detail: lowStockProducts
          .slice(0, 3)
          .map((product) => `${product.name}: ${product.available}`)
          .join(' · '),
        actionHref: '/pos/inventario',
        actionLabel: 'Revisar inventario',
      });
    }

    if (salesChangePercent !== null && salesChangePercent <= -15) {
      suggestions.push({
        id: 'sales-down',
        kind: 'sales',
        title: `Las ventas de ayer bajaron ${Math.abs(salesChangePercent)}%`,
        detail:
          'Yalika puede ayudarte a preparar una promoción; tú decides si se publica.',
        actionHref: '/sites#promotions',
        actionLabel: 'Preparar promoción',
      });
    }

    if (todayTaskCount === 0 && overdueTaskCount === 0) {
      suggestions.push({
        id: 'plan-day',
        kind: 'planning',
        title: 'Tu día todavía está libre',
        detail:
          'Puedes dictar una actividad y Yalika la colocará en el espacio correcto.',
        actionHref: '/life#yalika-captura',
        actionLabel: 'Agregar actividad',
      });
    }

    return {
      generatedAt: now,
      greeting: `${greetingFor(now)}, ${userName.split(/\s+/)[0] || userName}`,
      today: {
        count: todayTaskCount,
        tasks: todayTasks,
      },
      overdue: {
        count: overdueTaskCount,
        tasks: overdueTasks,
      },
      tomorrowCount,
      dueReminderCount,
      business: {
        lowStockProducts,
        yesterdaySales: {
          count: yesterdaySales._count.id,
          total: yesterdayTotal,
        },
        previousSales: {
          count: previousSales._count.id,
          total: previousTotal,
        },
        salesChangePercent,
      },
      suggestions: suggestions.slice(0, 3),
    };
  }

  private accessibleTaskScope(actorUserId: string) {
    return {
      OR: [
        { spaceId: null },
        {
          space: {
            type: 'personal',
            ownerUserId: actorUserId,
          },
        },
        {
          space: {
            type: { not: 'personal' },
            members: {
              some: { userId: actorUserId, status: 'active' },
            },
          },
        },
      ],
    };
  }
}
