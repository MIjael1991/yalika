import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/** Cuánto antes avisa el asistente de una visita agendada. */
export const VISIT_REMINDER_MINUTES = 60;

type Role = 'client' | 'worker';

const visitKey = (requestId: string, role: Role) =>
  `tequio:${requestId}:${role}`;
const debtKey = (debtId: string) => `tequio:adeudo:${debtId}`;
const invoiceKey = (requestId: string) => `tequio:factura:${requestId}`;

type TaskInput = {
  key: string;
  userId: string;
  title: string;
  description: string;
  dueAt: Date;
  remindAt: Date;
  leadMinutes: number;
};

/**
 * Lo que el asistente le recuerda a cada quien en "Mi día":
 * - Visitas agendadas: al cliente y al trabajador, una hora antes.
 * - Adeudos por cancelar: al cliente, hasta que quede pagado.
 * Se cierran solos. Si algo falla aquí, el pedido sigue normal (solo se pierde el aviso).
 */
@Injectable()
export class PresenteRemindersService {
  private readonly logger = new Logger('TequioRecordatorios');

  constructor(private readonly prisma: PrismaService) {}

  /** Crea la tarea con su aviso, o si ya existe le cambia el título, la fecha y el aviso. */
  private async upsertTask(input: TaskInput) {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { companyId: true },
    });
    if (!user) return;
    const existing = await this.prisma.task.findUnique({
      where: { dedupeKey: input.key },
      select: { id: true },
    });
    if (existing) {
      await this.prisma.task.update({
        where: { id: existing.id },
        data: { title: input.title, dueAt: input.dueAt },
      });
      await this.prisma.taskReminder.upsert({
        where: { taskId: existing.id },
        create: {
          taskId: existing.id,
          userId: input.userId,
          leadMinutes: input.leadMinutes,
          remindAt: input.remindAt,
          originalRemindAt: input.remindAt,
        },
        update: {
          remindAt: input.remindAt,
          originalRemindAt: input.remindAt,
          status: 'scheduled',
        },
      });
      return;
    }
    await this.prisma.task.create({
      data: {
        title: input.title,
        description: input.description,
        category: 'tequio',
        dueAt: input.dueAt,
        estimatedMinutes: 60,
        dedupeKey: input.key,
        companyId: user.companyId,
        userId: input.userId,
        createdById: input.userId,
        reminder: {
          create: {
            userId: input.userId,
            leadMinutes: input.leadMinutes,
            remindAt: input.remindAt,
            originalRemindAt: input.remindAt,
          },
        },
      },
    });
  }

  private async closeTasks(keys: string[], outcome: 'completed' | 'cancelled') {
    const tasks = await this.prisma.task.findMany({
      where: { dedupeKey: { in: keys } },
      select: { id: true },
    });
    if (!tasks.length) return;
    const ids = tasks.map((t) => t.id);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.task.updateMany({
        where: { id: { in: ids } },
        data: {
          status: outcome,
          dedupeKey: null,
          completedAt: outcome === 'completed' ? now : undefined,
        },
      }),
      this.prisma.taskReminder.updateMany({
        where: { taskId: { in: ids }, status: 'scheduled' },
        data: { status: 'cancelled', cancelledAt: now },
      }),
    ]);
  }

  private warn(what: string, error: unknown) {
    this.logger.warn(
      `No se pudo ${what}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // ---------- Visitas agendadas ----------

  async scheduleVisit(input: {
    requestId: string;
    scheduledFor: Date | null;
    clientUserId: string;
    clientName: string;
    workerUserId: string;
    workerName: string;
    placeLabel: string | null;
  }) {
    const at = input.scheduledFor;
    const now = new Date();
    if (!at || at.getTime() <= now.getTime()) return;
    const place = input.placeLabel ? ` · ${input.placeLabel}` : '';
    const people: [Role, string, string][] = [
      [
        'client',
        input.clientUserId,
        `Tequio: llega ${input.workerName}${place}`,
      ],
      ['worker', input.workerUserId, `Tequio: visita con ${input.clientName}`],
    ];
    const remindAt = new Date(
      Math.max(now.getTime(), at.getTime() - VISIT_REMINDER_MINUTES * 60_000),
    );
    for (const [role, userId, title] of people) {
      try {
        await this.upsertTask({
          key: visitKey(input.requestId, role),
          userId,
          title,
          description:
            'Recordatorio de Yalika. Abre Tequio para ver el pedido, los mensajes y el PIN.',
          dueAt: at,
          remindAt,
          leadMinutes: VISIT_REMINDER_MINUTES,
        });
      } catch (error) {
        this.warn(
          `crear el recordatorio de la visita ${input.requestId}`,
          error,
        );
      }
    }
  }

  /** La visita terminó o se canceló: se quita de "Mi día" de los dos. */
  async closeVisit(requestId: string, outcome: 'completed' | 'cancelled') {
    try {
      await this.closeTasks(
        [visitKey(requestId, 'client'), visitKey(requestId, 'worker')],
        outcome,
      );
    } catch (error) {
      this.warn(`cerrar el recordatorio de la visita ${requestId}`, error);
    }
  }

  // ---------- Adeudos por cancelar ----------

  /** Aviso al cliente de lo que debe; se vuelve a programar mientras no se pague. */
  async remindDebt(input: {
    debtId: string;
    clientUserId: string;
    amountMxn: number;
    workerName: string;
    remindAt: Date;
  }) {
    try {
      await this.upsertTask({
        key: debtKey(input.debtId),
        userId: input.clientUserId,
        title: `Tequio: debes $${input.amountMxn} a ${input.workerName} por cancelar`,
        description:
          'Se suma a tu próximo pedido en Tequio, o págale directo y él lo marca como pagado.',
        dueAt: input.remindAt,
        remindAt: input.remindAt,
        leadMinutes: 0,
      });
    } catch (error) {
      this.warn(`avisar del adeudo ${input.debtId}`, error);
    }
  }

  async closeDebt(debtId: string) {
    try {
      await this.closeTasks([debtKey(debtId)], 'completed');
    } catch (error) {
      this.warn(`cerrar el aviso del adeudo ${debtId}`, error);
    }
  }

  // ---------- Facturas pendientes ----------

  /** Al profesional: mandar la factura que pidió el cliente (antes de que pueda calificarlo sin ella). */
  async remindInvoice(input: {
    requestId: string;
    workerUserId: string;
    clientName: string;
    dueAt: Date;
  }) {
    try {
      await this.upsertTask({
        key: invoiceKey(input.requestId),
        userId: input.workerUserId,
        title: `Tequio: factura pendiente para ${input.clientName}`,
        description:
          'Súbela en tu panel de Tequio (PDF y XML). Si no llega a tiempo, el cliente te califica con «No entregó factura».',
        dueAt: input.dueAt,
        remindAt: new Date(input.dueAt.getTime() - 24 * 3_600_000),
        leadMinutes: 24 * 60,
      });
    } catch (error) {
      this.warn(`recordar la factura de ${input.requestId}`, error);
    }
  }

  async closeInvoice(requestId: string) {
    try {
      await this.closeTasks([invoiceKey(requestId)], 'completed');
    } catch (error) {
      this.warn(`cerrar el recordatorio de factura ${requestId}`, error);
    }
  }
}
