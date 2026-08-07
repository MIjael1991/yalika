import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../../prisma/prisma.service';
import { CreateAlternativeDto } from './dto/create-alternative.dto';

@Injectable()
export class AlternativeService {
  constructor(private readonly prisma: PrismaService) {}

  async findByIncident(incidentId: string) {
    return this.prisma.incidentAlternative.findMany({
      where: {
        incidentId,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async create(createAlternativeDto: CreateAlternativeDto) {
    const incident = await this.prisma.incident.findUnique({
      where: {
        id: createAlternativeDto.incidentId,
      },
    });

    if (!incident) {
      throw new NotFoundException('El incidente no existe');
    }

    return this.prisma.incidentAlternative.create({
      data: {
        title: createAlternativeDto.title.trim(),
        description: createAlternativeDto.description?.trim(),
        cost: createAlternativeDto.cost,
        delayMinutes: createAlternativeDto.delayMinutes,
        estimatedLoss: createAlternativeDto.estimatedLoss,
        continuityScore: createAlternativeDto.continuityScore,
        impact: createAlternativeDto.impact?.trim(),
        incidentId: createAlternativeDto.incidentId,
      },
    });
  }

  async analyze(incidentId: string) {
    const incident = await this.prisma.incident.findUnique({
      where: {
        id: incidentId,
      },
      include: {
        alternatives: true,
      },
    });

    if (!incident) {
      throw new NotFoundException('El incidente no existe');
    }

    if (incident.alternatives.length === 0) {
      return {
        incident: incident.title,
        message: 'Todavía no existen alternativas para analizar',
        recommendation: null,
      };
    }

    const analyzed = incident.alternatives.map((alternative) => {
      const cost = alternative.cost ?? 0;
      const estimatedLoss = alternative.estimatedLoss ?? 0;
      const delayMinutes = alternative.delayMinutes ?? 0;
      const continuityScore = alternative.continuityScore ?? 50;

      const totalEconomicImpact = cost + estimatedLoss;

      const score =
        continuityScore -
        Math.min(delayMinutes / 10, 30) -
        Math.min(totalEconomicImpact / 100, 40);

      return {
        ...alternative,
        analysis: {
          totalEconomicImpact,
          score: Number(score.toFixed(2)),
        },
      };
    });

    analyzed.sort(
      (a, b) => b.analysis.score - a.analysis.score,
    );

    const recommendation = analyzed[0];

    return {
      incident: {
        id: incident.id,
        title: incident.title,
        severity: incident.severity,
      },

      recommendation: {
        alternativeId: recommendation.id,
        title: recommendation.title,
        reason:
          'Presenta el mejor equilibrio estimado entre continuidad, tiempo y costo.',
        score: recommendation.analysis.score,
        totalEconomicImpact:
          recommendation.analysis.totalEconomicImpact,
      },

      alternatives: analyzed,

      humanDecisionRequired: true,
    };
  }

  async select(alternativeId: string) {
    const alternative =
      await this.prisma.incidentAlternative.findUnique({
        where: {
          id: alternativeId,
        },
        include: {
          incident: true,
        },
      });

    if (!alternative) {
      throw new NotFoundException('La alternativa no existe');
    }

    if (alternative.incident.status === 'resolved') {
      throw new BadRequestException(
        'El incidente ya está resuelto',
      );
    }

    if (alternative.status === 'selected') {
      throw new BadRequestException(
        'Esta alternativa ya fue seleccionada',
      );
    }

    const now = new Date();

    const results = await this.prisma.$transaction([
      this.prisma.incidentAlternative.updateMany({
        where: {
          incidentId: alternative.incidentId,
        },
        data: {
          status: 'rejected',
        },
      }),

      this.prisma.incidentAlternative.update({
        where: {
          id: alternativeId,
        },
        data: {
          status: 'selected',
        },
      }),

      this.prisma.incident.update({
        where: {
          id: alternative.incidentId,
        },
        data: {
          status: 'in_progress',
        },
      }),

      this.prisma.task.create({
        data: {
          title: `Ejecutar solución: ${alternative.title}`,
          description:
            alternative.description ??
            `Ejecutar la alternativa seleccionada para el incidente: ${alternative.incident.title}`,
          category: 'contingencia',
          priority: 'urgente',
          status: 'pending',
          dueAt: now,
          companyId: alternative.incident.companyId,
        },
      }),

      this.prisma.task.create({
        data: {
          title: `Dar seguimiento: ${alternative.incident.title}`,
          description:
            'Verificar que la solución aplicada haya resuelto el incidente correctamente.',
          category: 'contingencia',
          priority: 'alta',
          status: 'pending',
          dueAt: now,
          companyId: alternative.incident.companyId,
        },
      }),
    ]);

    const executionTask = results[3];
    const followUpTask = results[4];

    return {
      message:
        'Alternativa seleccionada y plan de acción creado correctamente',
      incidentId: alternative.incidentId,
      alternativeId: alternative.id,
      selectedAlternative: alternative.title,
      incidentStatus: 'in_progress',
      humanDecisionConfirmed: true,

      generatedTasks: [
        {
          id: executionTask.id,
          title: executionTask.title,
          priority: executionTask.priority,
        },
        {
          id: followUpTask.id,
          title: followUpTask.title,
          priority: followUpTask.priority,
        },
      ],
    };
  }
}