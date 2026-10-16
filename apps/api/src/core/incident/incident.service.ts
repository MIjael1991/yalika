import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateIncidentDto } from './dto/create-incident.dto';

@Injectable()
export class IncidentService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.incident.findMany({
      include: {
        company: true,
        alternatives: true,
      },
      orderBy: {
        occurredAt: 'desc',
      },
    });
  }

  async create(createIncidentDto: CreateIncidentDto) {
    const company = await this.prisma.company.findUnique({
      where: {
        id: createIncidentDto.companyId,
      },
    });

    if (!company) {
      throw new NotFoundException('La empresa no existe');
    }

    return this.prisma.incident.create({
      data: {
        title: createIncidentDto.title.trim(),
        description: createIncidentDto.description?.trim(),
        category: createIncidentDto.category?.trim(),
        severity: createIncidentDto.severity ?? 'medium',
        companyId: createIncidentDto.companyId,
      },
    });
  }

  async generateAlternativesFromKnowledge(incidentId: string) {
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

    if (!incident.category) {
      return {
        message: 'El incidente no tiene una categoría para buscar conocimiento',
        generated: 0,
      };
    }

    const knowledge = await this.prisma.knowledgeTemplate.findFirst({
      where: {
        category: incident.category,
        status: 'active',
      },
      include: {
        alternatives: {
          where: {
            status: 'active',
          },
          orderBy: {
            order: 'asc',
          },
        },
      },
    });

    if (!knowledge) {
      return {
        message:
          'ORION todavía no tiene conocimiento para este tipo de incidente',
        category: incident.category,
        generated: 0,
      };
    }

    const existingTitles = new Set(
      incident.alternatives.map((alternative) =>
        alternative.title.toLowerCase(),
      ),
    );

    const templatesToCreate = knowledge.alternatives.filter(
      (template) => !existingTitles.has(template.title.toLowerCase()),
    );

    if (templatesToCreate.length === 0) {
      return {
        message:
          'Las alternativas de conocimiento ya fueron generadas anteriormente',
        knowledge: knowledge.name,
        generated: 0,
      };
    }

    await this.prisma.incidentAlternative.createMany({
      data: templatesToCreate.map((template) => ({
        title: template.title,
        description: template.description,
        impact: `Alternativa generada automáticamente por ORION Knowledge: ${knowledge.name}`,
        incidentId: incident.id,
      })),
    });

    const generatedAlternatives =
      await this.prisma.incidentAlternative.findMany({
        where: {
          incidentId: incident.id,
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

    return {
      message:
        'ORION encontró conocimiento relacionado y generó alternativas automáticamente',
      knowledge: {
        id: knowledge.id,
        name: knowledge.name,
        category: knowledge.category,
      },
      generated: templatesToCreate.length,
      alternatives: generatedAlternatives,
    };
  }
}
