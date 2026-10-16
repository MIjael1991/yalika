import {
  ConflictException,
  Injectable,
} from '@nestjs/common';

import type { AuthContext } from '../../auth/auth.types';
import { PrismaService } from '../../prisma/prisma.service';
import { TaskService } from '../../core/task/task.service';

@Injectable()
export class ClinicalLifeMaterializerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TaskService,
  ) {}

  async materializeForUser(auth: AuthContext) {
    const events = await this.prisma.clinicalIntegrationEvent.findMany({
      where: {
        userId: auth.user.id,
        status: 'pending',
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    const personalSpace = await this.prisma.space.findFirst({
      where: {
        ownerUserId: auth.user.id,
        status: 'active',
        type: 'personal',
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    const results: Array<{
      eventId: string;
      status: 'delivered' | 'skipped' | 'failed';
      reason?: string;
    }> = [];

    for (const event of events) {
      try {
        const taskInput = this.toTaskInput(event);

        try {
          await this.tasks.create(
            {
              ...taskInput,
              userId: auth.user.id,
              spaceId: personalSpace?.id,
              allowSimilar: true,
            },
            auth.user.id,
            auth.user.companyId,
          );
        } catch (error) {
          // Exact Life duplicates are safe to treat as already materialized.
          if (!(error instanceof ConflictException)) {
            throw error;
          }
        }

        await this.prisma.clinicalIntegrationEvent.update({
          where: { id: event.id },
          data: {
            status: 'delivered',
            deliveredAt: new Date(),
          },
        });

        results.push({ eventId: event.id, status: 'delivered' });
      } catch (error) {
        results.push({
          eventId: event.id,
          status: 'failed',
          reason: error instanceof Error ? error.message : 'Error desconocido',
        });
      }
    }

    return {
      processed: results.length,
      delivered: results.filter((item) => item.status === 'delivered').length,
      failed: results.filter((item) => item.status === 'failed').length,
      results,
    };
  }

  private toTaskInput(event: {
    eventType: string;
    sourceId: string;
    dueAt: Date | null;
    metadata: unknown;
  }) {
    const suffix = event.sourceId.slice(-4).toUpperCase();
    const metadata = (event.metadata ?? {}) as Record<string, unknown>;

    if (event.eventType === 'clinical.consultation.scheduled') {
      return {
        title: `Consulta de salud · ${suffix}`,
        description:
          'Consulta programada desde Yalika Salud. El detalle clínico permanece dentro de Salud.',
        category: 'health_consultation',
        priority: 'normal' as const,
        dueAt: event.dueAt?.toISOString(),
        reminderMinutesBefore: event.dueAt ? 30 : undefined,
      };
    }

    if (event.eventType === 'clinical.medication.reminder.requested') {
      if (!event.dueAt) {
        throw new Error('El recordatorio clínico no tiene hora explícita');
      }
      return {
        title: `Recordatorio de medicamento · ${suffix}`,
        description:
          'Recordatorio creado desde una pauta de Salud con horario explícito.',
        category: 'health_medication',
        priority: 'normal' as const,
        dueAt: event.dueAt.toISOString(),
        reminderMinutesBefore: 0,
      };
    }

    if (event.eventType === 'clinical.medication.supply.pending') {
      const remainingUnits =
        typeof metadata.remainingUnits === 'number'
          ? metadata.remainingUnits
          : null;

      return {
        title: `Medicamento pendiente por surtir · ${suffix}`,
        description:
          remainingUnits === null
            ? 'Revisa el pendiente dentro de Yalika Salud.'
            : `Quedan ${remainingUnits} unidad(es) prescritas por surtir. Revisa el detalle dentro de Salud.`,
        category: 'health_supply',
        priority: 'normal' as const,
      };
    }

    throw new Error(`Evento clínico no materializable: ${event.eventType}`);
  }
}
